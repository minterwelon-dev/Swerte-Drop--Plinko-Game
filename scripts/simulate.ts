// RTP / volatility / distribution report. Imports src/math only.
// Usage: npm run simulate -- --rows 16 --risk high --drops 10000000 --seed 42
//        npm run simulate -- --feature --features 1000000 --seed 42
//        npm run simulate -- --all [--drops N] [--features N] [--seed S]   (writes docs/simulation-report.txt)
import { mkdirSync, writeFileSync } from 'node:fs';
import { binProbabilities } from '../src/math/binomial';
import { RISKS, ROWS_OPTIONS, WIN_CAP_X, type Risk, type Rows } from '../src/math/config';
import {
  BALL_WHEEL,
  FEATURE_BINS,
  FEATURE_ROWS,
  pickBallCount,
  WHEEL_TOTAL_WEIGHT,
  type Jackpot,
} from '../src/math/feature';
import { MULTIPLIERS } from '../src/math/multipliers';
import { Rng } from '../src/math/rng';
import { chiSquare } from '../src/math/stats';
import { analyticalRtp } from '../src/math/tuner';

const SESSION_DROPS = 1000;

function popcount(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function pct(x: number, digits = 4): string {
  return `${(x * 100).toFixed(digits)}%`;
}

// Paths come from the seedable PRNG, not HMAC: the 50/50 bit model is identical and 10M HMACs per table
// would take minutes. fair.ts determinism is covered by the Vitest suite instead.
export function simulateTable(rows: Rows, risk: Risk, drops: number, seed: number): string {
  const table = MULTIPLIERS[risk][rows];
  const rng = new Rng(seed);
  const mask = (1 << rows) - 1;
  const counts = new Array<number>(rows + 1).fill(0);
  let sum = 0;
  let sumSq = 0;
  let hits = 0;
  let wins = 0;
  let maxM = 0;
  let streak = 0;
  let longestStreak = 0;
  const drawdowns: number[] = [];
  let net = 0;
  let peak = 0;
  let worst = 0;

  for (let i = 0; i < drops; i++) {
    const bin = popcount(rng.nextU32() & mask);
    counts[bin]++;
    const m = table[bin];
    const r = m / 100;
    sum += r;
    sumSq += r * r;
    if (m >= 100) hits++;
    if (m > 0) wins++;
    if (m > maxM) maxM = m;
    if (m < 100) {
      if (++streak > longestStreak) longestStreak = streak;
    } else streak = 0;

    net += r - 1;
    if (net > peak) peak = net;
    if (peak - net > worst) worst = peak - net;
    if ((i + 1) % SESSION_DROPS === 0) {
      drawdowns.push(worst);
      net = 0;
      peak = 0;
      worst = 0;
    }
  }

  const mean = sum / drops;
  const sd = Math.sqrt(sumSq / drops - mean * mean);
  const se = sd / Math.sqrt(drops);
  const ana = analyticalRtp(table);
  const z = (mean - ana) / se;
  const probs = binProbabilities(rows);
  const chi = chiSquare(counts, probs);
  drawdowns.sort((a, b) => a - b);
  const p99 = drawdowns.length
    ? drawdowns[Math.min(drawdowns.length - 1, Math.floor(drawdowns.length * 0.99))]
    : NaN;

  const out: string[] = [];
  out.push(`== ${rows} rows / ${risk}  (${drops.toLocaleString('en-US')} drops, seed ${seed})`);
  out.push(`Analytical RTP      ${pct(ana)}`);
  out.push(
    `Simulated RTP       ${pct(mean)}  SE ${pct(se)}  z ${z.toFixed(2)}  ${Math.abs(z) <= 3 ? 'OK (within 3 SE)' : 'OUTSIDE 3 SE'}`,
  );
  out.push(`Hit freq (>= 1.00x) ${pct(hits / drops, 3)}   Win freq (> 0x) ${pct(wins / drops, 3)}`);
  out.push(`Per-drop return     mean ${mean.toFixed(4)}  sd ${sd.toFixed(4)}`);
  out.push(`Max multiplier      ${(maxM / 100).toFixed(2)}x (table max ${(table[0] / 100).toFixed(2)}x)`);
  out.push(`Longest losing run  ${longestStreak} drops (< 1.00x)`);
  out.push(
    `P99 drawdown        ${p99.toFixed(2)} bets over ${SESSION_DROPS}-drop sessions (${drawdowns.length} sessions)`,
  );
  out.push(
    `Chi-square          ${chi.stat.toFixed(2)} df ${chi.df}  p ${chi.p.toFixed(4)}  ${chi.p > 0.001 ? 'OK' : 'FAIL'}`,
  );
  out.push('  bin  mult      expected      observed');
  for (let k = 0; k <= rows; k++) {
    out.push(
      `  ${String(k).padStart(3)}  ${(table[k] / 100).toFixed(2).padStart(7)}x  ${probs[k].toFixed(7)}  ${(counts[k] / drops).toFixed(7)}`,
    );
  }
  return out.join('\n');
}

// Feature round: wheel pick and ball bins from the seedable PRNG with the same pickBallCount and bit model.
export function simulateFeature(features: number, seed: number): string {
  const rng = new Rng(seed);
  const mask = (1 << FEATURE_ROWS) - 1;
  const capX100 = WIN_CAP_X * 100;
  const probs = binProbabilities(FEATURE_ROWS);
  const tiers: Jackpot[] = ['mini', 'minor', 'major'];
  const ballHits: Record<Jackpot, number> = { mini: 0, minor: 0, major: 0 };
  const featureHits: Record<Jackpot, number> = { mini: 0, minor: 0, major: 0 };
  const countSeen = new Map<number, number>();
  let balls = 0;
  let sum = 0;
  let sumSq = 0;
  let maxX100 = 0;
  let capped = 0;

  for (let f = 0; f < features; f++) {
    const n = pickBallCount(rng.nextU32());
    countSeen.set(n, (countSeen.get(n) ?? 0) + 1);
    balls += n;
    let totalX100 = 0;
    let mini = false;
    let minor = false;
    let major = false;
    for (let b = 0; b < n; b++) {
      const bin = FEATURE_BINS[popcount(rng.nextU32() & mask)];
      totalX100 += bin.multiplierX100;
      if (bin.jackpot === 'mini') mini = true;
      else if (bin.jackpot === 'minor') minor = true;
      else if (bin.jackpot === 'major') major = true;
      if (bin.jackpot) ballHits[bin.jackpot]++;
    }
    if (mini) featureHits.mini++;
    if (minor) featureHits.minor++;
    if (major) featureHits.major++;
    if (totalX100 > capX100) {
      capped++;
      totalX100 = capX100;
    }
    if (totalX100 > maxX100) maxX100 = totalX100;
    const x = totalX100 / 100;
    sum += x;
    sumSq += x * x;
  }

  let meanBalls = 0;
  for (const w of BALL_WHEEL) meanBalls += (w.balls * w.weight) / WHEEL_TOTAL_WEIGHT;
  let perBall = 0;
  for (let k = 0; k <= FEATURE_ROWS; k++) perBall += (probs[k] * FEATURE_BINS[k].multiplierX100) / 100;
  const ana = meanBalls * perBall;
  const mean = sum / features;
  const sd = Math.sqrt(Math.max(0, sumSq / features - mean * mean));
  const se = sd / Math.sqrt(features);
  const z = (mean - ana) / se;

  const out: string[] = [];
  out.push(
    `== Plinko Feature: ${FEATURE_ROWS} rows  (${features.toLocaleString('en-US')} features, seed ${seed})`,
  );
  out.push(
    `Analytical mean     ${ana.toFixed(4)}x bet (uncapped: ${meanBalls.toFixed(2)} balls x ${perBall.toFixed(4)}x)`,
  );
  out.push(
    `Simulated mean      ${mean.toFixed(4)}x  SE ${se.toFixed(4)}  z ${z.toFixed(2)}  ${Math.abs(z) <= 3 ? 'OK (within 3 SE)' : 'OUTSIDE 3 SE'}`,
  );
  out.push(`Per-feature total   sd ${sd.toFixed(4)}x   max ${(maxX100 / 100).toFixed(2)}x`);
  out.push(`Cap (${WIN_CAP_X}x) hit     ${capped} features (${pct(capped / features, 6)})`);
  out.push(`Mean balls          ${(balls / features).toFixed(4)} (expected ${meanBalls.toFixed(4)})`);
  out.push('  balls  weight   expected   observed');
  for (const w of BALL_WHEEL) {
    out.push(
      `  ${String(w.balls).padStart(5)}  ${String(w.weight).padStart(6)}   ${(w.weight / WHEEL_TOTAL_WEIGHT).toFixed(4)}     ${((countSeen.get(w.balls) ?? 0) / features).toFixed(4)}`,
    );
  }
  out.push('  tier   mult       per ball exp   per ball obs   features with >= 1');
  for (const t of tiers) {
    const k = FEATURE_BINS.findIndex((b) => b.jackpot === t);
    const exp = 2 * probs[k];
    out.push(
      `  ${t.padEnd(5)}  ${(FEATURE_BINS[k].multiplierX100 / 100).toFixed(2).padStart(7)}x  ${exp.toFixed(7)}      ${(ballHits[t] / balls).toFixed(7)}      ${pct(featureHits[t] / features, 3)}`,
    );
  }
  return out.join('\n');
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const drops = Number(arg('drops') ?? 10_000_000);
const seed = Number(arg('seed') ?? 42);
if (!Number.isSafeInteger(drops) || drops <= 0) throw new Error('--drops must be a positive integer');
if (!Number.isSafeInteger(seed)) throw new Error('--seed must be an integer');
const features = Number(arg('features') ?? 1_000_000);
if (!Number.isSafeInteger(features) || features <= 0)
  throw new Error('--features must be a positive integer');

if (process.argv.includes('--all')) {
  const sections = [
    'Swerte Drop simulation report (play money, simulated RTP; not a certified RNG).',
    `Generated by: npm run simulate -- --all --drops ${drops} --features ${features} --seed ${seed}`,
    '',
  ];
  let i = 0;
  for (const risk of RISKS) {
    for (const rows of ROWS_OPTIONS) {
      // Each table gets its own stream so tables are independent but reproducible.
      const s = simulateTable(rows, risk, drops, seed + i++);
      console.log(s.split('\n').slice(0, 3).join('\n'));
      sections.push(s, '');
    }
  }
  const f = simulateFeature(features, seed + i);
  console.log(f.split('\n').slice(0, 3).join('\n'));
  sections.push(f, '');
  mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../docs/simulation-report.txt', import.meta.url), sections.join('\n'));
  console.log('wrote docs/simulation-report.txt');
} else if (process.argv.includes('--feature')) {
  console.log(simulateFeature(features, seed));
} else {
  const rows = Number(arg('rows') ?? 16) as Rows;
  const risk = (arg('risk') ?? 'high') as Risk;
  if (!(ROWS_OPTIONS as readonly number[]).includes(rows))
    throw new Error(`--rows must be one of ${ROWS_OPTIONS.join(', ')}`);
  if (!(RISKS as readonly string[]).includes(risk))
    throw new Error(`--risk must be one of ${RISKS.join(', ')}`);
  console.log(simulateTable(rows, risk, drops, seed));
}
