/** Auto-drop limits in minor units. A loss limit is required; the other stops are optional (null = off). */
export interface AutoPlaySettings {
  rounds: number;
  lossLimit: number;
  singleWinStop: number | null;
  profitStop: number | null;
  balanceBelow: number | null;
}

export type AutoStopReason =
  'rounds' | 'lossLimit' | 'singleWin' | 'profit' | 'balanceBelow' | 'insufficientBalance' | 'error' | 'user';

export const AUTO_STOP_TEXT: Record<AutoStopReason, string> = {
  rounds: 'Auto-drop finished',
  lossLimit: 'Auto-drop stopped: loss limit reached',
  singleWin: 'Auto-drop stopped: single win limit reached',
  profit: 'Auto-drop stopped: win limit reached',
  balanceBelow: 'Auto-drop stopped: balance limit reached',
  insufficientBalance: 'Auto-drop stopped: insufficient balance',
  error: 'Auto-drop stopped: connection problem',
  user: 'Auto-drop stopped',
};

/** Returns an error message, or null when the settings may start. */
export function validateAutoSettings(s: AutoPlaySettings, bet: number, balance: number): string | null {
  const positiveInt = (v: number) => Number.isSafeInteger(v) && v > 0;
  if (!positiveInt(s.rounds)) return 'Choose a number of rounds';
  if (!positiveInt(s.lossLimit)) return 'A loss limit is required';
  if (s.lossLimit < bet) return 'Loss limit must be at least one bet';
  if (s.singleWinStop !== null && !positiveInt(s.singleWinStop)) return 'Single win limit must be positive';
  if (s.profitStop !== null && !positiveInt(s.profitStop)) return 'Win limit must be positive';
  if (s.balanceBelow !== null && !positiveInt(s.balanceBelow)) return 'Balance limit must be positive';
  if (balance < bet) return 'Insufficient balance';
  if (s.balanceBelow !== null && balance < s.balanceBelow)
    return 'Balance is already below the balance limit';
  return null;
}

/**
 * Auto-drop controller. Decisions use server results (responses), not the animation, so limits are exact:
 * a drop is only allowed if losing its whole bet cannot push the session past the loss limit.
 */
export class AutoPlay {
  readonly settings: AutoPlaySettings;
  roundsLeft: number;
  /** Sum of (win - bet) over settled auto rounds. */
  net = 0;
  stopReason: AutoStopReason | null = null;

  constructor(settings: AutoPlaySettings) {
    this.settings = settings;
    this.roundsLeft = settings.rounds;
  }

  get active(): boolean {
    return this.stopReason === null;
  }

  /** Call before each auto drop with the current server balance. Stops and returns false if a limit applies. */
  canDrop(bet: number, balance: number): boolean {
    if (!this.active) return false;
    const s = this.settings;
    if (this.roundsLeft <= 0) return this.stop('rounds');
    if (s.balanceBelow !== null && balance < s.balanceBelow) return this.stop('balanceBelow');
    if (balance < bet) return this.stop('insufficientBalance');
    if (-this.net + bet > s.lossLimit) return this.stop('lossLimit');
    return true;
  }

  /** Call with each settled auto round. */
  record(bet: number, win: number): void {
    this.roundsLeft--;
    this.net += win - bet;
    const s = this.settings;
    if (s.singleWinStop !== null && win >= s.singleWinStop) this.stop('singleWin');
    else if (s.profitStop !== null && this.net >= s.profitStop) this.stop('profit');
    else if (-this.net >= s.lossLimit) this.stop('lossLimit');
    else if (this.roundsLeft <= 0) this.stop('rounds');
  }

  stop(reason: AutoStopReason): false {
    if (this.stopReason === null) this.stopReason = reason;
    return false;
  }
}
