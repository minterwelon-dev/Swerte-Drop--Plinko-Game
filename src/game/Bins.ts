import Phaser from 'phaser';
import { DEPTH, FONT, PALETTE, TIER_COLOR, type Tier } from '../constants';
import { ANIM } from './animation/animConfig';
import { binProbabilities } from '../math/binomial';
import type { MultiplierX100, Risk, Rows } from '../math/config';
import { FEATURE_BINS, FEATURE_ROWS } from '../math/feature';
import { MULTIPLIERS } from '../math/multipliers';
import { formatMultiplier, formatMultiplierShort, formatProbability } from '../utils/format';
import { reducedMotion, sd, sx, sy, viewport } from '../utils/responsive';
import type { BoardGeometry } from './BallPath';
import { Ticket } from './Ticket';
import { gameConfig } from '../gameConfig';
import { Timeline } from '../utils/timeline';

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
  if (m100 < 300) return 'low';
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

/** Bin visuals, tier colours, hover/tap tooltip and landing feedback (bounce + multiplier popup). */
export class Bins {
  private readonly tickets: Ticket[] = [];
  private readonly retileClock = new Timeline();
  retile(): void {
    void this.retileClock.wait(ANIM.riskMs + ANIM.binStaggerMs * (this.defs.length - 1));
  }
  private readonly rings: Phaser.GameObjects.Ellipse[] = [];
  private get still(): boolean {
    return reducedMotion();
  }
  private readonly bounce = new Float32Array(MAX_BINS);
  private readonly duration = new Float32Array(MAX_BINS);
  private readonly quiet = new Uint8Array(MAX_BINS);
  private readonly jackpotHit = new Uint8Array(MAX_BINS);
  private readonly tipBg: Phaser.GameObjects.Rectangle;
  private readonly tip: Phaser.GameObjects.Text;
  private tipBin = -1;
  private defs: BinDef[] = [];
  private geo: BoardGeometry | null = null;

  constructor(scene: Phaser.Scene) {
    for (let k = 0; k < MAX_BINS; k++) {
      const ticket = new Ticket(scene);
      ticket.root.setVisible(false);
      ticket.hit.setInteractive({ useHandCursor: true });
      ticket.hit.on('pointerover', () => this.showTip(k));
      ticket.hit.on('pointerout', () => this.hideTip());
      ticket.hit.on('pointerdown', () => this.showTip(k));
      this.tickets.push(ticket);
      this.rings.push(scene.add.ellipse(0, 0, 10, 10).setDepth(DEPTH.popups).setVisible(false));
    }

    this.tipBg = scene.add.rectangle(0, 0, 10, 10, 0x120a22, 0.92).setDepth(DEPTH.popups).setVisible(false);
    this.tip = scene.add
      .text(0, 0, '', { fontFamily: FONT.ui, color: PALETTE.text, align: 'center' })
      .setOrigin(0.5)
      .setDepth(DEPTH.popups)
      .setVisible(false);
  }

  setBins(defs: BinDef[], geo: BoardGeometry): void {
    if (defs.length > MAX_BINS) throw new Error(`at most ${MAX_BINS} bins`);
    this.defs = defs;
    for (let k = 0; k < MAX_BINS; k++) {
      const on = k < defs.length;
      this.tickets[k].root.setVisible(on);
      if (on) {
        this.tickets[k].set(defs[k].tier, defs[k].label ?? formatMultiplierShort(defs[k].multiplierX100));
      }
      this.bounce[k] = 0;
      this.rings[k].setVisible(false);
    }
    this.hideTip();
    this.relayout(geo);
  }

  relayout(geo: BoardGeometry): void {
    this.geo = geo;
    for (let k = 0; k < this.defs.length; k++)
      this.tickets[k].layout(
        geo.binX(k),
        geo.binY,
        geo.binW,
        geo.binH,
        !viewport().landscape && geo.rows >= 14,
      );
    this.tip.setFontSize(sd(38));
    if (this.tipBin >= 0) this.showTip(this.tipBin);
  }

  tierOf(k: number): Tier {
    return this.defs[k].tier;
  }

  get active(): boolean {
    if (this.retileClock.progress < 1) return true;
    for (let i = 0; i < this.bounce.length; i++) if (this.bounce[i] > 0) return true;
    return false;
  }

  land(k: number, short = false): void {
    const def = this.defs[k];
    if (!this.geo || !def) return;
    this.quiet[k] = Number(short || this.still || def.multiplierX100 < 100);
    this.jackpotHit[k] = 0;
    this.duration[k] = this.quiet[k] ? ANIM.shortMs : ANIM.landingMs + ANIM.settleMs;
    this.bounce[k] = this.duration[k];
    this.rings[k].setStrokeStyle(sd(3), TIER_COLOR[def.tier]).setVisible(!this.quiet[k]);
  }

  jackpot(k: number): void {
    if (this.still || !this.defs[k]) return;
    this.duration[k] = this.bounce[k] = gameConfig.feature.jackpotMs;
    this.quiet[k] = 0;
    this.jackpotHit[k] = 1;
  }

  skip(): void {
    this.retileClock.skip();
    for (let k = 0; k < this.defs.length; k++) {
      this.bounce[k] = 0;
      this.tickets[k].root.setScale(1).setAlpha(1);
      this.rings[k].setVisible(false);
      if (this.geo) this.tickets[k].root.setY(sy(this.geo.binY));
    }
  }

  update(dt: number, turbo = false): void {
    const geo = this.geo;
    if (!geo) return;
    if (this.retileClock.progress < 1) {
      this.retileClock.update(dt / (turbo ? ANIM.turboFactor : 1));
      const elapsed = this.retileClock.progress * (ANIM.riskMs + ANIM.binStaggerMs * (this.defs.length - 1));
      for (let k = 0; k < this.defs.length; k++) {
        const t = Math.min(1, Math.max(0, (elapsed - k * ANIM.binStaggerMs) / ANIM.riskMs));
        this.tickets[k].root
          .setScale(this.still ? 1 : Math.sin((t * Math.PI) / 2), 1)
          .setAlpha(this.still ? t : 1);
      }
    }
    for (let k = 0; k < this.defs.length; k++) {
      if (this.bounce[k] <= 0) continue;
      this.bounce[k] = Math.max(0, this.bounce[k] - dt / (turbo ? ANIM.turboFactor : 1));
      const t = 1 - this.bounce[k] / this.duration[k];
      const lift = this.jackpotHit[k] ? Math.min(1, (this.duration[k] - this.bounce[k]) / ANIM.landingMs) : t;
      const dy = this.still ? 0 : -Math.sin(lift * Math.PI) * (this.quiet[k] ? 3 : 12);
      this.tickets[k].root.setY(sy(geo.binY + dy));
      this.rings[k]
        .setPosition(sx(geo.binX(k)), sy(geo.binY + dy))
        .setSize(sd(geo.binW * 1.05), sd(geo.binH * 1.05))
        // Two glow pulses per jackpotMs: 1 Hz normal, 2 Hz turbo (spec limit 3 Hz).
        .setAlpha((1 - t) * (this.jackpotHit[k] ? 0.35 + 0.35 * Math.sin(t * Math.PI * 2) ** 2 : 0.7))
        .setVisible(!this.quiet[k] && t < 1);
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
