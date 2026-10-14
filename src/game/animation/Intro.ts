import type Phaser from 'phaser';
import { DEPTH } from '../../constants';
import { reducedMotion, sd } from '../../utils/responsive';
import { Timeline } from '../../utils/timeline';
import { ANIM, easeOut } from './animConfig';

type Part = Phaser.GameObjects.GameObject &
  Phaser.GameObjects.Components.Transform &
  Phaser.GameObjects.Components.Alpha;

/** One entrance clock for the existing board/control objects; input restores their layout immediately. */
export class Intro {
  private readonly clock = new Timeline();
  private readonly parts: { object: Part; y: number; alpha: number }[] = [];
  start(scene: Phaser.Scene, sign: Phaser.GameObjects.Container): void {
    for (const child of scene.children.list) {
      const object = child as Part &
        Phaser.GameObjects.Components.Depth &
        Phaser.GameObjects.Components.Visible;
      if (
        child !== sign &&
        child.type !== 'Container' &&
        object.visible &&
        object.depth >= DEPTH.boardPanel &&
        object.depth <= DEPTH.hud
      )
        this.parts.push({ object, y: object.y, alpha: object.alpha });
    }
    void this.clock.wait(ANIM.introMs);
  }
  skip(): void {
    this.clock.skip();
    this.update(0, false);
  }
  update(dt: number, turbo: boolean): void {
    if (this.parts.length === 0) return;
    this.clock.update(dt / (turbo ? ANIM.turboFactor : 1));
    const t = easeOut(this.clock.progress);
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      p.object.setY(p.y + (reducedMotion() ? 0 : sd(36) * (1 - t))).setAlpha(p.alpha * t);
    }
    if (t === 1) this.parts.length = 0;
  }
}
