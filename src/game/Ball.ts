import Phaser from 'phaser';
import { DEPTH } from '../constants';
import { Timeline } from '../utils/timeline';
import { ANIM } from './animation/animConfig';
import { gameConfig } from '../gameConfig';
import type { DropResponse } from '../rgs/types';
import { reducedMotion, sd, sx, sy } from '../utils/responsive';
import { buildWaypoints, type BoardGeometry } from './BallPath';

const MAX_POINTS = 32;

/** What one ball presents: a classic round, or one feature ball tagged with its feature's roundId. */
export type BallRound = Pick<DropResponse, 'roundId' | 'path' | 'bin' | 'multiplierX100' | 'win'>;

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
  readonly root: Phaser.GameObjects.Container;
  private readonly load = new Timeline();
  private loadLeft = 0;
  private turbo = false;
  active = false;
  res: BallRound | null = null;
  skipping = false;
  private readonly xs = new Float32Array(MAX_POINTS);
  private readonly ys = new Float32Array(MAX_POINTS);
  private count = 0;
  /** Index of the segment being travelled: from point seg to seg + 1. */
  private seg = 0;
  private t = 0;
  private rights = 0;
  private readonly trail: Phaser.GameObjects.Image[] = [];
  private readonly trailRoots: Phaser.GameObjects.Container[] = [];
  private get still(): boolean {
    return reducedMotion();
  }
  private readonly withdrawClock = new Timeline();
  private withdrawing = false;
  withdraw(): void {
    this.withdrawing = true;
    void this.withdrawClock.wait(ANIM.shortMs);
  }

  constructor(
    scene: Phaser.Scene,
    private readonly slot = 0,
  ) {
    for (let i = 0; i < 3; i++) {
      const img = scene.add.image(0, 0, 'ball');
      this.trail.push(img);
      this.trailRoots.push(scene.add.container(0, 0, [img]).setDepth(DEPTH.ballTrail).setVisible(false));
    }
    this.img = scene.add.image(0, 0, 'ball');
    this.root = scene.add.container(0, 0, [this.img]).setDepth(DEPTH.balls).setVisible(false);
  }

  /** Show the ball at the top while the request is in flight. */
  hold(geo: BoardGeometry): void {
    this.withdrawing = false;
    this.root.setAlpha(1);
    this.active = true;
    this.res = null;
    this.skipping = false;
    this.count = 0;
    this.place(geo, geo.cx, geo.startY);
    this.root.setVisible(true).setScale(1).setAngle(0);
  }

  launch(res: BallRound, geo: BoardGeometry): void {
    this.res = res;
    this.seg = 0;
    this.t = 0;
    this.rights = 0;
    this.count = buildWaypoints(geo, res.path, this.xs, this.ys);
    this.loadLeft = this.still ? 0 : ANIM.loadMs + ANIM.releaseBallMs + this.slot * ANIM.staggerMs;
    void this.load.wait(this.loadLeft);
  }

  release(): void {
    this.active = false;
    this.res = null;
    this.root.setVisible(false).setScale(1).setAngle(0);
    this.load.skip();
    for (let i = 0; i < this.trailRoots.length; i++) this.trailRoots[i].setVisible(false);
  }

  /** Layout changed mid-flight: rebuild waypoints for the new geometry and keep progress. */
  relayout(geo: BoardGeometry): void {
    if (!this.active) return;
    if (this.res) this.count = buildWaypoints(geo, this.res.path, this.xs, this.ys);
    this.render(geo);
  }

  update(dt: number, rowMs: number, geo: BoardGeometry, ev: BallEvents): void {
    if (this.active && this.withdrawing && !this.res) {
      this.withdrawClock.update(dt);
      const t = this.withdrawClock.progress;
      this.root.setAlpha(1 - t).setScale(this.still ? 1 : 1 - t * 0.2);
      return;
    }
    if (!this.active || !this.res) return;
    if (this.skipping) {
      this.place(geo, geo.binX(this.res.bin), geo.binY);
      ev.onLand(this);
      return;
    }
    this.turbo = rowMs <= gameConfig.turboRowMs;
    if (this.loadLeft > 0) {
      const rate = this.turbo ? 1 / ANIM.turboFactor : 1;
      const used = Math.min(dt, this.loadLeft / rate);
      this.loadLeft = Math.max(0, this.loadLeft - used * rate);
      this.load.update(used * rate);
      dt -= used;
      if (this.loadLeft > 0) {
        this.render(geo);
        return;
      }
    }
    this.t += dt / (rowMs * (this.still ? ANIM.reducedFactor : 1));
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
    if (this.loadLeft > 0) {
      this.place(geo, geo.cx, geo.startY);
      const p = this.load.progress;
      this.root.setScale(1 + Math.sin(p * Math.PI * 2) * 0.12, 1 - Math.sin(p * Math.PI * 2) * 0.12);
      return;
    }
    const a = this.seg;
    const b = Math.min(a + 1, this.count - 1);
    const t = this.t;
    const wobble = this.still || this.turbo ? 0 : Math.sin((a + this.slot) * 2.4) * 2 * Math.sin(Math.PI * t);
    const x = this.xs[a] + (this.xs[b] - this.xs[a]) * t + wobble;
    let y = this.ys[a] + (this.ys[b] - this.ys[a]) * t;
    // Hops between pegs arc upward; the drop-in and the fall into the bin accelerate instead.
    if (!this.still && a > 0 && b < this.count - 1) y -= geo.gap * 0.35 * 4 * t * (1 - t);
    else y = this.ys[a] + (this.ys[b] - this.ys[a]) * t * t;
    this.place(geo, x, y);
    if (!this.still) {
      const d = sd(geo.ballR * 2);
      const impact = a > 0 ? Math.max(0, 1 - t * 5) * 0.16 : 0;
      this.root.setScale(1 + impact, 1 - impact).setAngle((this.xs[b] - this.xs[a]) * t * 0.25);
      for (let i = 0; i < this.trail.length; i++) {
        const back = Math.max(0, t - (i + 1) * 0.08);
        const tx = this.xs[a] + (this.xs[b] - this.xs[a]) * back;
        let ty = this.ys[a] + (this.ys[b] - this.ys[a]) * back;
        if (a > 0 && b < this.count - 1) ty -= geo.gap * 0.35 * 4 * back * (1 - back);
        else ty = this.ys[a] + (this.ys[b] - this.ys[a]) * back * back;
        this.trailRoots[i].setPosition(sx(tx), sy(ty)).setVisible(!this.turbo && t > 0.12);
        this.trail[i]
          .setDisplaySize(d * (0.65 - i * 0.12), d * (0.65 - i * 0.12))
          .setAlpha(ANIM.trailAlpha * (1 - i / 3));
      }
    }
  }

  private place(geo: BoardGeometry, x: number, y: number): void {
    const d = sd(geo.ballR * 2);
    this.root.setPosition(sx(x), sy(y)).setScale(1).setAngle(0);
    this.img.setDisplaySize(d, d);
  }
}
