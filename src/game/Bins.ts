import Phaser from 'phaser';
import { DEPTH, PALETTE, TIER_COLOR, type Tier } from '../constants';
import { binProbabilities } from '../math/binomial';
import type { MultiplierX100, Risk, Rows } from '../math/config';
import { FEATURE_BINS, FEATURE_ROWS } from '../math/feature';
import { MULTIPLIERS } from '../math/multipliers';
import { formatMultiplier, formatMultiplierShort, formatProbability } from '../utils/format';
import { sd, sx, sy } from '../utils/responsive';
import type { BoardGeometry } from './BallPath';

/** What a bin shows. The board renders any BinDef[], so the Stage B feature can add jackpot bins. */
export interface BinDef {
  multiplierX100: MultiplierX100;
  tier: Tier;
  /** Landing probability, from math data. */
  probability: number;
  label?: string;
}

export function tierFor(m100: MultiplierX100): Tier {
  if (m100 < 100) return 'lose';
  if (m100 < 200) return 'low';
  if (m100 < 1000) return 'mid';
  if (m100 < 10000) return 'high';
  return 'top';
}

/** Classic bins straight from the generated tables. */
export function classicBinDefs(rows: Rows, risk: Risk): BinDef[] {
  const p = binProbabilities(rows);
  return MULTIPLIERS[risk][rows].map((m, k) => ({ multiplierX100: m, tier: tierFor(m), probability: p[k] }));
}

/** Stage B feature bins: coin multipliers plus Mini, Minor and Major jackpot bins. */
export function featureBinDefs(): BinDef[] {
  const p = binProbabilities(FEATURE_ROWS);
  return FEATURE_BINS.map((b, k) => ({
    multiplierX100: b.multiplierX100,
    tier: b.jackpot ?? tierFor(b.multiplierX100),
    probability: p[k],
    label: b.jackpot && b.jackpot[0].toUpperCase() + b.jackpot.slice(1),
  }));
}

const MAX_BINS = 17;
const BOUNCE_MS = 260;
const POPUP_POOL = 10;
const POPUP_MS = 800;

/** Bin visuals, tier colours, hover/tap tooltip and landing feedback (bounce + multiplier popup). */
export class Bins {
  private readonly rects: Phaser.GameObjects.Rectangle[] = [];
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private readonly bounce = new Float32Array(MAX_BINS);
  private readonly popups: Phaser.GameObjects.Text[] = [];
  private readonly popupLife = new Float32Array(POPUP_POOL);
  private readonly popupY = new Float32Array(POPUP_POOL);
  private nextPopup = 0;
  private readonly tipBg: Phaser.GameObjects.Rectangle;
  private readonly tip: Phaser.GameObjects.Text;
  private tipBin = -1;
  private defs: BinDef[] = [];
  private geo: BoardGeometry | null = null;

  constructor(scene: Phaser.Scene) {
    for (let k = 0; k < MAX_BINS; k++) {
      const r = scene.add.rectangle(0, 0, 10, 10, 0xffffff).setDepth(DEPTH.bins).setVisible(false);
      r.setInteractive({ useHandCursor: true });
      r.on('pointerover', () => this.showTip(k));
      r.on('pointerout', () => this.hideTip());
      r.on('pointerdown', () => (this.tipBin === k ? this.hideTip() : this.showTip(k)));
      this.rects.push(r);
      this.labels.push(
        scene.add
          .text(0, 0, '', { fontFamily: 'Arial, sans-serif', fontStyle: 'bold', color: PALETTE.textDark })
          .setOrigin(0.5)
          .setDepth(DEPTH.bins)
          .setVisible(false),
      );
    }
    for (let i = 0; i < POPUP_POOL; i++) {
      this.popups.push(
        scene.add
          .text(0, 0, '', { fontFamily: 'Arial, sans-serif', fontStyle: 'bold', color: PALETTE.text })
          .setOrigin(0.5)
          .setDepth(DEPTH.popups)
          .setStroke('#1a0f2e', 6)
          .setVisible(false),
      );
    }
    this.tipBg = scene.add.rectangle(0, 0, 10, 10, 0x120a22, 0.92).setDepth(DEPTH.popups).setVisible(false);
    this.tip = scene.add
      .text(0, 0, '', { fontFamily: 'Arial, sans-serif', color: PALETTE.text, align: 'center' })
      .setOrigin(0.5)
      .setDepth(DEPTH.popups)
      .setVisible(false);
  }

  setBins(defs: BinDef[], geo: BoardGeometry): void {
    if (defs.length > MAX_BINS) throw new Error(`at most ${MAX_BINS} bins`);
    this.defs = defs;
    for (let k = 0; k < MAX_BINS; k++) {
      const on = k < defs.length;
      this.rects[k].setVisible(on);
      this.labels[k].setVisible(on);
      if (on) {
        this.rects[k].setFillStyle(TIER_COLOR[defs[k].tier]);
        this.labels[k].setText(defs[k].label ?? formatMultiplierShort(defs[k].multiplierX100));
      }
      this.bounce[k] = 0;
    }
    this.hideTip();
    this.relayout(geo);
  }

  relayout(geo: BoardGeometry): void {
    this.geo = geo;
    const w = sd(geo.binW);
    const h = sd(geo.binH);
    for (let k = 0; k < this.defs.length; k++) {
      const r = this.rects[k];
      r.setSize(w, h).setPosition(sx(geo.binX(k)), sy(geo.binY));
      r.setStrokeStyle(sd(3), 0x1a0f2e, 0.6);
      const label = this.labels[k];
      // Fit the label inside the bin: ~0.6 em per character.
      const chars = Math.max(3, label.text.length);
      label.setFontSize(Math.min(sd(geo.binH * 0.42), (w * 0.92) / (chars * 0.6)));
      label.setPosition(r.x, r.y);
    }
    const popupSize = sd(geo.binW * 0.42);
    for (let i = 0; i < POPUP_POOL; i++) this.popups[i].setFontSize(popupSize).setStroke('#1a0f2e', sd(6));
    this.tip.setFontSize(sd(28));
    if (this.tipBin >= 0) this.showTip(this.tipBin);
  }

  tierOf(k: number): Tier {
    return this.defs[k].tier;
  }

  /** Landing feedback for bin k. */
  land(k: number): void {
    const def = this.defs[k];
    if (!this.geo || !def) return;
    this.bounce[k] = BOUNCE_MS;
    const p = this.popups[this.nextPopup];
    this.popupLife[this.nextPopup] = POPUP_MS;
    this.popupY[this.nextPopup] = this.geo.binY - this.geo.binH;
    this.nextPopup = (this.nextPopup + 1) % POPUP_POOL;
    p.setText(def.label ?? formatMultiplier(def.multiplierX100))
      .setColor(`#${TIER_COLOR[def.tier].toString(16).padStart(6, '0')}`)
      .setPosition(sx(this.geo.binX(k)), sy(this.geo.binY - this.geo.binH))
      .setAlpha(1)
      .setVisible(true);
  }

  update(dt: number): void {
    const geo = this.geo;
    if (!geo) return;
    for (let k = 0; k < this.defs.length; k++) {
      if (this.bounce[k] <= 0) continue;
      this.bounce[k] = Math.max(0, this.bounce[k] - dt);
      const dy = Math.sin((1 - this.bounce[k] / BOUNCE_MS) * Math.PI) * geo.binH * 0.25;
      this.rects[k].setY(sy(geo.binY + dy));
      this.labels[k].setY(sy(geo.binY + dy));
    }
    for (let i = 0; i < POPUP_POOL; i++) {
      if (this.popupLife[i] <= 0) continue;
      this.popupLife[i] -= dt;
      const p = this.popups[i];
      if (this.popupLife[i] <= 0) {
        p.setVisible(false);
        continue;
      }
      const life = this.popupLife[i] / POPUP_MS;
      p.setY(sy(this.popupY[i] - (1 - life) * geo.gap * 1.5)).setAlpha(Math.min(1, life * 2));
    }
  }

  private showTip(k: number): void {
    const geo = this.geo;
    const def = this.defs[k];
    if (!geo || !def) return;
    this.tipBin = k;
    const name = def.label ? `${def.label} ` : '';
    this.tip.setText(`${name}${formatMultiplier(def.multiplierX100)}\n${formatProbability(def.probability)}`);
    // Keep the tooltip inside the board horizontally.
    const half = this.tip.width / 2 + sd(16);
    const x = Math.min(Math.max(sx(geo.binX(k)), sx(geo.rect.x) + half), sx(geo.rect.x + geo.rect.w) - half);
    const y = sy(geo.binY - geo.binH * 1.6);
    this.tip.setPosition(x, y).setVisible(true);
    this.tipBg
      .setSize(this.tip.width + sd(32), this.tip.height + sd(16))
      .setPosition(x, y)
      .setVisible(true);
  }

  private hideTip(): void {
    this.tipBin = -1;
    this.tip.setVisible(false);
    this.tipBg.setVisible(false);
  }
}
