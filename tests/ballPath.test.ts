import { describe, expect, it } from 'vitest';
import { LAYOUT } from '../src/constants';
import { BoardGeometry, buildWaypoints } from '../src/game/BallPath';
import { ROWS_OPTIONS } from '../src/math/config';
import { Rng } from '../src/math/rng';

describe('BallPath', () => {
  it('ends on the bin given by sum(path) and stays inside the board', () => {
    const rng = new Rng(5);
    const xs = new Float32Array(32);
    const ys = new Float32Array(32);
    for (const layout of [LAYOUT.portrait, LAYOUT.landscape]) {
      for (const rows of ROWS_OPTIONS) {
        const geo = new BoardGeometry().set(layout.board, rows);
        for (let t = 0; t < 200; t++) {
          const path = Array.from({ length: rows }, () => rng.nextU32() & 1);
          const n = buildWaypoints(geo, path, xs, ys);
          const bin = path.reduce((s, x) => s + x, 0);
          expect(n).toBe(rows + 2);
          expect(xs[n - 1]).toBeCloseTo(geo.binX(bin), 3);
          for (let i = 1; i < n - 1; i++) expect(Math.abs(xs[i + 1] - xs[i])).toBeCloseTo(geo.gap / 2, 3);
          for (let i = 0; i < n; i++) {
            expect(xs[i]).toBeGreaterThanOrEqual(layout.board.x);
            expect(xs[i]).toBeLessThanOrEqual(layout.board.x + layout.board.w);
            expect(ys[i]).toBeGreaterThanOrEqual(layout.board.y);
          }
          expect(geo.binY + geo.binH / 2).toBeLessThanOrEqual(layout.board.y + layout.board.h + 1e-6);
        }
      }
    }
  });
});
