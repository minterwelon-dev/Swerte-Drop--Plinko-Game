import Phaser from 'phaser';
import { gameConfig } from '../gameConfig';
import type { Risk, Rows } from '../math/config';
import { FEATURE_ROWS } from '../math/feature';
import { MockRGS } from '../rgs/MockRGS';
import type { RGS } from '../rgs/RGS';
import { RGSError, type DropResponse, type FeatureResult, type SeedState } from '../rgs/types';
import { AUTO_STOP_TEXT, AutoPlay, type AutoPlaySettings } from '../state/AutoPlay';
import { PlinkoStateMachine } from '../state/PlinkoStateMachine';
import { AutoPlayPanel } from '../game/AutoPlayPanel';
import { Ball, type BallEvents, type BallRound } from '../game/Ball';
import { BallPool } from '../game/BallPool';
import { Bins, classicBinDefs, featureBinDefs } from '../game/Bins';
import { Board } from '../game/Board';
import { DebugPanel, devRgsOptions } from '../game/DebugPanel';
import { FeatureOverlay } from '../game/FeatureOverlay';
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

/** A feature round being presented: balls launch in sequence and credit the display balance as they land. */
interface FeatureRun {
  res: FeatureResult;
  balls: BallRound[];
  /** Next ball to launch. */
  next: number;
  flying: number;
  landed: number;
  /** Uncapped sum of landed wins; credits stop at the server's capped total. */
  sum: number;
  credited: number;
  waitMs: number;
  skip: boolean;
  done: () => void;
}

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
  private overlay!: FeatureOverlay;
  private feat: FeatureRun | null = null;
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
    onLand: (ball) => (this.feat ? this.onFeatureLand(ball) : this.onLand(ball)),
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
    this.overlay = new FeatureOverlay(this);
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
      onSkip: () => {
        this.pool.skipAll();
        this.overlay.skip();
        if (this.feat) this.feat.skip = true;
      },
      onAuto: () => this.toggleAuto(),
      onFair: () => this.sm && this.seedPanel.open(this.seed, this.sm.state === 'Idle'),
      onFeature: () => void this.triggerFeature(),
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
    this.featureTick(dt);
    this.overlay.update(dt);
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
      if (init.pendingFeature) void this.resumeFeature(init.pendingFeature);
      else this.resume(init.pending);
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
    // No deferred files yet (sounds are synthesized, feature art is drawn at runtime); the gate is wired for them.
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
    this.bins.land(res.bin);
    this.history.push(res.multiplierX100);
    this.sfx.land(this.bins.tierOf(res.bin));
    this.lastWin = res.win;
    this.sm.ballLanded(res.win);
    void this.rgs.ack(res.roundId).then(() => this.known.delete(res.roundId));
    this.refreshHud();
  }

  // --- Stage B Plinko Feature ---

  /** Simulated scatter trigger. The request runs while the intro plays. */
  private async triggerFeature(): Promise<void> {
    const sm = this.sm;
    if (!sm?.canStartFeature() || !this.registry.get(DEFERRED_READY)) return;
    sm.startFeature();
    this.refreshHud();
    const request = this.requestFeature(this.bet);
    await this.overlay.intro('Scatter trigger!\nTap to spin');
    const res = await request;
    if (!res) {
      this.overlay.hide();
      sm.endFeature();
      this.refreshHud();
      return;
    }
    await this.playFeature(res);
  }

  /** Refresh mid-feature: replay the settled feature; its total is credited as the balls land again. */
  private async resumeFeature(res: FeatureResult): Promise<void> {
    this.sm?.resumeFeature(res.totalWin);
    this.refreshHud();
    await this.overlay.intro('Resuming your feature');
    await this.playFeature(res);
  }

  private async requestFeature(bet: number): Promise<FeatureResult | null> {
    for (;;) {
      try {
        const { serverSeedHash, clientSeed } = this.seed;
        return await this.rgs.feature({
          sessionId: this.sessionId,
          bet,
          seedRef: { serverSeedHash, clientSeed },
        });
      } catch (e) {
        if (!(e instanceof RGSError) || e.code !== 'NETWORK') {
          this.setMessage('Feature failed');
          return null;
        }
        // A feature that settled with only the response lost is picked up instead of played twice.
        const lost = await this.rgs.init().then(
          (i) => i.pendingFeature,
          () => null,
        );
        if (lost) return lost;
        if (!(await this.retry.ask('The feature request did not reach the server.'))) return null;
      }
    }
  }

  private async playFeature(res: FeatureResult): Promise<void> {
    const sm = this.sm;
    if (!sm) return;
    for (const b of res.balls)
      devAssert(b.path.reduce((s, x) => s + x, 0) === b.bin, `sum(path) != bin in feature ${res.roundId}`);
    sm.serverSettled(res.balance);
    if (res.serverSeedHash === this.seed.serverSeedHash)
      this.seed = { ...this.seed, nonce: Math.max(this.seed.nonce, res.nonce + 1 + res.balls.length) };

    sm.featureStep('BallCountWheel');
    this.refreshHud();
    await this.overlay.spin(res.balls.length, this.turbo);

    sm.featureStep('FeatureDropping');
    await new Promise<void>((done) => {
      const balls = res.balls.map((b) => ({ ...b, roundId: res.roundId }));
      this.feat = {
        res,
        balls,
        next: 0,
        flying: 0,
        landed: 0,
        sum: 0,
        credited: 0,
        waitMs: 0,
        skip: false,
        done,
      };
      this.showBoard();
      this.overlay.running(0, balls.length, 0, false);
      this.refreshHud();
    });

    sm.featureStep('FeatureSummary');
    this.lastWin = res.totalWin;
    this.refreshHud();
    await this.overlay.summary(res);
    this.feat = null;
    this.overlay.hide();
    this.showBoard();
    sm.endFeature();
    void this.rgs.ack(res.roundId);
    this.refreshHud();
  }

  /** Launches feature balls in a rapid sequence, at most maxBalls in flight. Skip launches the rest at once. */
  private featureTick(dt: number): void {
    const f = this.feat;
    if (!f || f.next >= f.balls.length) return;
    f.waitMs -= dt;
    while (f.next < f.balls.length && f.flying < gameConfig.maxBalls && (f.skip || f.waitMs <= 0)) {
      const ball = this.pool.acquire();
      ball.hold(this.board.geo);
      ball.launch(f.balls[f.next++], this.board.geo);
      ball.skipping = f.skip;
      f.flying++;
      f.waitMs = this.turbo ? gameConfig.feature.turboLaunchMs : gameConfig.feature.launchMs;
    }
  }

  private onFeatureLand(ball: Ball): void {
    const f = this.feat;
    const r = ball.res;
    ball.release();
    if (!f || !r || !this.sm) return;
    f.flying--;
    f.landed++;
    f.sum += r.win;
    this.bins.land(r.bin);
    this.sfx.land(this.bins.tierOf(r.bin));
    const credit = Math.min(f.sum, f.res.totalWin) - f.credited;
    f.credited += credit;
    this.sm.featureCredit(credit);
    this.overlay.running(f.landed, f.balls.length, f.credited, f.res.capped && f.credited === f.res.totalWin);
    if (f.landed === f.balls.length) f.done();
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
    this.showBoard(layout);
    this.pool.relayout(this.board.geo);
    this.history.relayout(layout);
    this.hud.relayout(layout);
    this.overlay.relayout(layout);
    this.refreshHud();
  }

  /** The feature board while a feature drops, else the classic board for the selected rows and risk. */
  private showBoard(layout = currentLayout()): void {
    this.board.relayout(layout, this.feat ? FEATURE_ROWS : this.rows);
    this.bins.setBins(this.feat ? featureBinDefs() : classicBinDefs(this.rows, this.risk), this.board.geo);
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
      canSkip: !!sm && (sm.inFlight > 0 || this.feat !== null),
      autoLabel: autoRunning ? `Stop ${this.auto!.roundsLeft}` : 'Auto',
      autoRunning,
      canAuto: !!sm && sm.canStartAuto(),
      canFeature: !!sm && sm.canStartFeature() && !!this.registry.get(DEFERRED_READY),
      soundOn: !this.sfx.muted,
      loading: !this.registry.get(DEFERRED_READY),
      message: this.message,
    });
  }
}
