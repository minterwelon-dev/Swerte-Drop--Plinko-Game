import type Phaser from 'phaser';
import { DEPTH, FONT, PALETTE, TIER_COLOR, type Tier } from '../constants';
import { sd, sx, sy } from '../utils/responsive';

/** The same notched prize ticket is used in the trough and the history strip. */
export class Ticket {
  readonly root: Phaser.GameObjects.Container;
  readonly hit: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
  private readonly art: Phaser.GameObjects.Graphics;
  private w = 1;
  private h = 1;
  private tier: Tier = 'lose';
  private newest = false;
  private vertical = false;

  constructor(scene: Phaser.Scene, depth: number = DEPTH.bins) {
    this.art = scene.add.graphics();
    this.hit = scene.add.rectangle(0, 0, 1, 1, 0, 0);
    this.label = scene.add
      .text(0, 0, '—', { fontFamily: FONT.ui, fontStyle: 'bold', color: PALETTE.text })
      .setOrigin(0.5);
    this.root = scene.add.container(0, 0, [this.art, this.label, this.hit]).setDepth(depth);
  }

  set(tier: Tier, text: string, newest = false): void {
    this.tier = tier;
    this.newest = newest;
    this.label.setText(text);
    const dark = tier === 'low' || tier === 'mid' || tier === 'mini' || tier === 'minor';
    this.label.setColor(dark ? PALETTE.textDark : PALETTE.text);
    this.draw();
  }

  layout(x: number, y: number, w: number, h: number, vertical = false): void {
    this.w = w;
    this.h = h;
    this.vertical = vertical;
    this.label.setAngle(vertical ? -90 : 0);
    this.root.setPosition(sx(x), sy(y));
    this.hit.setSize(sd(w), sd(h));
    this.draw();
  }

  private draw(): void {
    const w = sd(this.w),
      h = sd(this.h),
      g = this.art.clear();
    g.fillStyle(PALETTE.ink).fillRect(-w / 2 - sd(2), -h / 2 - sd(2), w + sd(4), h + sd(7));
    g.fillStyle(TIER_COLOR[this.tier]).fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle(PALETTE.ink, 0.23).fillRect(-w / 2, h / 2 - sd(5), w, sd(5));
    g.fillStyle(0x0b1c15).fillCircle(0, -h / 2, sd(Math.min(this.w * 0.13, this.h * 0.13)));
    if (this.newest)
      g.lineStyle(sd(3), PALETTE.mustard).strokeRect(-w / 2 - sd(3), -h / 2 - sd(3), w + sd(6), h + sd(6));
    const chars = Math.max(3, this.label.text.length);
    this.label.setFontSize(
      sd(
        this.vertical
          ? Math.min(this.w * 0.7, (this.h * 0.85) / (chars * 0.6))
          : Math.min(this.h * 0.44, (this.w * 0.91) / (chars * 0.6)),
      ),
    );
  }
}
