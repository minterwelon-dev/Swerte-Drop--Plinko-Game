import type Phaser from 'phaser';
import { DEPTH, FONT, PALETTE, type Layout } from '../constants';
import type { MultiplierX100 } from '../math/config';
import { formatMultiplierShort } from '../utils/format';
import { Timeline } from '../utils/timeline';
import { ANIM, easeOut } from './animation/animConfig';
import { reducedMotion, sd, sx, sy } from '../utils/responsive';
import { tierFor } from './Bins';
import { Ticket } from './Ticket';

/** Nine reusable stubs: one row in portrait, a 3-by-3 grid in landscape. */
export class HistoryStrip {
  private readonly tickets: Ticket[] = [];
  private readonly values: MultiplierX100[] = [];
  private readonly clock = new Timeline();
  private readonly fromX: Float32Array;
  private readonly fromY: Float32Array;
  private readonly toX: Float32Array;
  private readonly toY: Float32Array;
  private readonly outgoing: Ticket;
  private outgoingX = 0;
  private outgoingY = 0;
  private cellW = 0;
  private cellH = 0;
  private get still(): boolean {
    return reducedMotion();
  }
  private readonly caption: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    private readonly size: number,
  ) {
    this.fromX = new Float32Array(size);
    this.fromY = new Float32Array(size);
    this.toX = new Float32Array(size);
    this.toY = new Float32Array(size);
    this.outgoing = new Ticket(scene, DEPTH.hud);
    this.outgoing.root.setVisible(false);
    this.caption = scene.add
      .text(0, 0, '', { fontFamily: FONT.ui, fontStyle: 'bold', color: PALETTE.text })
      .setOrigin(0, 0.5)
      .setDepth(DEPTH.hud);
    for (let i = 0; i < size; i++) this.tickets.push(new Ticket(scene, DEPTH.hud));
    this.refresh();
  }

  push(value: MultiplierX100, short = false): void {
    const old = this.values[this.size - 1];
    if (old !== undefined && !short && !this.still) {
      const last = this.tickets[this.size - 1].root;
      this.outgoingX = last.x;
      this.outgoingY = last.y;
      this.outgoing.set(tierFor(old), formatMultiplierShort(old));
      this.outgoing.root.setPosition(last.x, last.y).setVisible(true).setAlpha(1);
    } else this.outgoing.root.setVisible(false);
    const first = this.tickets.pop()!;
    this.tickets.unshift(first);
    first.root.setPosition(this.toX[0] - sd(30), this.toY[0]);
    for (let i = 0; i < this.size; i++) {
      this.fromX[i] = this.tickets[i].root.x;
      this.fromY[i] = this.tickets[i].root.y;
    }
    void this.clock.wait(short || this.still ? 0 : ANIM.historyMs);
    this.values.unshift(value);
    if (this.values.length > this.size) this.values.length = this.size;
    this.refresh();
    if (short || this.still) this.skip();
  }

  relayout(layout: Layout): void {
    const r = layout.history,
      columns = layout.historyColumns;
    const rows = Math.ceil(this.size / columns);
    const cw = r.w / columns,
      ch = r.h / rows;
    this.caption
      .setText(layout.historyLabel.text)
      .setPosition(sx(layout.historyLabel.x), sy(layout.historyLabel.y))
      .setFontSize(sd(layout.historyLabel.font));
    this.cellW = cw - 12;
    this.cellH = ch - 12;
    for (let i = 0; i < this.size; i++) {
      this.toX[i] = sx(r.x + cw * ((i % columns) + 0.5));
      this.toY[i] = sy(r.y + ch * (Math.floor(i / columns) + 0.5));
      this.tickets[i].layout(
        r.x + cw * ((i % columns) + 0.5),
        r.y + ch * (Math.floor(i / columns) + 0.5),
        cw - 12,
        ch - 12,
      );
    }
    this.outgoing.layout(0, 0, this.cellW, this.cellH);
    this.skip();
  }

  get active(): boolean {
    return this.clock.progress < 1;
  }
  skip(): void {
    this.clock.skip();
    this.outgoing.root.setVisible(false);
    for (let i = 0; i < this.size; i++) this.tickets[i].root.setPosition(this.toX[i], this.toY[i]);
    this.refresh();
  }
  update(dt: number, turbo: boolean): void {
    if (!this.active) return;
    this.clock.update(dt / (turbo ? ANIM.turboFactor : 1));
    const t = this.clock.progress,
      p = easeOut(t);
    for (let i = 0; i < this.size; i++)
      this.tickets[i].root
        .setPosition(
          this.fromX[i] + (this.toX[i] - this.fromX[i]) * p,
          this.fromY[i] + (this.toY[i] - this.fromY[i]) * p,
        )
        .setAlpha(this.values[i] === undefined ? 0.45 : i === 0 ? p : 1);
    this.outgoing.root.setPosition(this.outgoingX + sd(12) * p, this.outgoingY).setAlpha(1 - p);
    if (t === 1) this.skip();
  }
  private refresh(): void {
    for (let i = 0; i < this.size; i++) {
      const value = this.values[i];
      this.tickets[i].set(
        value === undefined ? 'lose' : tierFor(value),
        value === undefined ? '—' : formatMultiplierShort(value),
        i === 0 && value !== undefined,
      );
      this.tickets[i].root.setAlpha(value === undefined ? 0.45 : 1);
    }
  }
}
