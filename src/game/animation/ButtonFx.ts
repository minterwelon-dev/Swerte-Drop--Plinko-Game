import type Phaser from 'phaser';
import { reducedMotion, sd } from '../../utils/responsive';
import { Timeline } from '../../utils/timeline';
import { ANIM } from './animConfig';

/** One reusable, interruptible press animation per existing button container. */
export class ButtonFx {
  private readonly clock = new Timeline();
  private readonly alphaClock = new Timeline();
  alpha = 1;
  private fromAlpha = 1;
  private targetAlpha = 1;
  private mode: 'press' | 'release' | 'pop' = 'release';
  private baseY = 0;
  private from = 1;
  private deep = false;
  private get still(): boolean {
    return reducedMotion();
  }

  constructor(private readonly root: Phaser.GameObjects.Container) {}

  enabled(enabled: boolean): void {
    const target = enabled ? 1 : 0.6;
    if (target === this.targetAlpha) return;
    this.fromAlpha = this.alpha;
    this.targetAlpha = target;
    void this.alphaClock.wait(this.still ? 0 : ANIM.toggleMs);
    if (this.still) {
      this.alpha = target;
      this.root.setAlpha(target);
    }
  }

  layout(): void {
    this.clock.skip();
    this.root.setScale(1);
    this.baseY = this.root.y;
  }
  press(deep = false): void {
    this.deep = deep;
    this.mode = 'press';
    this.from = this.root.scaleX;
    void this.clock.wait(ANIM.pressMs);
  }
  release(): void {
    this.mode = 'release';
    this.from = this.root.scaleX;
    void this.clock.wait(ANIM.releaseMs);
  }
  pop(): void {
    this.mode = 'pop';
    void this.clock.wait(ANIM.toggleMs);
  }
  skip(): void {
    this.clock.skip();
    this.alphaClock.skip();
    this.alpha = this.targetAlpha;
    this.root.setScale(1).setY(this.baseY).setAlpha(this.alpha);
  }
  update(dt: number, turbo: boolean): void {
    if (this.alphaClock.progress < 1) {
      this.alphaClock.update(dt / (turbo ? ANIM.turboFactor : 1));
      this.alpha = this.fromAlpha + (this.targetAlpha - this.fromAlpha) * this.alphaClock.progress;
      this.root.setAlpha(this.alpha);
    }
    if (this.clock.progress >= 1) return;
    this.clock.update(dt / (turbo ? ANIM.turboFactor : 1));
    const t = this.clock.progress;
    if (this.still) return;
    let scale: number;
    if (this.mode === 'press') scale = this.from + ((this.deep ? 0.91 : 0.94) - this.from) * t;
    else if (this.mode === 'release') scale = this.from + (1 - this.from) * t + Math.sin(t * Math.PI) * 0.04;
    else scale = 1 + Math.sin(t * Math.PI) * 0.04;
    this.root.setScale(scale).setY(this.baseY + sd((1 - scale) * 50));
    if (t === 1 && this.mode !== 'press') this.root.setScale(1).setY(this.baseY);
  }
}
