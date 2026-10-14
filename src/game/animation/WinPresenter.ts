import type Phaser from 'phaser';
import { DEPTH, FONT, PALETTE } from '../../constants';
import { formatMoney } from '../../utils/format';
import { reducedMotion, sd, sx, sy } from '../../utils/responsive';
import { Timeline } from '../../utils/timeline';
import type { BoardGeometry } from '../BallPath';
import { ANIM, easeOut } from './animConfig';

/** Six pooled cash tags and landing-ball views; no credits or outcomes are computed here. */
export class WinPresenter {
  private readonly slots: {
    root: Phaser.GameObjects.Container;
    plate: Phaser.GameObjects.Rectangle;
    text: Phaser.GameObjects.Text;
    ball: Phaser.GameObjects.Image;
    ghost: Phaser.GameObjects.Container;
    clock: Timeline;
    bin: number;
    quiet: boolean;
    duration: number;
  }[] = [];
  private next = 0;
  private geo: BoardGeometry | null = null;
  private get still(): boolean {
    return reducedMotion();
  }

  constructor(scene: Phaser.Scene) {
    for (let i = 0; i < ANIM.tagPool; i++) {
      const plate = scene.add.rectangle(0, 0, 1, 1, PALETTE.mustard);
      const text = scene.add
        .text(0, 0, '', { fontFamily: FONT.ui, fontStyle: 'bold', color: PALETTE.textDark })
        .setOrigin(0.5);
      const root = scene.add.container(0, 0, [plate, text]).setDepth(DEPTH.popups).setVisible(false);
      const ball = scene.add.image(0, 0, 'ball');
      const ghost = scene.add.container(0, 0, [ball]).setDepth(DEPTH.balls).setVisible(false);
      this.slots.push({
        root,
        plate,
        text,
        ball,
        ghost,
        clock: new Timeline(),
        bin: 0,
        quiet: false,
        duration: 0,
      });
    }
  }
  get active(): boolean {
    for (let i = 0; i < this.slots.length; i++) if (this.slots[i].clock.progress < 1) return true;
    return false;
  }
  land(bin: number, win: number, multiplier: number, geo: BoardGeometry, short: boolean): void {
    this.geo = geo;
    const s = this.slots[this.next];
    this.next = (this.next + 1) % this.slots.length;
    s.bin = bin;
    s.quiet = multiplier < 100 || short || this.still;
    s.duration = s.quiet ? ANIM.shortMs : ANIM.tagMs;
    s.text.setText(win > 0 ? '+₱' + formatMoney(win) : '');
    s.text.setColor(s.quiet ? PALETTE.text : PALETTE.textDark);
    s.plate.setFillStyle(s.quiet ? PALETTE.panel : PALETTE.mustard);
    s.root
      .setVisible(win > 0)
      .setAlpha(1)
      .setScale(1);
    s.ghost.setVisible(true).setAlpha(1).setScale(1);
    void s.clock.wait(s.duration);
    this.relayout(geo);
  }
  relayout(geo: BoardGeometry): void {
    this.geo = geo;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      s.text.setFontSize(sd(34));
      s.plate.setSize(s.text.width + sd(24), sd(50)).setStrokeStyle(sd(3), PALETTE.ink);
      s.ball.setDisplaySize(sd(geo.ballR * 2), sd(geo.ballR * 2));
    }
  }
  skip(): void {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      s.clock.skip();
      s.root.setVisible(false);
      s.ghost.setVisible(false);
    }
  }
  update(dt: number, turbo: boolean): void {
    const g = this.geo;
    if (!g) return;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s.clock.progress >= 1) continue;
      s.clock.update(dt / (turbo ? ANIM.turboFactor : 1));
      const t = s.clock.progress,
        elapsed = t * s.duration;
      const half = s.plate.width / 2 + sd(6);
      const x = Math.max(sx(g.rect.x) + half, Math.min(sx(g.rect.x + g.rect.w) - half, sx(g.binX(s.bin))));
      s.root
        .setPosition(x, sy(g.binY - g.binH * 0.7 - (s.quiet ? 0 : 24 * easeOut(t) + (i % 3) * 52)))
        .setAlpha(Math.min(1, (1 - t) * 4))
        .setScale(s.quiet ? 1 : Math.min(1, t * 8) + Math.sin(Math.min(1, t * 3) * Math.PI) * 0.15)
        .setVisible(t < 1 && s.text.text !== '');
      const p = Math.min(1, elapsed / (s.quiet ? ANIM.shortMs : ANIM.landingMs + ANIM.settleMs));
      const squash = s.quiet ? 0 : Math.sin(Math.min(1, elapsed / ANIM.landingMs) * Math.PI) * 0.25;
      s.ghost
        .setPosition(sx(g.binX(s.bin)), sy(g.binY + (s.quiet ? 0 : p * g.ballR)))
        .setScale(1 + squash, 1 - squash)
        .setAlpha(1 - p)
        .setVisible(p < 1);
    }
  }
}
