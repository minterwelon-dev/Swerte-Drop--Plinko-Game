import Phaser from 'phaser';
import { gameConfig } from '../gameConfig';
import type { Risk, Rows } from '../math/config';
import { MockRGS } from '../rgs/MockRGS';
import type { RGS } from '../rgs/RGS';
import { RGSError, type DropResponse, type SeedState } from '../rgs/types';
import { AUTO_STOP_TEXT, AutoPlay, type AutoPlaySettings } from '../state/AutoPlay';
import { PlinkoStateMachine } from '../state/PlinkoStateMachine';
import { AutoPlayPanel } from '../game/AutoPlayPanel';
import { Ball, type BallEvents } from '../game/Ball';
import { BallPool } from '../game/BallPool';
import { Bins, classicBinDefs, tierFor } from '../game/Bins';
import { Board } from '../game/Board';
import { DebugPanel, devRgsOptions } from '../game/DebugPanel';
import { HistoryStrip } from '../game/HistoryStrip';
import { Hud } from '../game/Hud';
import { RetryModal } from '../game/RetryModal';
import { SeedPanel } from '../game/SeedPanel';
import { SoundManager } from '../game/SoundManager';
import { VerifyModal } from '../game/VerifyModal';
import { devAssert } from '../utils/devAssert';
import { modalOpen } from '../utils/dom';
import { currentLayout, RELAYOUT_EVENT, syncViewport } from '../utils/responsive';
import { DEFERRED_READY } from './BootScene';

const MESSAGE_MS = 3000;

/** Wiring only: creates modules, calls the RGS, feeds responses to the state machine and presenters. */
export class GameScene extends Phaser.Scene {
  private rgs!: RGS;
  private sm: PlinkoStateMachine | null = null;
  private sessionId = '';
  private board!: Board;
  private bins!: Bins;
  private pool!: BallPool;
  private hud!: Hud;
  private history!: HistoryStrip;
  private sfx!: SoundManager;
  private autoPanel!: AutoPlayPanel;
  private seedPanel!: SeedPanel;
  private verifyModal!: VerifyModal;
  private retry!: RetryModal;
  private bet = gameConfig.defaultBet;
  private rows: Rows = gameConfig.defaultRows;
  private risk: Risk = gameConfig.defaultRisk;
  private turbo = false;
  private lastWin = 0;
  private message = '';
  private messageMs = 0;
  private auto: AutoPlay | null = null;
  /** An auto drop request is outstanding; auto decisions wait for its result. */
  private autoBusy = false;
  private autoWaitMs = 0;
  private seed: SeedState = { serverSeedHash: '', clientSeed: '', nonce: 0 };
  /** Rounds the client has received, so a retry can tell a lost response from a fresh drop. */
  private readonly known = new Set<string>();
  /** Committed hash -> server seed revealed by rotation (for verify prefill). */
  private readonly revealed = new Map<string, string>();
  private lastRound: DropResponse | null = null;
  private readonly ballEvents: BallEvents = {
    onPeg: (row, peg) => {
      this.board.flashPeg(row, peg);
      this.sfx.tick(row, this.board.geo.rows);
    },
    onLand: (ball) => this.onLand(ball),
  };

  constructor() {
    super('Game');
  }

  create(): void {
    const rgs = new MockRGS({ ...gameConfig.mock, ...(import.meta.env.DEV ? devRgsOptions() : {}) });
    this.rgs = rgs;
    if (import.meta.env.DEV) new DebugPanel(rgs);

    this.board = new Board(this);
    this.bins = new Bins(this);
    this.pool = new BallPool(this, gameConfig.maxBalls);
    this.history = new HistoryStrip(this, gameConfig.historyLength);
    this.sfx = new SoundManager(this);
    this.retry = new RetryModal();
    this.verifyModal = new VerifyModal();
    this.autoPanel = new AutoPlayPanel((s) => this.startAuto(s));
    this.seedPanel = new SeedPanel({
      setClientSeed: (s) => this.setClientSeed(s),
      rotate: () => this.rotateSeed(),
      verify: () => this.openVerify(),
    });
    this.hud = new Hud(this, {
      onDrop: () => void this.drop(false),
      onBet: (step) => this.changeBet(step),
      onRows: (rows) => this.changeBoard(rows, this.risk),
      onRisk: (risk) => this.changeBoard(this.rows, risk),
      onTurbo: () => {
        this.turbo = !this.turbo;
        this.refreshHud();
      },
      onSkip: () => this.pool.skipAll(),
      onAuto: () => this.toggleAuto(),
      onFair: () => this.sm && this.seedPanel.open(this.seed, this.sm.state === 'Idle'),
      onSound: () => {
        this.sfx.toggleMute();
        this.refreshHud();
      },
    });
    this.input.keyboard?.on('keydown-SPACE', () => {
      if (!modalOpen()) void this.drop(false);
    });

    this.game.events.on(RELAYOUT_EVENT, this.relayout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.game.events.off(RELAYOUT_EVENT, this.relayout, this),
    );
    this.relayout();
    this.loadDeferred();
    void this.startSession();
  }

  update(_time: number, dt: number): void {
    // Rotation on some mobile browsers fires no resize event; poll visualViewport every frame.
    syncViewport(this.game);
    if (this.messageMs > 0) {
      this.messageMs -= dt;
      if (this.messageMs <= 0) this.setMessage('');
    }
    this.autoTick(dt);
    this.pool.update(
      dt,
      this.turbo ? gameConfig.turboRowMs : gameConfig.rowMs,
      this.board.geo,
      this.ballEvents,
    );
    this.board.update(dt);
    this.bins.update(dt);
  }

  private async startSession(): Promise<void> {
    try {
      const init = await this.rgs.init();
      this.sessionId = init.sessionId;
      this.seed = init.seed;
      this.sm = new PlinkoStateMachine(init.balance, gameConfig.maxBalls);
      this.resume(init.pending);
    } catch (e) {
      this.setMessage(e instanceof RGSError ? 'Could not connect. Reload to retry.' : String(e));
    }
    this.refreshHud();
  }

  /** Refresh mid-drop: animate rounds the server settled but the player never saw land. */
  private resume(pending: DropResponse[]): void {
    const sm = this.sm;
    if (!sm || pending.length === 0) return;
    devAssert(pending.length <= gameConfig.maxBalls, `${pending.length} pending rounds exceed the ball pool`);
    const rounds = pending.slice(0, gameConfig.maxBalls);
    for (const r of pending.slice(gameConfig.maxBalls)) void this.rgs.ack(r.roundId);
    this.changeBoard(rounds[0].rows, rounds[0].risk);
    sm.resume(rounds);
    for (const r of rounds) {
      const ball = this.pool.acquire();
      ball.hold(this.board.geo);
      this.present(r, ball);
    }
  }

  private loadDeferred(): void {
    // No deferred files yet (sounds are synthesized; feature art arrives in Phase 4); the gate is wired for them.
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.registry.set(DEFERRED_READY, true);
      this.refreshHud();
    });
    this.load.start();
  }

  /** Starts one drop. Resolves with the response, or null if it was cancelled or rejected. */
  private async drop(auto: boolean): Promise<DropResponse | null> {
    const sm = this.sm;
    const bet = this.bet;
    if (!sm || !this.registry.get(DEFERRED_READY)) return null;
    if (auto ? !sm.canAutoDrop(bet) : !sm.canDrop(bet)) return null;
    sm.beginDrop(bet);
    const ball = this.pool.acquire();
    ball.hold(this.board.geo);
    this.refreshHud();

    const res = await this.requestDrop(bet);
    if (!res) {
      ball.release();
      sm.dropFailed(bet);
      this.refreshHud();
      return null;
    }
    devAssert(res.bet === bet, `round ${res.roundId} bet ${res.bet} != requested ${bet}`);
    this.present(res, ball);
    return res;
  }

  /** Sends the drop, offering a retry on network failure. The ball waits at the top meanwhile. */
  private async requestDrop(bet: number): Promise<DropResponse | null> {
    for (;;) {
      try {
        return await this.rgs.drop({ sessionId: this.sessionId, bet, rows: this.rows, risk: this.risk });
      } catch (e) {
        if (!(e instanceof RGSError) || e.code !== 'NETWORK') {
          this.setMessage(
            e instanceof RGSError && e.code === 'INSUFFICIENT_FUNDS' ? 'Insufficient balance' : 'Drop failed',
          );
          return null;
        }
        // The request may have settled with only the response lost: pick it up instead of betting twice.
        const lost = await this.findLostRound();
        if (lost) return lost;
        if (this.auto?.active) this.endAuto('error');
        if (!(await this.retry.ask('The drop did not reach the server. Your bet was not taken.')))
          return null;
      }
    }
  }

  private async findLostRound(): Promise<DropResponse | null> {
    try {
      const { pending } = await this.rgs.init();
      const lost = pending.find((r) => !this.known.has(r.roundId)) ?? null;
      if (lost) this.known.add(lost.roundId);
      return lost;
    } catch {
      return null;
    }
  }

  private present(res: DropResponse, ball: Ball): void {
    devAssert(res.path.reduce((s, x) => s + x, 0) === res.bin, `sum(path) != bin for round ${res.roundId}`);
    devAssert(
      res.rows === this.board.geo.rows,
      `round ${res.roundId} rows ${res.rows} != board ${this.board.geo.rows}`,
    );
    this.known.add(res.roundId);
    this.sm?.serverSettled(res.balance);
    if (res.serverSeedHash === this.seed.serverSeedHash && res.nonce >= this.seed.nonce) {
      this.seed = { ...this.seed, clientSeed: res.clientSeed, nonce: res.nonce + 1 };
    }
    this.lastRound = res;
    ball.launch(res, this.board.geo);
  }

  private onLand(ball: Ball): void {
    const res = ball.res;
    ball.release();
    if (!res || !this.sm) return;
    this.bins.land(res.bin, res.multiplierX100);
    this.history.push(res.multiplierX100);
    this.sfx.land(tierFor(res.multiplierX100));
    this.lastWin = res.win;
    this.sm.ballLanded(res.win);
    void this.rgs.ack(res.roundId).then(() => this.known.delete(res.roundId));
    this.refreshHud();
  }

  // --- Auto-drop ---

  private toggleAuto(): void {
    const sm = this.sm;
    if (!sm) return;
    if (this.auto?.active) return this.endAuto('user');
    if (sm.canStartAuto()) this.autoPanel.open(this.bet, sm.serverBalance);
  }

  private startAuto(settings: AutoPlaySettings): void {
    if (!this.sm?.canStartAuto()) return;
    this.auto = new AutoPlay(settings);
    this.sm.startAuto();
    this.autoWaitMs = 0;
    this.refreshHud();
  }

  private autoTick(dt: number): void {
    const auto = this.auto;
    const sm = this.sm;
    // Pauses while the tab is hidden or a dialog is open.
    if (!auto?.active || !sm || this.autoBusy || document.hidden || modalOpen()) return;
    this.autoWaitMs -= dt;
    if (this.autoWaitMs > 0) return;
    if (!auto.canDrop(this.bet, sm.serverBalance)) return this.endAuto();
    if (!sm.canAutoDrop(this.bet)) return; // all balls in flight; try next frame
    const bet = this.bet;
    this.autoBusy = true;
    this.autoWaitMs = this.turbo ? gameConfig.autoplay.turboIntervalMs : gameConfig.autoplay.intervalMs;
    void this.drop(true).then((res) => {
      this.autoBusy = false;
      if (this.auto !== auto) return;
      if (!res) return this.endAuto('error');
      auto.record(bet, res.win);
      if (!auto.active) this.endAuto();
      else this.refreshHud();
    });
  }

  private endAuto(reason?: Parameters<AutoPlay['stop']>[0]): void {
    const auto = this.auto;
    if (!auto) return;
    if (reason) auto.stop(reason);
    this.auto = null;
    this.sm?.stopAuto();
    this.setMessage(AUTO_STOP_TEXT[auto.stopReason ?? 'user']);
  }

  // --- Provably fair ---

  private async setClientSeed(seed: string): Promise<SeedState> {
    if (this.sm?.state !== 'Idle') throw new Error('Wait for all balls to land');
    this.seed = await this.rgs.setClientSeed(seed);
    return this.seed;
  }

  private async rotateSeed() {
    if (this.sm?.state !== 'Idle') throw new Error('Wait for all balls to land');
    const oldHash = this.seed.serverSeedHash;
    const r = await this.rgs.rotateSeed();
    this.revealed.set(oldHash, r.revealedServerSeed);
    this.seed = { ...this.seed, serverSeedHash: r.newServerSeedHash, nonce: 0 };
    return r;
  }

  private openVerify(): void {
    const r = this.lastRound;
    if (!r)
      return this.verifyModal.open({
        clientSeed: this.seed.clientSeed,
        nonce: 0,
        rows: this.rows,
        risk: this.risk,
      });
    this.verifyModal.open({
      serverSeed: this.revealed.get(r.serverSeedHash) ?? '',
      expectedHash: r.serverSeedHash,
      clientSeed: r.clientSeed,
      nonce: r.nonce,
      rows: r.rows,
      risk: r.risk,
    });
  }

  // --- Settings and layout ---

  private changeBet(step: -1 | 1): void {
    if (this.sm && !this.sm.canChangeBet()) return;
    const levels = gameConfig.betLevels;
    const i = levels.indexOf(this.bet as (typeof levels)[number]);
    this.bet = levels[Math.min(levels.length - 1, Math.max(0, i + step))];
    this.refreshHud();
  }

  private changeBoard(rows: Rows, risk: Risk): void {
    if (this.sm && !this.sm.canChangeBoard()) return;
    const rowsChanged = rows !== this.rows;
    this.rows = rows;
    this.risk = risk;
    if (rowsChanged) this.board.setRows(rows);
    this.bins.setBins(classicBinDefs(rows, risk), this.board.geo);
    this.refreshHud();
  }

  private relayout(): void {
    const layout = currentLayout();
    this.board.relayout(layout, this.rows);
    this.bins.setBins(classicBinDefs(this.rows, this.risk), this.board.geo);
    this.pool.relayout(this.board.geo);
    this.history.relayout(layout);
    this.hud.relayout(layout);
    this.refreshHud();
  }

  private setMessage(text: string): void {
    this.message = text;
    this.messageMs = text ? MESSAGE_MS : 0;
    this.refreshHud();
  }

  private refreshHud(): void {
    const sm = this.sm;
    const autoRunning = !!this.auto?.active;
    this.hud.set({
      balance: sm?.displayBalance ?? 0,
      lastWin: this.lastWin,
      bet: this.bet,
      rows: this.rows,
      risk: this.risk,
      turbo: this.turbo,
      canDrop: !!sm && sm.canDrop(this.bet),
      canChangeBoard: !!sm && sm.canChangeBoard(),
      canChangeBet: !!sm && sm.canChangeBet(),
      canSkip: !!sm && sm.inFlight > 0,
      autoLabel: autoRunning ? `Stop ${this.auto!.roundsLeft}` : 'Auto',
      autoRunning,
      canAuto: !!sm && sm.canStartAuto(),
      soundOn: !this.sfx.muted,
      loading: !this.registry.get(DEFERRED_READY),
      message: this.message,
    });
  }
}
