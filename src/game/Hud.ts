import Phaser from 'phaser';
import { DEPTH, PALETTE, type Layout } from '../constants';
import { RISKS, ROWS_OPTIONS, type Risk, type Rows } from '../math/config';
import { formatMoney } from '../utils/format';
import { sd, sx, sy } from '../utils/responsive';

export interface HudEvents {
  onDrop(): void;
  onBet(step: -1 | 1): void;
  onRows(rows: Rows): void;
  onRisk(risk: Risk): void;
  onTurbo(): void;
  onSkip(): void;
  onAuto(): void;
  onFair(): void;
  /** Simulated scatter trigger for the Stage B feature. */
  onFeature(): void;
  onSound(): void;
}

export interface HudState {
  balance: number;
  lastWin: number;
  bet: number;
  rows: Rows;
  risk: Risk;
  turbo: boolean;
  canDrop: boolean;
  canChangeBoard: boolean;
  canChangeBet: boolean;
  canSkip: boolean;
  /** "Auto", or "Stop 7" while auto-drop runs. */
  autoLabel: string;
  autoRunning: boolean;
  canAuto: boolean;
  canFeature: boolean;
  soundOn: boolean;
  /** Deferred assets still loading: Drop shows "Loading". */
  loading: boolean;
  message: string;
}

const FONT = 'Arial, sans-serif';

/** Rectangle + label with an enabled/selected look. */
class Button {
  readonly bg: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
  private enabled = true;
  private readonly baseColor: number;

  constructor(scene: Phaser.Scene, text: string, color: number, onTap: () => void) {
    this.baseColor = color;
    this.bg = scene.add
      .rectangle(0, 0, 10, 10, color)
      .setDepth(DEPTH.hud)
      .setInteractive({ useHandCursor: true });
    this.label = scene.add
      .text(0, 0, text, { fontFamily: FONT, fontStyle: 'bold', color: PALETTE.text })
      .setOrigin(0.5)
      .setDepth(DEPTH.hud);
    this.bg.on('pointerdown', () => {
      if (this.enabled) onTap();
    });
  }

  layout(x: number, y: number, w: number, h: number, fontRef: number): void {
    this.bg.setPosition(sx(x + w / 2), sy(y + h / 2)).setSize(sd(w), sd(h));
    this.bg.setStrokeStyle(sd(3), PALETTE.panelStroke);
    this.label.setPosition(this.bg.x, this.bg.y).setFontSize(sd(fontRef));
  }

  set(enabled: boolean, selected = false, text?: string): void {
    this.enabled = enabled;
    if (text !== undefined) this.label.setText(text);
    this.bg.setFillStyle(selected ? PALETTE.buttonActive : enabled ? this.baseColor : PALETTE.buttonDisabled);
    this.label.setColor(selected ? PALETTE.textDark : enabled ? PALETTE.text : PALETTE.textDim);
  }
}

/** Balance, last win, bet, rows, risk, turbo, drop, skip, auto, feature, fairness, sound. Emits intents; never calls the RGS. */
export class Hud {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly captions: Phaser.GameObjects.Text[] = [];
  private readonly balance: Phaser.GameObjects.Text;
  private readonly lastWin: Phaser.GameObjects.Text;
  private readonly betValue: Phaser.GameObjects.Text;
  private readonly message: Phaser.GameObjects.Text;
  private readonly betDown: Button;
  private readonly betUp: Button;
  private readonly rowButtons: Button[];
  private readonly riskButtons: Button[];
  private readonly turbo: Button;
  private readonly drop: Button;
  private readonly skip: Button;
  private readonly auto: Button;
  private readonly fair: Button;
  private readonly feature: Button;
  private readonly soundBtn: Button;

  constructor(scene: Phaser.Scene, ev: HudEvents) {
    this.bg = scene.add.graphics().setDepth(DEPTH.hud);
    const text = (s: string, color: string = PALETTE.text) =>
      scene.add.text(0, 0, s, { fontFamily: FONT, fontStyle: 'bold', color }).setDepth(DEPTH.hud);
    for (const c of ['Balance', 'Last win', 'Bet', 'Rows', 'Risk'])
      this.captions.push(text(c, PALETTE.textDim));
    this.balance = text('').setOrigin(1, 0.5);
    this.lastWin = text('').setOrigin(1, 0.5);
    this.betValue = text('').setOrigin(0.5);
    this.message = text('', '#ff8a8a').setOrigin(0.5);

    this.betDown = new Button(scene, '-', PALETTE.button, () => ev.onBet(-1));
    this.betUp = new Button(scene, '+', PALETTE.button, () => ev.onBet(1));
    this.rowButtons = ROWS_OPTIONS.map(
      (r) => new Button(scene, String(r), PALETTE.button, () => ev.onRows(r)),
    );
    this.riskButtons = RISKS.map(
      (r) => new Button(scene, r[0].toUpperCase() + r.slice(1), PALETTE.button, () => ev.onRisk(r)),
    );
    this.turbo = new Button(scene, 'Turbo', PALETTE.button, ev.onTurbo);
    this.drop = new Button(scene, 'DROP', PALETTE.drop, ev.onDrop);
    this.skip = new Button(scene, 'Skip', PALETTE.button, ev.onSkip);
    this.auto = new Button(scene, 'Auto', PALETTE.button, ev.onAuto);
    this.fair = new Button(scene, 'Fairness', PALETTE.button, ev.onFair);
    this.feature = new Button(scene, 'Feature', PALETTE.button, ev.onFeature);
    this.soundBtn = new Button(scene, 'Sound', PALETTE.button, ev.onSound);
  }

  relayout(layout: Layout): void {
    const p = layout.panel;
    const rowH = p.h / 7;
    const pad = rowH * 0.12;
    // Narrow landscape panel: size text by width too, so labels fit their buttons.
    const font = Math.min(rowH * 0.3, p.w * 0.042, 40);
    const labelW = p.w * 0.24;
    const ctrlX = p.x + labelW;
    const ctrlW = p.w - labelW;

    this.bg.clear();
    this.bg.fillStyle(PALETTE.panel, 0.92);
    this.bg.lineStyle(sd(4), PALETTE.panelStroke, 1);
    this.bg.fillRoundedRect(sx(p.x), sy(p.y), sd(p.w), sd(p.h), sd(28));
    this.bg.strokeRoundedRect(sx(p.x), sy(p.y), sd(p.w), sd(p.h), sd(28));

    const rowY = (i: number) => p.y + rowH * i;
    for (let i = 0; i < this.captions.length; i++) {
      this.captions[i]
        .setPosition(sx(p.x + pad * 2), sy(rowY(i) + rowH / 2))
        .setOrigin(0, 0.5)
        .setFontSize(sd(font));
    }
    this.balance.setPosition(sx(p.x + p.w - pad * 2), sy(rowY(0) + rowH / 2)).setFontSize(sd(font * 1.25));
    this.lastWin.setPosition(sx(p.x + p.w - pad * 2), sy(rowY(1) + rowH / 2)).setFontSize(sd(font * 1.1));

    const bh = Math.min(rowH - pad * 2, font * 2.6);
    const bOff = (rowH - bh) / 2;
    const step = ctrlW / 4;
    this.betDown.layout(ctrlX, rowY(2) + bOff, step - pad, bh, font * 1.2);
    this.betValue
      .setPosition(sx(ctrlX + step * 2 - pad / 2), sy(rowY(2) + rowH / 2))
      .setFontSize(sd(font * 1.15));
    this.betUp.layout(ctrlX + step * 3, rowY(2) + bOff, step - pad, bh, font * 1.2);

    const layoutRow = (buttons: Button[], row: number) => {
      const w = ctrlW / buttons.length;
      for (let i = 0; i < buttons.length; i++)
        buttons[i].layout(ctrlX + w * i, rowY(row) + bOff, w - pad, bh, font);
    };
    layoutRow(this.rowButtons, 3);
    layoutRow(this.riskButtons, 4);

    const ay = rowY(5) + bOff;
    const inner = p.w - pad * 4;
    const ax = p.x + pad * 2;
    this.turbo.layout(ax, ay, inner * 0.24, bh, font);
    this.drop.layout(ax + inner * 0.26, ay, inner * 0.48, bh, font * 1.4);
    this.skip.layout(ax + inner * 0.76, ay, inner * 0.24, bh, font);
    const tools = [this.auto, this.feature, this.fair, this.soundBtn];
    const toolW = inner / tools.length;
    for (let i = 0; i < tools.length; i++) {
      // Four tools share the row: smaller text so "Sound off" fits the narrow landscape panel.
      tools[i].layout(ax + toolW * i, rowY(6) + bOff, toolW - pad, bh, font * 0.8);
    }
    this.message.setPosition(sx(p.x + p.w / 2), sy(rowY(5) - pad / 2)).setFontSize(sd(font * 0.8));
  }

  set(s: HudState): void {
    this.balance.setText(formatMoney(s.balance));
    this.lastWin.setText(formatMoney(s.lastWin));
    this.betValue.setText(formatMoney(s.bet));
    this.betDown.set(s.canChangeBet);
    this.betUp.set(s.canChangeBet);
    for (let i = 0; i < ROWS_OPTIONS.length; i++)
      this.rowButtons[i].set(s.canChangeBoard, ROWS_OPTIONS[i] === s.rows);
    for (let i = 0; i < RISKS.length; i++) this.riskButtons[i].set(s.canChangeBoard, RISKS[i] === s.risk);
    this.turbo.set(true, s.turbo);
    this.drop.set(s.canDrop && !s.loading, false, s.loading ? 'Loading' : 'DROP');
    this.skip.set(s.canSkip);
    this.auto.set(s.canAuto || s.autoRunning, s.autoRunning, s.autoLabel);
    this.feature.set(s.canFeature);
    this.fair.set(true);
    this.soundBtn.set(true, false, s.soundOn ? 'Sound on' : 'Sound off');
    this.message.setText(s.message);
  }
}
