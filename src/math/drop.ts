import { MULTIPLIERS } from './multipliers';
import { WIN_CAP_X, type MultiplierX100, type Risk, type Rows } from './config';

export interface DropOutcome {
  path: number[];
  bin: number;
  multiplierX100: MultiplierX100;
  win: number;
}

/** Landing bin = number of right moves. */
export function analyticalBin(path: readonly number[]): number {
  let bin = 0;
  for (let i = 0; i < path.length; i++) bin += path[i];
  return bin;
}

export function multiplierFor(rows: Rows, risk: Risk, bin: number): MultiplierX100 {
  return MULTIPLIERS[risk][rows][bin];
}

/** Outcome part of a DropResponse. Integer money only: bet is a multiple of 100 minor units. */
export function buildDrop(path: readonly number[], bet: number, rows: Rows, risk: Risk): DropOutcome {
  if (path.length !== rows) throw new Error(`path length ${path.length} != rows ${rows}`);
  for (let i = 0; i < rows; i++) if (path[i] !== 0 && path[i] !== 1) throw new Error(`bad path bit at ${i}`);
  if (!Number.isSafeInteger(bet) || bet <= 0 || bet % 100 !== 0) throw new Error(`bad bet ${bet}`);
  const bin = analyticalBin(path);
  const multiplierX100 = multiplierFor(rows, risk, bin);
  // Defensive clamp only: classic tables max out at 1000x, below the 5000x cap.
  const win = Math.min((bet * multiplierX100) / 100, bet * WIN_CAP_X);
  return { path: [...path], bin, multiplierX100, win };
}
