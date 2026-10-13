import Phaser from 'phaser';
import { Ball, type BallEvents } from './Ball';
import type { BoardGeometry } from './BallPath';

/** Fixed pool of ball views; max concurrent balls is enforced by the state machine. */
export class BallPool {
  private readonly balls: Ball[] = [];

  constructor(scene: Phaser.Scene, size: number) {
    for (let i = 0; i < size; i++) this.balls.push(new Ball(scene));
  }

  acquire(): Ball {
    for (let i = 0; i < this.balls.length; i++) if (!this.balls[i].active) return this.balls[i];
    throw new Error('ball pool exhausted');
  }

  /** Fast-forward every ball to its landing; balls still waiting for a response land as soon as it arrives. */
  skipAll(): void {
    for (let i = 0; i < this.balls.length; i++) if (this.balls[i].active) this.balls[i].skipping = true;
  }

  relayout(geo: BoardGeometry): void {
    for (let i = 0; i < this.balls.length; i++) this.balls[i].relayout(geo);
  }

  update(dt: number, rowMs: number, geo: BoardGeometry, ev: BallEvents): void {
    for (let i = 0; i < this.balls.length; i++) this.balls[i].update(dt, rowMs, geo, ev);
  }
}
