import { binWeights } from './binomial';
import {
  CENTRE_TOLERANCE_X100,
  CLASSIC_MAX_X100,
  RTP_MAX,
  RTP_MIN,
  TARGET_RTP,
  type MultiplierTable,
  type Rows,
} from './config';

/** Analytical RTP of an x100 table: sum C(n,k) * m_k / (100 * 2^n). */
export function analyticalRtp(table: MultiplierTable): number {
  const n = table.length - 1;
  const w = binWeights(n);
  let s = 0;
  for (let k = 0; k <= n; k++) s += w[k] * table[k];
  return s / (100 * 2 ** n);
}

function shape(rows: Rows, centre: number, beta: number, alpha: number): number[] {
  const h = rows / 2;
  const m: number[] = [];
  for (let k = 0; k <= rows; k++) m.push(centre * Math.exp(alpha * Math.abs(k - h) ** beta));
  return m;
}

function floatRtp(m: number[]): number {
  const n = m.length - 1;
  const w = binWeights(n);
  let s = 0;
  for (let k = 0; k <= n; k++) s += w[k] * m[k];
  return s / 2 ** n;
}

/**
 * Build one table. Constraint order (PROJECT_BRIEF §2.4):
 * 1. RTP in window (hard)  2. symmetric, non-decreasing from centre
 * 3. centre within ±0.05x of the risk's centre  4. max near guidance (soft, reported)
 */
export function tuneTable(rows: Rows, centre: number, beta: number): number[] {
  // RTP rises monotonically with alpha; bisect.
  let lo = 0;
  let hi = 10;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (floatRtp(shape(rows, centre, beta, mid)) < TARGET_RTP) lo = mid;
    else hi = mid;
  }
  const h = rows / 2;
  const table = shape(rows, centre, beta, (lo + hi) / 2).map((x) =>
    Math.min(Math.round(x * 100), CLASSIC_MAX_X100),
  );

  // Cancel rounding drift greedily from the centre outward: each symmetric bin pair absorbs what it can,
  // so the residual ends below the edge weight. A centre-only nudge is too coarse (1/100 at 16 rows ~ 0.2% RTP).
  const w = binWeights(rows);
  let residual = TARGET_RTP * 100 * 2 ** rows;
  for (let k = 0; k <= rows; k++) residual -= w[k] * table[k];
  for (let d = 0; d <= h; d++) {
    const pairWeight = d === 0 ? w[h] : 2 * w[h - d];
    const delta = Math.round(residual / pairWeight);
    table[h - d] += delta;
    if (d > 0) table[h + d] += delta;
    residual -= delta * pairWeight;
  }

  const centreX100 = Math.round(centre * 100);
  if (Math.abs(table[h] - centreX100) > CENTRE_TOLERANCE_X100)
    throw new Error(`rows ${rows}: centre ${table[h]} drifted`);
  for (let k = h; k < rows; k++) {
    if (table[k + 1] < table[k]) throw new Error(`rows ${rows}: not non-decreasing at bin ${k + 1}`);
  }

  const rtp = analyticalRtp(table);
  if (rtp < RTP_MIN || rtp > RTP_MAX) throw new Error(`rows ${rows}: RTP ${rtp} outside window after nudge`);
  return table;
}
