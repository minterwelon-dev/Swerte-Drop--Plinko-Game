import type { Rect } from '../constants';

/** Board geometry in reference units, derived from the board rect and row count. Shared by Board, Bins and balls. */
export class BoardGeometry {
  rows = 16;
  cx = 0;
  /** y of peg row 0 */
  top = 0;
  /** Horizontal spacing; vertical spacing adapts to the reference board's aspect ratio. */
  gap = 0;
  rowGap = 0;
  pegR = 0;
  ballR = 0;
  startY = 0;
  binY = 0;
  binW = 0;
  binH = 0;
  rect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  set(rect: Rect, rows: number): this {
    this.rect = rect;
    this.rows = rows;
    const gap = rect.w / (rows + 2);
    this.gap = gap;
    this.cx = rect.x + rect.w / 2;
    this.top = rect.y + rect.h * 0.13;
    this.rowGap = (rect.h * 0.7) / (rows - 1);
    this.pegR = gap * 0.11;
    this.ballR = gap * 0.26;
    this.startY = rect.y + this.ballR * 1.25;
    this.binH = rect.h * 0.12;
    this.binY = rect.y + rect.h - this.binH * 0.65;
    this.binW = gap * 0.95;
    return this;
  }

  rowY(row: number): number {
    return this.top + row * this.rowGap;
  }

  /** Row i has i + 3 pegs, j = 0..i + 2. */
  pegX(row: number, j: number): number {
    return this.cx + (j - (row + 2) / 2) * this.gap;
  }

  binX(bin: number): number {
    return this.cx + (bin - this.rows / 2) * this.gap;
  }
}

/**
 * Waypoints for a path: start, one contact point above the peg hit in each row, then the bin.
 * After r right moves the ball sits on peg j = r + 1 of the next row, so it ends at binX(sum(path)).
 * Writes into caller-owned buffers (no per-drop allocation) and returns the point count.
 */
export function buildWaypoints(
  geo: BoardGeometry,
  path: readonly number[],
  xs: Float32Array,
  ys: Float32Array,
): number {
  xs[0] = geo.cx;
  ys[0] = geo.startY;
  let rights = 0;
  for (let i = 0; i < path.length; i++) {
    xs[i + 1] = geo.pegX(i, rights + 1);
    ys[i + 1] = geo.rowY(i) - geo.pegR - geo.ballR;
    rights += path[i];
  }
  const n = path.length + 1;
  xs[n] = geo.binX(rights);
  ys[n] = geo.binY;
  return n + 1;
}
