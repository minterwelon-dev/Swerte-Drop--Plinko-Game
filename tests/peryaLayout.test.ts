import { describe, expect, it } from 'vitest';
import { LAYOUT, TIER_COLOR } from '../src/constants';
import { BoardGeometry } from '../src/game/BallPath';
import { classicBinDefs, tierFor } from '../src/game/Bins';
import { RISKS, ROWS_OPTIONS } from '../src/math/config';
import { MULTIPLIERS } from '../src/math/multipliers';
import { computeViewport, currentLayout, setViewport, sx, sy, sd } from '../src/utils/responsive';

describe('reference layout and data-driven tickets', () => {
  it('uses the full phone height and reserves separate board, history and control areas', () => {
    for (const [w, h] of [
      [320, 568],
      [360, 640],
      [390, 844],
      [430, 932],
    ]) {
      setViewport(computeViewport(w, h, 1));
      const l = currentLayout();
      expect(sd(l.board.h)).toBeGreaterThan(h * 0.6);
      expect(sx(l.board.x)).toBeLessThan(8);
      expect(l.board.y + l.board.h).toBeLessThan(l.history.y);
      expect(l.history.y + l.history.h).toBeLessThan(l.panel.y);
      expect(sy(l.panel.y + l.panel.h)).toBeCloseTo(h);
      expect(l.controls.drop.x).toBeGreaterThan(l.controls.betUp.x + l.controls.betUp.w);
      expect(sy(l.controls.setup!.y + l.controls.setup!.h)).toBeLessThan(h);
    }
    setViewport(computeViewport(1920, 1080, 1));
  });
  it('keeps the hopper, pegs and complete ticket tray inside both boards for every row count', () => {
    for (const layout of Object.values(LAYOUT))
      for (const rows of ROWS_OPTIONS) {
        const r = layout.board;
        const g = new BoardGeometry().set({ x: r.x + 28, y: r.y + 26, w: r.w - 56, h: r.h - 52 }, rows);
        expect(g.startY).toBeLessThan(g.top - g.pegR - g.ballR);
        expect(g.pegX(rows - 1, 0) - g.pegR).toBeGreaterThan(r.x);
        expect(g.pegX(rows - 1, rows + 1) + g.pegR).toBeLessThan(r.x + r.w);
        expect(g.rowY(rows - 1) + g.pegR).toBeLessThan(g.binY - g.binH / 2);
        expect(g.binX(0) - g.binW / 2).toBeGreaterThan(r.x);
        expect(g.binX(rows) + g.binW / 2).toBeLessThan(r.x + r.w);
        expect(g.binY + g.binH / 2).toBeLessThan(r.y + r.h);
      }
  });
  it('uses all fifteen tables and the specified colour boundaries', () => {
    for (const rows of ROWS_OPTIONS)
      for (const risk of RISKS) {
        const defs = classicBinDefs(rows, risk);
        expect(defs).toHaveLength(rows + 1);
        expect(defs.map((d) => d.multiplierX100)).toEqual(MULTIPLIERS[risk][rows]);
      }
    for (const [m, tier] of [
      [99, 'lose'],
      [100, 'low'],
      [299, 'low'],
      [300, 'mid'],
      [999, 'mid'],
      [1000, 'high'],
      [10000, 'top'],
    ] as const)
      expect(tierFor(m)).toBe(tier);
    expect(TIER_COLOR.top).toBe(TIER_COLOR.high);
  });
});
