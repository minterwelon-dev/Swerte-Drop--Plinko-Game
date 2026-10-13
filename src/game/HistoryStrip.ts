import Phaser from 'phaser';
import { DEPTH, PALETTE, TIER_COLOR, type Layout } from '../constants';
import type { MultiplierX100 } from '../math/config';
import { formatMultiplierShort } from '../utils/format';
import { sd, sx, sy } from '../utils/responsive';
import { tierFor } from './Bins';

/** Last N multipliers, newest first, colour-coded by tier. */
export class HistoryStrip {
  private readonly chips: Phaser.GameObjects.Rectangle[] = [];
  private readonly texts: Phaser.GameObjects.Text[] = [];
  private readonly values: MultiplierX100[] = [];
  private readonly size: number;

  constructor(scene: Phaser.Scene, size: number) {
    this.size = size;
    for (let i = 0; i < size; i++) {
      this.chips.push(scene.add.rectangle(0, 0, 10, 10, 0xffffff).setDepth(DEPTH.hud).setVisible(false));
      this.texts.push(
        scene.add
          .text(0, 0, '', { fontFamily: 'Arial, sans-serif', fontStyle: 'bold', color: PALETTE.textDark })
          .setOrigin(0.5)
          .setDepth(DEPTH.hud)
          .setVisible(false),
      );
    }
  }

  push(m100: MultiplierX100): void {
    this.values.unshift(m100);
    if (this.values.length > this.size) this.values.length = this.size;
    this.refresh();
  }

  relayout(layout: Layout): void {
    const r = layout.history;
    const gapX = r.w / this.size;
    const w = gapX * 0.9;
    const h = r.h * 0.8;
    for (let i = 0; i < this.size; i++) {
      const x = sx(r.x + gapX * (i + 0.5));
      const y = sy(r.y + r.h / 2);
      this.chips[i].setPosition(x, y).setSize(sd(w), sd(h));
      this.texts[i].setPosition(x, y).setFontSize(Math.min(sd(h * 0.42), sd(w) / 3.6));
    }
  }

  private refresh(): void {
    for (let i = 0; i < this.size; i++) {
      const on = i < this.values.length;
      this.chips[i].setVisible(on);
      this.texts[i].setVisible(on);
      if (!on) continue;
      this.chips[i].setFillStyle(TIER_COLOR[tierFor(this.values[i])]).setAlpha(i === 0 ? 1 : 0.85);
      this.texts[i].setText(formatMultiplierShort(this.values[i]));
    }
  }
}
