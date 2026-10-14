import { WIN_CAP_X, type MultiplierX100, type Rows } from './config';
import { analyticalBin } from './drop';
import { derivePath, hmacSha256 } from './fair';

// Stage B Plinko Feature (slot-style bonus). Math parameters, not client config.

export const FEATURE_ROWS: Rows = 12;

export type Jackpot = 'mini' | 'minor' | 'major';

export interface FeatureBin {
  /** Multiple of the triggering bet, in hundredths. */
  multiplierX100: MultiplierX100;
  jackpot?: Jackpot;
}

/** Bins by distance from the centre: coin values, then Mini, Minor and Major at the edges. */
const BY_DISTANCE: readonly FeatureBin[] = [
  { multiplierX100: 50 },
  { multiplierX100: 100 },
  { multiplierX100: 200 },
  { multiplierX100: 500 },
  { multiplierX100: 2_000, jackpot: 'mini' },
  { multiplierX100: 10_000, jackpot: 'minor' },
  { multiplierX100: 100_000, jackpot: 'major' },
];

export const FEATURE_BINS: readonly FeatureBin[] = Array.from(
  { length: FEATURE_ROWS + 1 },
  (_, k) => BY_DISTANCE[Math.abs(k - FEATURE_ROWS / 2)],
);

/** Ball count wheel. Segment size is proportional to weight. */
export const BALL_WHEEL: readonly { balls: number; weight: number }[] = [
  { balls: 10, weight: 30 },
  { balls: 12, weight: 25 },
  { balls: 15, weight: 20 },
  { balls: 20, weight: 13 },
  { balls: 25, weight: 8 },
  { balls: 30, weight: 4 },
];

export const WHEEL_TOTAL_WEIGHT = BALL_WHEEL.reduce((s, w) => s + w.weight, 0);

/** Weighted wheel pick from a uniform uint32: segment i covers its weight's share of [0, 2^32). */
export function pickBallCount(u32: number): number {
  let r = Math.floor((u32 * WHEEL_TOTAL_WEIGHT) / 2 ** 32);
  for (let i = 0; i < BALL_WHEEL.length; i++) {
    r -= BALL_WHEEL[i].weight;
    if (r < 0) return BALL_WHEEL[i].balls;
  }
  throw new Error(`u32 out of range: ${u32}`);
}

export interface FeatureBall {
  path: number[];
  bin: number;
  multiplierX100: MultiplierX100;
  win: number;
  tier?: Jackpot;
}

export interface FeatureOutcome {
  balls: FeatureBall[];
  /** Sum of ball wins, capped at WIN_CAP_X times the bet. */
  totalWin: number;
  capped: boolean;
}

/** Outcome of a feature from its ball paths. Integer money only: bet is a multiple of 100 minor units. */
export function buildFeature(paths: readonly (readonly number[])[], bet: number): FeatureOutcome {
  if (!Number.isSafeInteger(bet) || bet <= 0 || bet % 100 !== 0) throw new Error(`bad bet ${bet}`);
  if (!BALL_WHEEL.some((w) => w.balls === paths.length)) throw new Error(`bad ball count ${paths.length}`);
  const balls: FeatureBall[] = [];
  let sum = 0;
  for (const path of paths) {
    if (path.length !== FEATURE_ROWS) throw new Error(`path length ${path.length} != ${FEATURE_ROWS}`);
    for (let i = 0; i < path.length; i++)
      if (path[i] !== 0 && path[i] !== 1) throw new Error(`bad path bit at ${i}`);
    const bin = analyticalBin(path);
    const def = FEATURE_BINS[bin];
    const win = (bet * def.multiplierX100) / 100;
    sum += win;
    balls.push({
      path: [...path],
      bin,
      multiplierX100: def.multiplierX100,
      win,
      ...(def.jackpot && { tier: def.jackpot }),
    });
  }
  const cap = bet * WIN_CAP_X;
  return { balls, totalWin: Math.min(sum, cap), capped: sum > cap };
}

/**
 * Provably fair feature: nonce N picks the ball count (first 4 HMAC bytes, little-endian uint32),
 * then ball i uses nonce N + 1 + i with the classic path protocol. A feature consumes 1 + balls nonces.
 */
export async function deriveFeature(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  bet: number,
): Promise<FeatureOutcome> {
  const b = await hmacSha256(serverSeed, `${clientSeed}:${nonce}`);
  const count = pickBallCount((b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0);
  const paths: number[][] = [];
  for (let i = 0; i < count; i++)
    paths.push(await derivePath(serverSeed, clientSeed, nonce + 1 + i, FEATURE_ROWS));
  return buildFeature(paths, bet);
}
