import Phaser from 'phaser';
import { DEPTH, FONT, PALETTE, type Layout } from '../constants';
import { reducedMotion, sd, sx, sy, viewport } from '../utils/responsive';
import { Timeline } from '../utils/timeline';
import { ANIM } from './animation/animConfig';

/** Reference canopy and hanging plank, with a single ambient clock for all bulbs. */
export class Booth {
  private readonly art: Phaser.GameObjects.Graphics;
  private readonly plank: Phaser.GameObjects.Graphics;
  private readonly wood: Phaser.GameObjects.Image;
  private readonly canopy: Phaser.GameObjects.Image[] = [];
  private readonly canopyRoots: Phaser.GameObjects.Container[] = [];
  readonly sign: Phaser.GameObjects.Container;
  private readonly title: Phaser.GameObjects.Text;
  private readonly caption: Phaser.GameObjects.Text;
  private readonly bulbs: Phaser.GameObjects.Container[] = [];
  private readonly lights: Phaser.GameObjects.Image[] = [];
  private elapsed = 0;
  private chase = new Timeline();
  private bump = new Timeline();
  private intro = new Timeline();
  private signY = 0;
  private bulbCount = 16;

  startIntro(): void {
    void this.intro.wait(ANIM.introMs);
  }
  celebrate(multiplier: number): void {
    if (reducedMotion()) return;
    if (multiplier >= 200) void this.chase.wait(ANIM.chaseMs);
    if (multiplier >= 500) void this.bump.wait(ANIM.signBumpMs);
  }
  skip(): void {
    this.intro.skip();
    this.chase.skip();
    this.bump.skip();
    this.sign.setAngle(0).setY(this.signY);
  }
  update(dt: number, turbo: boolean): void {
    const still = reducedMotion();
    this.elapsed += dt;
    const step = dt / (turbo ? ANIM.turboFactor : 1);
    this.chase.update(step);
    this.bump.update(step);
    this.intro.update(step);
    const intro = this.intro.progress;
    this.sign
      .setAngle(
        still
          ? 0
          : Math.sin((this.elapsed / ANIM.swayMs) * Math.PI * 2) * 0.8 +
              Math.sin(intro * Math.PI * 2) * 6 * (1 - intro) +
              Math.sin(this.bump.progress * Math.PI * 4) * 3 * (1 - this.bump.progress),
      )
      .setY(this.signY - (still ? 0 : sd(100) * (1 - intro) ** 3));
    for (let i = 0; i < this.bulbs.length; i++) {
      const lit = this.chase.progress < 1 && Math.abs(i / this.bulbCount - this.chase.progress) < 0.08;
      this.bulbs[i].setAlpha(
        still
          ? 1
          : lit
            ? 1
            : (0.925 + 0.075 * Math.sin((this.elapsed / ANIM.swayMs) * Math.PI * 2 + i)) *
              Math.min(1, Math.max(0, intro * 2 - i / this.bulbCount)),
      );
    }
    for (let i = 0; i < this.canopy.length; i++)
      this.canopyRoots[i].setY(still ? 0 : -this.canopy[i].displayHeight * (1 - intro) ** 3);
  }

  constructor(scene: Phaser.Scene) {
    this.art = scene.add.graphics().setDepth(DEPTH.background);
    this.plank = scene.add.graphics();
    this.wood = scene.add.image(0, 0, 'wood-art');
    for (let i = 0; i < 3; i++) {
      const image = scene.add.image(0, 0, 'canopy-art').setOrigin(0);
      this.canopy.push(image);
      this.canopyRoots.push(scene.add.container(0, 0, [image]).setDepth(DEPTH.background));
    }
    this.title = scene.add
      .text(0, 0, '', { fontFamily: FONT.title, color: '#f6c744', align: 'center' })
      .setOrigin(0.5);
    this.caption = scene.add
      .text(0, 0, 'HULOG-BOLA · PLAY MONEY ONLY', {
        fontFamily: FONT.ui,
        fontStyle: 'bold',
        color: PALETTE.text,
      })
      .setOrigin(0.5);
    this.sign = scene.add
      .container(0, 0, [this.plank, this.wood, this.title, this.caption])
      .setDepth(DEPTH.hud);
    for (let i = 0; i < 42; i++) {
      const light = scene.add.image(0, 0, 'bulb').setTint([0xffd36b, 0xffffff, 0xffb347][i % 3]);
      this.lights.push(light);
      this.bulbs.push(scene.add.container(0, 0, [light]).setDepth(DEPTH.background));
    }
  }

  relayout(layout: Layout): void {
    this.bulbCount = layout.canopy.bulbs;
    const v = viewport();
    const width = v.w * v.dpr;
    const g = this.art.clear();
    g.fillStyle(0x14231e).fillRect(0, 0, width, v.h * v.dpr);
    g.lineStyle(sd(2), 0x0e1c17, 0.45);
    for (let x = 0; x < width; x += sd(72)) g.lineBetween(x, 0, x, v.h * v.dpr);
    const r = layout.sign;
    g.lineStyle(sd(4), PALETTE.ink);
    for (const x of [r.x + r.w * 0.1, r.x + r.w * 0.9])
      g.lineBetween(sx(x), sy(layout.canopy.height), sx(x), sy(r.y));
    const sections = layout.landscape ? 3 : 1;
    for (let i = 0; i < this.canopy.length; i++) {
      this.canopyRoots[i].setPosition((width * i) / sections, 0).setVisible(i < sections);
      this.canopy[i]
        .setVisible(i < sections)
        .setPosition(0, 0)
        .setDisplaySize(width / sections, sy(layout.canopy.height) * 1.25);
    }
    g.lineStyle(sd(3), PALETTE.ink);
    const yAt = (t: number) => sy(layout.canopy.height + 18 + Math.sin(((t * 4) % 1) * Math.PI) * 24);
    for (let i = 0; i < 80; i++)
      g.lineBetween((width * i) / 80, yAt(i / 80), (width * (i + 1)) / 80, yAt((i + 1) / 80));
    for (let i = 0; i < this.bulbs.length; i++) {
      this.bulbs[i].setVisible(i < layout.canopy.bulbs);
      if (i >= layout.canopy.bulbs) continue;
      const t = (i + 0.5) / layout.canopy.bulbs;
      this.bulbs[i].setPosition(width * t, yAt(t) + sd(10));
      this.lights[i].setDisplaySize(sd(60), sd(68));
    }
    this.sign.setPosition(sx(r.x + r.w / 2), sy(r.y + r.h / 2));
    this.signY = this.sign.y;
    const p = this.plank.clear();
    p.fillStyle(PALETTE.ink).fillRoundedRect(
      -sd(r.w / 2 + 5),
      -sd(r.h / 2 - 8),
      sd(r.w + 10),
      sd(r.h + 8),
      sd(10),
    );
    this.wood.setFrame(layout.landscape ? 'sign-tall' : 'sign-wide').setDisplaySize(sd(r.w), sd(r.h));
    this.title
      .setText(layout.signText)
      .setPosition(0, -sd(r.h * 0.12))
      .setFontSize(sd(layout.signFont));
    this.title.setStroke('#1d130d', sd(4)).setShadow(sd(2), sd(3), '#1d130d', 0, false, true);
    this.title.setLineSpacing(-sd(12));
    this.caption.setPosition(0, sd(r.h * 0.37)).setFontSize(sd(layout.signCaptionFont));
    this.caption.setLetterSpacing(sd(1));
  }
}
