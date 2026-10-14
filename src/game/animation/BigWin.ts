import type Phaser from 'phaser';
import { DEPTH, FONT, PALETTE, type Layout } from '../../constants';
import { reducedMotion, sd, sx, sy } from '../../utils/responsive';
import { formatMoney } from '../../utils/format';
import { Timeline } from '../../utils/timeline';
import { CountUp } from './CountUp';
import { ANIM, easeOut } from './animConfig';
import { sampleConfetti } from './confettiMotion';

/** A pooled painted sign and paper ribbons. The amount is already settled by the server. */
export class BigWin {
  readonly root: Phaser.GameObjects.Container;
  private readonly wood: Phaser.GameObjects.Image;
  private readonly ropes: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly amount: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly paper: Phaser.GameObjects.Rectangle[] = [];
  private readonly paperRoot: Phaser.GameObjects.Container;
  private readonly paperClock = new Timeline();
  private readonly paperSample = new Float64Array(5);
  private paperWidth = 0;
  private readonly clock = new Timeline();
  private readonly count = new CountUp();
  private baseY = 0;
  private width = 0;
  private height = 0;
  private tier = 0;
  private rendered = -1;
  private textWait = 0;

  constructor(scene: Phaser.Scene) {
    this.paperRoot = scene.add.container(0, 0).setDepth(DEPTH.featureOverlay).setVisible(false);
    this.ropes = scene.add.graphics();
    this.wood = scene.add.image(0, 0, 'wood-art', 'sign-wide');
    this.title = scene.add.text(0, 0, '', { fontFamily: FONT.title, color: '#f6c744' }).setOrigin(0.5);
    this.amount = scene.add
      .text(0, 0, '', { fontFamily: FONT.ui, fontStyle: 'bold', color: PALETTE.text })
      .setOrigin(0.5);
    this.hint = scene.add
      .text(0, 0, 'TAP TO CONTINUE', { fontFamily: FONT.ui, color: PALETTE.text })
      .setOrigin(0.5);
    this.root = scene.add
      .container(0, 0, [this.ropes, this.wood, this.title, this.amount, this.hint])
      .setDepth(DEPTH.featureOverlay)
      .setVisible(false);
    this.wood.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.skip());
    for (let i = 0; i < ANIM.streamers[2]; i++) {
      const p = scene.add
        .rectangle(0, 0, 1, 1, [PALETTE.cream, PALETTE.mustard, PALETTE.enamel][i % 3])
        .setVisible(false);
      this.paper.push(p);
      this.paperRoot.add(p);
    }
    scene.children.bringToTop(this.paperRoot);
  }
  get active(): boolean {
    return this.clock.progress < 1 || this.paperClock.progress < 1;
  }
  show(win: number, multiplier: number, label?: string, duration?: number): void {
    if (multiplier < 1500 || win <= 0) return;
    // Repeated jackpot hits still get their own tags; keep the current named banner readable.
    if (label && this.root.visible && this.title.text === label) return;
    this.tier = multiplier >= 10000 ? 2 : multiplier >= 5000 ? 1 : 0;
    this.title.setText(label ?? ['BIG WIN', 'MEGA WIN', 'EPIC WIN'][this.tier]);
    this.root.setVisible(true).setAlpha(1);
    void this.clock.wait(duration ?? ANIM.bigWinMs[this.tier]);
    void this.paperClock.wait(reducedMotion() ? 0 : ANIM.confetti.lifeMs);
    this.count.start(win, reducedMotion() ? 0 : ANIM.winMaxMs, 0, 0);
    this.rendered = -1;
    this.update(0, false);
  }
  skip(): void {
    this.clock.skip();
    this.paperClock.skip();
    this.paperRoot.setVisible(false);
    this.count.skip();
    this.root.setVisible(false);
  }
  relayout(layout: Layout): void {
    this.width = sd(Math.min(layout.board.w * 0.88, 760));
    this.paperWidth = Math.min(layout.board.w * 0.88, 760);
    this.height = sd(300);
    this.baseY = sy(layout.board.y + layout.board.h * 0.3);
    this.root.setPosition(sx(layout.board.x + layout.board.w / 2), this.baseY);
    this.paperRoot.setPosition(this.root.x, this.baseY);
    this.wood.setDisplaySize(this.width, this.height);
    this.title.setPosition(0, -this.height * 0.25).setFontSize(sd(52));
    this.amount.setFontSize(sd(64));
    this.hint.setPosition(0, this.height * 0.33).setFontSize(sd(23));
    this.ropes.clear().lineStyle(sd(5), PALETTE.cream, 0.8);
    for (const x of [-0.38, 0.38])
      this.ropes.lineBetween(x * this.width, -this.baseY, x * this.width, -this.height / 2);
    for (let i = 0; i < this.paper.length; i++)
      this.paper[i].setSize(sd(6 + (i % 3) * 2), sd(10 + (i % 4) * 3));
  }
  update(dt: number, turbo: boolean): void {
    if (!this.active) return;
    const still = reducedMotion(),
      step = dt / (turbo ? ANIM.turboFactor : 1);
    this.clock.update(step);
    this.paperClock.update(step);
    if (still) this.paperClock.skip();
    this.count.update(step);
    this.textWait -= dt;
    if (this.textWait <= 0 || !this.count.active) {
      if (this.rendered !== this.count.value) {
        this.rendered = this.count.value;
        this.amount.setText('₱' + formatMoney(this.rendered));
      }
      this.textWait = 33;
    }
    const t = this.clock.progress;
    this.root
      .setVisible(t < 1)
      .setY(this.baseY - (still ? 0 : sd(180) * (1 - easeOut(Math.min(1, t * 5)))))
      .setAlpha(Math.min(1, t * 8 + 0.05, (1 - t) * 8));
    const n = still ? 0 : ANIM.streamers[this.tier] / (turbo ? 2 : 1);
    this.paperRoot.setVisible(this.paperClock.progress < 1 && !still);
    for (let i = 0; i < this.paper.length; i++) {
      const p = this.paper[i];
      p.setVisible(i < n);
      if (i >= n) continue;
      sampleConfetti(i, this.paperClock.progress * ANIM.confetti.lifeMs, this.paperWidth, this.paperSample);
      p.setPosition(sd(this.paperSample[0]), sd(this.paperSample[1]))
        .setAngle(this.paperSample[2])
        .setScale(this.paperSample[3], 1)
        .setAlpha(this.paperSample[4]);
    }
  }
}
