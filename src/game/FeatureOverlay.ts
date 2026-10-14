import Phaser from 'phaser';
import { DEPTH, PALETTE, TIER_COLOR, type Layout } from '../constants';
import { gameConfig } from '../gameConfig';
import { WIN_CAP_X } from '../math/config';
import { BALL_WHEEL, WHEEL_TOTAL_WEIGHT, type Jackpot } from '../math/feature';
import type { FeatureResult } from '../rgs/types';
import { formatMoney } from '../utils/format';
import { sd, sx, sy } from '../utils/responsive';
import { Timeline } from '../utils/timeline';

const FONT = 'Arial, sans-serif';
const SPINS = 5;
const WHEEL_COLORS = [0x3d2466, 0x5b3a8c];

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * Stage B presentation: intro, ball count wheel, running total banner and summary.
 * Every step is skippable (tap the overlay or Skip). Shows server results; decides nothing.
 */
export class FeatureOverlay {
  private readonly scene: Phaser.Scene;
  private readonly timeline = new Timeline();
  private readonly dim: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly sub: Phaser.GameObjects.Text;
  private readonly wheel: Phaser.GameObjects.Container;
  private readonly wheelG: Phaser.GameObjects.Graphics;
  private readonly wheelLabels: Phaser.GameObjects.Text[] = [];
  private readonly pointer: Phaser.GameObjects.Graphics;
  private readonly bannerBg: Phaser.GameObjects.Rectangle;
  private readonly banner: Phaser.GameObjects.Text;
  private spinEnd = 0;
  private spinning = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const d = DEPTH.featureOverlay;
    this.dim = scene.add.rectangle(0, 0, 10, 10, 0x0b0616, 0.72).setOrigin(0).setDepth(DEPTH.dim);
    this.dim.setInteractive().on('pointerdown', () => this.skip());
    const text = (color: string) =>
      scene.add
        .text(0, 0, '', { fontFamily: FONT, fontStyle: 'bold', color, align: 'center' })
        .setOrigin(0.5)
        .setDepth(d)
        .setStroke('#1a0f2e', 8);
    this.title = text('#ffd23f');
    this.sub = text(PALETTE.text);
    this.wheelG = scene.add.graphics();
    for (const w of BALL_WHEEL) {
      this.wheelLabels.push(
        scene.add
          .text(0, 0, String(w.balls), { fontFamily: FONT, fontStyle: 'bold', color: PALETTE.text })
          .setOrigin(0.5),
      );
    }
    this.wheel = scene.add.container(0, 0, [this.wheelG, ...this.wheelLabels]).setDepth(d);
    this.pointer = scene.add.graphics().setDepth(d);
    this.bannerBg = scene.add.rectangle(0, 0, 10, 10, PALETTE.panel, 0.95).setDepth(d);
    this.banner = text('#ffd23f');
    this.hide();
  }

  async intro(message: string): Promise<void> {
    this.show(true, false);
    this.title.setText('PLINKO FEATURE');
    this.sub.setText(message);
    await this.timeline.wait(gameConfig.feature.introMs);
  }

  /** Spins the wheel onto the segment the server picked. */
  async spin(balls: number, turbo: boolean): Promise<void> {
    const i = BALL_WHEEL.findIndex((w) => w.balls === balls);
    if (i < 0) throw new Error(`no wheel segment for ${balls} balls`);
    this.show(true, true);
    this.title.setText('BALL COUNT');
    this.sub.setText('');
    // Rotate so the segment's middle ends under the pointer at the top (-90 degrees).
    const mid = this.segmentStart(i) + (BALL_WHEEL[i].weight / WHEEL_TOTAL_WEIGHT) * Math.PI;
    const toTop = Phaser.Math.Angle.Wrap(-Math.PI / 2 - mid);
    this.spinEnd = SPINS * 2 * Math.PI + (toTop < 0 ? toTop + 2 * Math.PI : toTop);
    this.wheel.setRotation(0);
    this.spinning = true;
    const f = gameConfig.feature;
    await this.timeline.wait(turbo ? f.turboSpinMs : f.spinMs);
    this.spinning = false;
    this.wheel.setRotation(this.spinEnd);
    this.title.setText(`${balls} BALLS!`);
    await this.timeline.wait(turbo ? f.turboResultMs : f.resultMs);
  }

  /** Running total over the history strip while balls drop. */
  running(landed: number, balls: number, win: number, capped: boolean): void {
    this.show(false, false);
    this.bannerBg.setVisible(true);
    this.banner
      .setText(`Ball ${landed}/${balls}   Feature win ${formatMoney(win)}${capped ? '  MAX WIN' : ''}`)
      .setVisible(true);
  }

  async summary(res: FeatureResult): Promise<void> {
    const hits: Record<Jackpot, number> = { mini: 0, minor: 0, major: 0 };
    for (const b of res.balls) if (b.tier) hits[b.tier]++;
    this.show(true, false);
    this.title.setText('FEATURE COMPLETE');
    this.sub.setText(
      [
        `${res.balls.length} balls`,
        `Mini x${hits.mini}   Minor x${hits.minor}   Major x${hits.major}`,
        `Total win ${formatMoney(res.totalWin)}`,
        res.capped ? `Max win reached (${WIN_CAP_X}x bet)` : '',
        'Tap to continue',
      ]
        .filter(Boolean)
        .join('\n'),
    );
    await this.timeline.wait(gameConfig.feature.summaryMs);
  }

  hide(): void {
    this.show(false, false);
  }

  skip(): void {
    this.timeline.skip();
  }

  update(dt: number): void {
    this.timeline.update(dt);
    if (this.spinning) this.wheel.setRotation(this.spinEnd * easeOutCubic(this.timeline.progress));
  }

  relayout(layout: Layout): void {
    const b = layout.board;
    const cx = b.x + b.w / 2;
    const r = Math.min(b.w, b.h) * 0.3;
    this.dim.setPosition(0, 0).setSize(this.scene.scale.width, this.scene.scale.height);
    this.title.setPosition(sx(cx), sy(b.y + b.h * 0.13)).setFontSize(sd(Math.min(b.w * 0.08, 80)));
    this.title.setStroke('#1a0f2e', sd(8));
    this.sub.setPosition(sx(cx), sy(b.y + b.h * 0.5)).setFontSize(sd(Math.min(b.w * 0.045, 44)));
    this.sub.setStroke('#1a0f2e', sd(6));

    // Wheel drawn around the container origin so rotation spins it in place.
    this.wheel.setPosition(sx(cx), sy(b.y + b.h / 2));
    const g = this.wheelG.clear();
    const rr = sd(r);
    for (let i = 0; i < BALL_WHEEL.length; i++) {
      const a0 = this.segmentStart(i);
      const a1 = a0 + (BALL_WHEEL[i].weight / WHEEL_TOTAL_WEIGHT) * 2 * Math.PI;
      g.fillStyle(WHEEL_COLORS[i % 2], 1)
        .slice(0, 0, rr, a0, a1)
        .fillPath();
      g.lineStyle(sd(3), TIER_COLOR.mid, 1).slice(0, 0, rr, a0, a1).strokePath();
      const mid = (a0 + a1) / 2;
      this.wheelLabels[i]
        .setPosition(Math.cos(mid) * rr * 0.7, Math.sin(mid) * rr * 0.7)
        .setRotation(mid + Math.PI / 2)
        .setFontSize(sd(r * 0.15));
    }
    g.fillStyle(TIER_COLOR.mid, 1).fillCircle(0, 0, rr * 0.12);

    const top = sy(b.y + b.h / 2 - r);
    const pw = sd(r * 0.1);
    this.pointer
      .clear()
      .fillStyle(TIER_COLOR.top, 1)
      .fillTriangle(sx(cx) - pw, top - pw * 1.6, sx(cx) + pw, top - pw * 1.6, sx(cx), top + pw * 0.6);

    const h = layout.history;
    this.bannerBg.setPosition(sx(h.x + h.w / 2), sy(h.y + h.h / 2)).setSize(sd(h.w), sd(h.h));
    this.banner
      .setPosition(this.bannerBg.x, this.bannerBg.y)
      .setFontSize(sd(Math.min(h.h * 0.45, h.w * 0.032)));
    this.banner.setStroke('#1a0f2e', sd(5));
  }

  private segmentStart(i: number): number {
    let w = 0;
    for (let j = 0; j < i; j++) w += BALL_WHEEL[j].weight;
    return (w / WHEEL_TOTAL_WEIGHT) * 2 * Math.PI;
  }

  private show(dim: boolean, wheel: boolean): void {
    this.dim.setVisible(dim);
    this.title.setVisible(dim);
    this.sub.setVisible(dim);
    this.wheel.setVisible(wheel);
    this.pointer.setVisible(wheel);
    this.bannerBg.setVisible(false);
    this.banner.setVisible(false);
  }
}
