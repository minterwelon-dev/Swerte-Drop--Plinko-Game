import Phaser from 'phaser';
import { DEPTH } from '../constants';
import type { DropResponse } from '../rgs/types';
import { sd, sx, sy } from '../utils/responsive';
import { buildWaypoints, type BoardGeometry } from './BallPath';

const MAX_POINTS = 32;

export interface BallEvents {
  onPeg(row: number, peg: number): void;
  onLand(ball: Ball): void;
}

/**
 * One ball view. Waits at the drop point until its response arrives, then follows waypoints derived only from
 * response.path: straight drop-in, a parabolic hop per row, straight drop into the bin. No physics.
 */
export class Ball {
  readonly img: Phaser.GameObjects.Image;
  active = false;
  res: DropResponse | null = null;
  skipping = false;
  private readonly xs = new Float32Array(MAX_POINTS);
  private readonly ys = new Float32Array(MAX_POINTS);
  private count = 0;
  /** Index of the segment being travelled: from point seg to seg + 1. */
  private seg = 0;
  private t = 0;
  private rights = 0;

  constructor(scene: Phaser.Scene) {
    this.img = scene.add.image(0, 0, 'ball').setDepth(DEPTH.balls).setVisible(false);
  }

  /** Show the ball at the top while the request is in flight. */
  hold(geo: BoardGeometry): void {
    this.active = true;
    this.res = null;
    this.skipping = false;
    this.count = 0;
    this.place(geo, geo.cx, geo.startY);
    this.img.setVisible(true);
  }

  launch(res: DropResponse, geo: BoardGeometry): void {
    this.res = res;
    this.seg = 0;
    this.t = 0;
    this.rights = 0;
    this.count = buildWaypoints(geo, res.path, this.xs, this.ys);
  }

  release(): void {
    this.active = false;
    this.res = null;
    this.img.setVisible(false);
  }

  /** Layout changed mid-flight: rebuild waypoints for the new geometry and keep progress. */
  relayout(geo: BoardGeometry): void {
    if (!this.active) return;
    if (this.res) this.count = buildWaypoints(geo, this.res.path, this.xs, this.ys);
    this.render(geo);
  }

  update(dt: number, rowMs: number, geo: BoardGeometry, ev: BallEvents): void {
    if (!this.active || !this.res) return;
    if (this.skipping) {
      ev.onLand(this);
      return;
    }
    this.t += dt / rowMs;
    while (this.t >= 1) {
      this.t -= 1;
      this.seg++;
      if (this.seg >= this.count - 1) {
        this.place(geo, this.xs[this.count - 1], this.ys[this.count - 1]);
        ev.onLand(this);
        return;
      }
      // Arrived on the peg of row seg - 1; after r right moves that is peg r + 1.
      const row = this.seg - 1;
      ev.onPeg(row, this.rights + 1);
      this.rights += this.res.path[row];
    }
    this.render(geo);
  }

  private render(geo: BoardGeometry): void {
    if (!this.res || this.count === 0) {
      this.place(geo, geo.cx, geo.startY);
      return;
    }
    const a = this.seg;
    const b = Math.min(a + 1, this.count - 1);
    const t = this.t;
    const x = this.xs[a] + (this.xs[b] - this.xs[a]) * t;
    let y = this.ys[a] + (this.ys[b] - this.ys[a]) * t;
    // Hops between pegs arc upward; the drop-in and the fall into the bin accelerate instead.
    if (a > 0 && b < this.count - 1) y -= geo.gap * 0.35 * 4 * t * (1 - t);
    else y = this.ys[a] + (this.ys[b] - this.ys[a]) * t * t;
    this.place(geo, x, y);
  }

  private place(geo: BoardGeometry, x: number, y: number): void {
    const d = sd(geo.ballR * 2);
    this.img.setPosition(sx(x), sy(y)).setDisplaySize(d, d);
  }
}
