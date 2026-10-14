import Phaser from 'phaser';
import { DEPTH, FONT, PALETTE, TIER_COLOR, type Layout } from '../constants';
import { gameConfig } from '../gameConfig';
import { WIN_CAP_X } from '../math/config';
import { BALL_WHEEL, WHEEL_TOTAL_WEIGHT, type Jackpot } from '../math/feature';
import type { FeatureResult } from '../rgs/types';
import { formatMoney } from '../utils/format';
import { reducedMotion, sd, sx, sy } from '../utils/responsive';
import { Timeline } from '../utils/timeline';
import { CountUp } from './animation/CountUp';
import { ANIM } from './animation/animConfig';

const SPINS = 5;
const WHEEL_COLORS = [PALETTE.enamel, PALETTE.panel];

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
  private readonly sign: Phaser.GameObjects.Container;
  private readonly wood: Phaser.GameObjects.Image;
  private readonly ropes: Phaser.GameObjects.Graphics;
  private readonly total: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly remaining: Phaser.GameObjects.Text;
  private readonly count = new CountUp();
  private mode: 'hidden' | 'intro' | 'wheel' | 'result' | 'running' | 'summary' = 'hidden';
  private layout: Layout | null = null;
  private signY = 0;
  private capped = false;
  private rendered = -1;
  private textWait = 0;
  private lastSegment = -1;
  private tickWait = 0;
  private readonly wheel: Phaser.GameObjects.Container;
  private readonly wheelG: Phaser.GameObjects.Graphics;
  private readonly wheelLabels: Phaser.GameObjects.Text[] = [];
  private readonly pointer: Phaser.GameObjects.Graphics;
  private readonly bannerBg: Phaser.GameObjects.Rectangle;
  private readonly banner: Phaser.GameObjects.Text;
  private spinEnd = 0;
  private spinning = false;
  private reveal = 1;
  private get still(): boolean {
    return reducedMotion();
  }

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const d = DEPTH.featureOverlay;
    this.dim = scene.add.rectangle(0, 0, 10, 10, PALETTE.ink, 0.6).setOrigin(0).setDepth(DEPTH.dim);
    this.dim.setInteractive().on('pointerdown', () => this.skip());
    const text = (color: string) =>
      scene.add
        .text(0, 0, '', { fontFamily: FONT.ui, fontStyle: 'bold', color, align: 'center' })
        .setOrigin(0.5)
        .setDepth(d)
        .setStroke('#102c35', 8);
    this.title = text('#ffd23f');
    this.title.setFontFamily(FONT.title).setFontStyle('normal');
    this.sub = text(PALETTE.text);
    this.total = text('#f6c744');
    this.hint = text(PALETTE.text).setText('TAP TO CONTINUE');
    this.ropes = scene.add.graphics();
    this.wood = scene.add.image(0, 0, 'wood-art', 'sign-tall');
    this.sign = scene.add
      .container(0, 0, [this.ropes, this.wood, this.title, this.sub, this.total, this.hint])
      .setDepth(d);
    this.wood.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.skip());
    this.wheelG = scene.add.graphics();
    for (const w of BALL_WHEEL) {
      this.wheelLabels.push(
        scene.add
          .text(0, 0, String(w.balls), { fontFamily: FONT.ui, fontStyle: 'bold', color: PALETTE.text })
          .setOrigin(0.5),
      );
    }
    this.wheel = scene.add.container(0, 0, [this.wheelG, ...this.wheelLabels]).setDepth(d);
    this.pointer = scene.add.graphics().setDepth(d);
    this.bannerBg = scene.add.rectangle(0, 0, 10, 10, PALETTE.panel, 1).setDepth(d);
    this.banner = text('#ffd23f');
    this.remaining = text(PALETTE.text);
    this.hide();
  }

  async intro(message: string): Promise<void> {
    this.mode = 'intro';
    this.show(true, false);
    this.title.setText('PLINKO FEATURE');
    this.sub.setText(message);
    await this.timeline.wait(gameConfig.feature.introMs);
  }

  /** Spins the wheel onto the segment the server picked. */
  async spin(balls: number): Promise<void> {
    const i = BALL_WHEEL.findIndex((w) => w.balls === balls);
    if (i < 0) throw new Error(`no wheel segment for ${balls} balls`);
    this.mode = 'wheel';
    this.show(true, true);
    this.title.setText('BALL COUNT');
    this.sub.setText('');
    // Rotate so the segment's middle ends under the pointer at the top (-90 degrees).
    const mid = this.segmentStart(i) + (BALL_WHEEL[i].weight / WHEEL_TOTAL_WEIGHT) * Math.PI;
    const toTop = Phaser.Math.Angle.Wrap(-Math.PI / 2 - mid);
    this.spinEnd = SPINS * 2 * Math.PI + (toTop < 0 ? toTop + 2 * Math.PI : toTop);
    this.wheel.setRotation(0);
    this.spinning = true;
    this.lastSegment = -1;
    this.tickWait = 0;
    const f = gameConfig.feature;
    await this.timeline.wait(this.still ? ANIM.shortMs : f.spinMs);
    this.spinning = false;
    this.wheel.setRotation(this.spinEnd);
    this.title.setText(`${balls} BALLS!`);
    this.mode = 'result';
    await this.timeline.wait(f.resultMs);
  }

  /** Running total over the history strip while balls drop. */
  running(landed: number, balls: number, win: number, capped: boolean): void {
    if (this.mode !== 'running') this.count.start(0, 0);
    this.mode = 'running';
    this.show(false, false);
    this.capped = capped;
    this.remaining.setText(`${balls - landed} LEFT`).setVisible(true);
    this.count.start(win, this.still ? 0 : ANIM.balanceMs);
    this.rendered = -1;
    this.bannerBg.setVisible(true);
    this.banner.setVisible(true);
    this.updateNumbers();
  }

  async summary(res: FeatureResult, restored = false): Promise<void> {
    const hits: Record<Jackpot, number> = { mini: 0, minor: 0, major: 0 };
    for (const b of res.balls) if (b.tier) hits[b.tier]++;
    this.mode = 'summary';
    this.show(true, false);
    this.title.setText(res.capped ? 'MAX WIN' : 'FEATURE COMPLETE');
    this.sub.setText(
      [
        `${res.balls.length} balls`,
        `Mini x${hits.mini}   Minor x${hits.minor}   Major x${hits.major}`,
        res.capped ? `Max win reached (${WIN_CAP_X}x bet)` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
    this.count.start(res.totalWin, this.still || restored ? 0 : ANIM.winMaxMs, 0, 0);
    this.rendered = -1;
    this.total.setVisible(true);
    this.updateNumbers();
    await this.timeline.wait(res.capped ? gameConfig.feature.capMs : gameConfig.feature.summaryMs);
    this.count.skip();
    this.updateNumbers();
  }

  hide(): void {
    this.mode = 'hidden';
    this.show(false, false);
  }

  skip(): void {
    this.reveal = 1;
    this.timeline.skip();
    this.count.skip();
    this.updateNumbers();
  }

  update(dt: number, turbo = false): void {
    const f = gameConfig.feature;
    const rate = !turbo
      ? 1
      : this.spinning
        ? f.spinMs / f.turboSpinMs
        : this.mode === 'result'
          ? f.resultMs / f.turboResultMs
          : 1 / ANIM.turboFactor;
    this.timeline.update(dt * rate);
    this.count.update(dt * rate);
    this.textWait -= dt;
    if (this.textWait <= 0 || !this.count.active) {
      this.updateNumbers();
      this.textWait = 33;
    }
    this.reveal = Math.min(1, this.reveal + (dt * rate) / ANIM.modalOpenMs);
    this.sign.setAlpha(this.reveal).setY(this.signY - (this.still ? 0 : sd(160) * (1 - this.reveal) ** 3));
    this.wheel.setAlpha(this.reveal);
    this.pointer.setAlpha(this.reveal);
    if (this.spinning) {
      this.wheel.setRotation(this.spinEnd * (this.still ? 1 : easeOutCubic(this.timeline.progress)));
      this.tickWait -= dt;
      const angle = Phaser.Math.Angle.Normalize(-Math.PI / 2 - this.wheel.rotation);
      let segment = BALL_WHEEL.length - 1;
      for (let i = 0; i < BALL_WHEEL.length - 1; i++)
        if (angle < this.segmentStart(i + 1)) {
          segment = i;
          break;
        }
      if (!this.still && segment !== this.lastSegment && this.tickWait <= 0) {
        this.scene.events.emit('feature:wheel-tick');
        this.tickWait = f.wheelTickMs;
      }
      this.lastSegment = segment;
    }
    this.wheel.setScale(
      this.mode === 'result' && !this.still
        ? 1 + Math.sin(this.timeline.progress * Math.PI) * 0.035 * (1 - this.timeline.progress)
        : 1,
    );
  }

  private updateNumbers(): void {
    if (this.rendered === this.count.value) return;
    this.rendered = this.count.value;
    if (this.mode === 'running')
      this.banner.setText(`${this.capped ? 'MAX WIN' : 'FEATURE'}  ₱${formatMoney(this.rendered)}`);
    else if (this.mode === 'summary') this.total.setText('₱' + formatMoney(this.rendered));
  }

  relayout(layout: Layout): void {
    this.layout = layout;
    const b = layout.board;
    const cx = b.x + b.w / 2;
    const r = Math.min(b.w, b.h) * 0.3;
    this.dim.setPosition(0, 0).setSize(this.scene.scale.width, this.scene.scale.height);
    this.layoutSign();

    // Wheel drawn around the container origin so rotation spins it in place.
    this.wheel.setPosition(sx(cx), sy(b.y + b.h / 2));
    const g = this.wheelG.clear();
    const rr = sd(r);
    g.fillStyle(PALETTE.ink).fillCircle(0, 0, rr + sd(18));
    g.fillStyle(PALETTE.mustard).fillCircle(0, 0, rr + sd(10));
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
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      g.fillStyle(PALETTE.cream).fillCircle(Math.cos(a) * (rr + sd(5)), Math.sin(a) * (rr + sd(5)), sd(3));
    }

    const top = sy(b.y + b.h / 2 - r);
    const pw = sd(r * 0.1);
    this.pointer
      .clear()
      .fillStyle(TIER_COLOR.top, 1)
      .fillTriangle(sx(cx) - pw, top - pw * 1.6, sx(cx) + pw, top - pw * 1.6, sx(cx), top + pw * 0.6);

    const h = layout.featureBanner;
    this.bannerBg.setPosition(sx(h.x + h.w / 2), sy(h.y + h.h / 2)).setSize(sd(h.w), sd(h.h));
    this.banner
      .setPosition(
        sx(h.x + h.w * (layout.landscape ? 0.5 : 0.64)),
        this.bannerBg.y + (layout.landscape ? sd(h.h * 0.18) : 0),
      )
      .setFontSize(sd(Math.min(h.h * 0.48, h.w * (layout.landscape ? 0.062 : 0.034))));
    this.remaining
      .setPosition(
        sx(h.x + h.w * (layout.landscape ? 0.5 : 0.17)),
        this.bannerBg.y - (layout.landscape ? sd(h.h * 0.24) : 0),
      )
      .setFontSize(sd(Math.min(h.h * 0.4, 32)))
      .setStroke('#1d130d', sd(2));
    this.banner.setStroke('#102c35', sd(5));
  }

  private segmentStart(i: number): number {
    let w = 0;
    for (let j = 0; j < i; j++) w += BALL_WHEEL[j].weight;
    return (w / WHEEL_TOTAL_WEIGHT) * 2 * Math.PI;
  }

  private show(dim: boolean, wheel: boolean): void {
    this.reveal = dim && !this.still ? 0 : 1;
    this.dim.setVisible(dim);
    this.sign.setVisible(dim);
    this.title.setVisible(dim);
    this.sub.setVisible(dim);
    this.wheel.setVisible(wheel);
    this.pointer.setVisible(wheel);
    this.bannerBg.setVisible(false);
    this.banner.setVisible(false);
    this.remaining.setVisible(false);
    this.total.setVisible(this.mode === 'summary');
    this.layoutSign();
  }

  private layoutSign(): void {
    if (!this.layout) return;
    const b = this.layout.board,
      wheel = this.mode === 'wheel' || this.mode === 'result';
    const w = Math.min(b.w * 0.9, 860),
      h = wheel ? 140 : 440;
    this.signY = sy(b.y + b.h * (wheel ? 0.13 : 0.42));
    this.sign.setPosition(sx(b.x + b.w / 2), this.signY);
    this.wood.setFrame(wheel ? 'sign-wide' : 'sign-tall').setDisplaySize(sd(w), sd(h));
    this.title
      .setPosition(0, sd(wheel ? 0 : -h * 0.3))
      .setFontSize(sd(Math.min(w * 0.058, 48)))
      .setStroke('#1d130d', sd(3));
    this.sub
      .setPosition(0, sd(this.mode === 'summary' ? h * 0.19 : 0))
      .setFontSize(sd(Math.min(w * 0.038, 32)))
      .setWordWrapWidth(sd(w * 0.86))
      .setStroke('#1d130d', sd(2));
    this.total.setPosition(0, -sd(18)).setFontSize(sd(70)).setStroke('#1d130d', sd(3));
    this.hint
      .setText(this.mode === 'intro' ? 'TAP TO SPIN' : 'TAP TO COLLECT')
      .setPosition(0, sd(h * 0.4))
      .setFontSize(sd(22))
      .setStroke('#1d130d', sd(2))
      .setVisible(!wheel);
    this.ropes.clear().lineStyle(sd(4), PALETTE.cream, 0.8);
    for (const side of [-1, 1])
      this.ropes.lineBetween(sd(w * 0.38 * side), -this.signY, sd(w * 0.38 * side), -sd(h / 2));
  }
}
