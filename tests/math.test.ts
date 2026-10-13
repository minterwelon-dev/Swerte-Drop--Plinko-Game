import { describe, expect, it } from 'vitest';
import { binProbabilities, binWeights } from '../src/math/binomial';
import {
  BET_LEVELS,
  CENTRE_TOLERANCE_X100,
  CLASSIC_MAX_X100,
  RISKS,
  ROWS_OPTIONS,
  RTP_MAX,
  RTP_MIN,
  TUNER_SHAPE,
  WIN_CAP_X,
} from '../src/math/config';
import { analyticalBin, buildDrop } from '../src/math/drop';
import { MULTIPLIERS } from '../src/math/multipliers';
import { Rng } from '../src/math/rng';
import { chiSquare } from '../src/math/stats';
import { analyticalRtp } from '../src/math/tuner';

const tables = RISKS.flatMap((risk) =>
  ROWS_OPTIONS.map((rows) => ({ risk, rows, t: MULTIPLIERS[risk][rows] })),
);

describe('binomial', () => {
  it('probabilities sum to 1 and weights to 2^n', () => {
    for (const n of ROWS_OPTIONS) {
      expect(binProbabilities(n).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
      expect(binWeights(n).reduce((a, b) => a + b, 0)).toBe(2 ** n);
    }
  });

  it('matches the brief for 8 rows', () => {
    expect(binWeights(8)).toEqual([1, 8, 28, 56, 70, 56, 28, 8, 1]);
  });
});

describe('multiplier tables', () => {
  it('has all 15 tables', () => expect(tables).toHaveLength(15));

  it.each(tables)('$rows rows / $risk: RTP in window', ({ t }) => {
    const rtp = analyticalRtp(t);
    expect(rtp).toBeGreaterThanOrEqual(RTP_MIN);
    expect(rtp).toBeLessThanOrEqual(RTP_MAX);
  });

  it.each(tables)('$rows rows / $risk: shape', ({ risk, rows, t }) => {
    expect(t).toHaveLength(rows + 1);
    const h = rows / 2;
    for (let k = 0; k <= rows; k++) {
      expect(Number.isInteger(t[k])).toBe(true);
      expect(t[k]).toBe(t[rows - k]); // symmetric
    }
    for (let k = h; k < rows; k++) expect(t[k + 1]).toBeGreaterThanOrEqual(t[k]); // non-decreasing from centre
    expect(Math.abs(t[h] - TUNER_SHAPE[risk].centre * 100)).toBeLessThanOrEqual(CENTRE_TOLERANCE_X100);
    expect(Math.max(...t)).toBeLessThanOrEqual(CLASSIC_MAX_X100); // classic max <= 1000x, below the cap
  });
});

describe('drop', () => {
  it('bin = sum(path), always in [0, rows], money is integer', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 5000; i++) {
      const rows = ROWS_OPTIONS[i % ROWS_OPTIONS.length];
      const risk = RISKS[i % RISKS.length];
      const bet = BET_LEVELS[i % BET_LEVELS.length];
      const path = Array.from({ length: rows }, () => rng.nextU32() & 1);
      const d = buildDrop(path, bet, rows, risk);
      expect(d.bin).toBe(analyticalBin(path));
      expect(d.bin).toBeGreaterThanOrEqual(0);
      expect(d.bin).toBeLessThanOrEqual(rows);
      expect(Number.isSafeInteger(d.win)).toBe(true);
      expect(d.win).toBe((bet * MULTIPLIERS[risk][rows][d.bin]) / 100);
      expect(d.win).toBeLessThanOrEqual(bet * WIN_CAP_X);
    }
  });

  it('rejects malformed input', () => {
    expect(() => buildDrop([0, 1], 100, 8, 'low')).toThrow();
    expect(() => buildDrop([0, 1, 2, 0, 0, 0, 0, 0], 100, 8, 'low')).toThrow();
    expect(() => buildDrop(new Array(8).fill(0), 150, 8, 'low')).toThrow();
  });
});

describe('distribution', () => {
  it('chi-square of simulated bins passes on a fixed seed', () => {
    for (const rows of ROWS_OPTIONS) {
      const rng = new Rng(42 + rows);
      const counts = new Array<number>(rows + 1).fill(0);
      for (let i = 0; i < 200_000; i++) {
        let bin = 0;
        const bits = rng.nextU32();
        for (let r = 0; r < rows; r++) bin += (bits >>> r) & 1;
        counts[bin]++;
      }
      expect(chiSquare(counts, binProbabilities(rows)).p).toBeGreaterThan(0.001);
    }
  });

  it('chi-square p-value matches known values', () => {
    // df 2: p = exp(-x/2). Uniform observed = expected gives p = 1.
    expect(chiSquare([60, 20, 20], [1 / 3, 1 / 3, 1 / 3]).p).toBeCloseTo(Math.exp(-16), 10);
    expect(chiSquare([10, 10], [0.5, 0.5]).p).toBeCloseTo(1, 10);
  });
});
