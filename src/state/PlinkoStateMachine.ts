import { devAssert } from '../utils/devAssert';

export type PlinkoState =
  | 'Idle'
  | 'Dropping'
  | 'Settling'
  | 'AutoRunning'
  | 'FeatureIntro'
  | 'BallCountWheel'
  | 'FeatureDropping'
  | 'FeatureSummary';

/**
 * Single source of truth for round flow and the display/server balance split.
 * The server settles instantly; the display balance only moves when a drop starts (bet) or a ball lands (win).
 */
export class PlinkoStateMachine {
  state: PlinkoState = 'Idle';
  inFlight = 0;
  displayBalance: number;
  serverBalance: number;
  /** Auto-drop may still start drops. False once it stops while its last balls are landing. */
  autoActive = false;
  private readonly maxBalls: number;

  constructor(balance: number, maxBalls: number) {
    this.displayBalance = balance;
    this.serverBalance = balance;
    this.maxBalls = maxBalls;
  }

  /** Manual drop. */
  canDrop(bet: number): boolean {
    return (this.state === 'Idle' || this.state === 'Dropping') && this.hasRoom(bet);
  }

  canAutoDrop(bet: number): boolean {
    return this.state === 'AutoRunning' && this.autoActive && this.hasRoom(bet);
  }

  canStartAuto(): boolean {
    return this.state === 'Idle';
  }

  /** Bet is locked only while auto-drop runs (its limits were set for that bet). */
  canChangeBet(): boolean {
    return this.state !== 'AutoRunning';
  }

  /** Rows and risk may only change with an empty board. */
  canChangeBoard(): boolean {
    return this.state === 'Idle';
  }

  beginDrop(bet: number): void {
    const auto = this.canAutoDrop(bet);
    if (!auto && !this.canDrop(bet))
      throw new Error(`drop not allowed in ${this.state} with ${this.inFlight} in flight`);
    this.inFlight++;
    this.displayBalance -= bet;
    if (!auto) this.to('Dropping');
  }

  startAuto(): void {
    if (!this.canStartAuto()) throw new Error(`auto-drop cannot start in ${this.state}`);
    this.autoActive = true;
    this.to('AutoRunning');
  }

  /** No new auto drops; the state returns to Idle once in-flight balls land. */
  stopAuto(): void {
    this.autoActive = false;
    if (this.state === 'AutoRunning' && this.inFlight === 0) this.settle();
  }

  /** Refresh mid-drop: rounds settled on the server but never shown. Their wins are credited as they land. */
  resume(rounds: readonly { win: number }[]): void {
    if (rounds.length === 0) return;
    if (this.state !== 'Idle') throw new Error(`resume in ${this.state}`);
    for (const r of rounds) this.displayBalance -= r.win;
    this.inFlight += rounds.length;
    this.to('Dropping');
  }

  /** Request failed before settling: refund the display debit. */
  dropFailed(bet: number): void {
    this.displayBalance += bet;
    this.ballDone();
  }

  /** Server response arrived; its balance already includes this round's win. */
  serverSettled(balance: number): void {
    this.serverBalance = balance;
  }

  ballLanded(win: number): void {
    this.displayBalance += win;
    this.ballDone();
  }

  private ballDone(): void {
    devAssert(this.inFlight > 0, 'ball finished with none in flight');
    this.inFlight--;
    if (this.inFlight > 0) return;
    devAssert(
      this.displayBalance === this.serverBalance,
      `display ${this.displayBalance} != server ${this.serverBalance} with no balls in flight`,
    );
    if (!(this.state === 'AutoRunning' && this.autoActive)) this.settle();
  }

  private hasRoom(bet: number): boolean {
    return this.inFlight < this.maxBalls && this.serverBalance >= bet;
  }

  private settle(): void {
    this.to('Settling');
    this.to('Idle');
  }

  private to(next: PlinkoState): void {
    if (next === this.state) return;
    if (import.meta.env.DEV) console.debug(`[state] ${this.state} -> ${next} (in flight ${this.inFlight})`);
    this.state = next;
  }
}
