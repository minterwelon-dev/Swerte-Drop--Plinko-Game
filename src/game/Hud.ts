import Phaser from 'phaser';
import { DEPTH, FONT, PALETTE, type ControlRect, type Layout } from '../constants';
import { gameConfig } from '../gameConfig';
import { RISKS, ROWS_OPTIONS, type Risk, type Rows } from '../math/config';
import { ButtonFx } from './animation/ButtonFx';
import { HudFx } from './animation/HudFx';
import { Timeline } from '../utils/timeline';
import { formatMultiplierShort } from '../utils/format';
import { reducedMotion, setReducedMotion, sd, sx, sy, viewport } from '../utils/responsive';

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
  lastMultiplier: number;
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

type ButtonKind = 'tab' | 'round' | 'tool' | 'drop' | 'link';

/** Cached button artwork with container-based interaction feedback. */
class Button {
  readonly root: Phaser.GameObjects.Container;
  readonly bg: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
  private readonly art: Phaser.GameObjects.Graphics;
  private readonly plate: Phaser.GameObjects.Image;
  private readonly texture: Phaser.Textures.CanvasTexture;
  private readonly symbol: Phaser.GameObjects.Graphics;
  private readonly sub: Phaser.GameObjects.Text;
  private readonly bulbs: Phaser.GameObjects.Image[] = [];
  readonly fx: ButtonFx;
  onBlocked: (() => void) | null = null;
  private pressed = false;
  private ambientMs = 0;
  private idleMs = 0;
  private homeY = 0;
  private counterY = 0;
  private readonly counterClock = new Timeline();
  private get still(): boolean {
    return reducedMotion();
  }
  private enabled = true;
  private selected = false;
  private rect: ControlRect | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly name: string,
    private readonly kind: ButtonKind,
    private readonly color: number,
    onTap: () => void,
    private readonly selectedColor = PALETTE.mustard as number,
  ) {
    this.art = scene.make.graphics({}, false);
    this.texture = scene.textures.createCanvas('button-' + name, 2, 2)!;
    this.plate = scene.add.image(0, 0, this.texture.key);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.art.destroy();
      scene.textures.remove(this.texture.key);
    });
    this.symbol = scene.add.graphics();
    this.bg = scene.add.rectangle(0, 0, 1, 1, 0, 0).setInteractive({ useHandCursor: true });
    this.label = scene.add
      .text(0, 0, name, {
        fontFamily: kind === 'drop' ? FONT.title : FONT.ui,
        fontStyle: kind === 'drop' ? 'normal' : 'bold',
      })
      .setOrigin(0.5);
    this.sub = scene.add
      .text(0, 0, kind === 'drop' ? 'DROP' : '', {
        fontFamily: FONT.ui,
        fontStyle: 'bold',
        color: PALETTE.text,
      })
      .setOrigin(0.5);
    this.root = scene.add
      .container(0, 0, [this.plate, this.symbol, this.label, this.sub, this.bg])
      .setDepth(DEPTH.hud);
    this.fx = new ButtonFx(this.root);
    scene.input.on('pointerdown', () => {
      this.idleMs = 0;
      this.root.setY(this.homeY);
    });
    if (kind === 'drop')
      for (let i = 0; i < 12; i++) {
        const bulb = scene.add.image(0, 0, 'bulb').setTint(i % 2 ? 0xffd36b : 0xffffff);
        this.bulbs.push(bulb);
        this.root.add(bulb);
      }
    this.bg.on('pointerdown', () => {
      if (!this.enabled) {
        this.onBlocked?.();
        return;
      }
      this.pressed = true;
      this.draw();
      this.fx.press(this.kind === 'drop');
      onTap();
    });
    this.bg.on('pointerup', () => {
      if (!this.pressed) return;
      this.pressed = false;
      this.draw();
      this.fx.release();
    });
    this.bg.on('pointerover', () => {
      if (this.enabled) this.root.setAlpha(0.9);
    });
    this.bg.on('pointerout', () => {
      if (this.pressed) {
        this.pressed = false;
        this.draw();
        this.fx.release();
      }
      this.root.setAlpha(this.fx.alpha);
    });
  }

  layout(rect: ControlRect): void {
    this.rect = rect;
    this.root.setPosition(sx(rect.x + rect.w / 2), sy(rect.y + rect.h / 2));
    this.homeY = this.root.y;
    this.bg.setSize(sd(Math.max(44, rect.w)), sd(Math.max(44, rect.h)));
    this.label.setFontSize(sd(rect.font));
    this.fx.layout();
    this.draw();
  }

  set(enabled: boolean, selected = false, text?: string): void {
    const changed = enabled !== this.enabled || selected !== this.selected;
    if (
      (!this.enabled && enabled && this.kind === 'drop') ||
      (!this.selected && selected && this.kind === 'tool')
    )
      this.fx.pop();
    this.fx.enabled(enabled);
    this.enabled = enabled;
    this.selected = selected;
    if (text !== undefined && text !== this.label.text) {
      if (this.name === 'AUTO' && selected) void this.counterClock.wait(gameConfig.motion.betMs);
      this.label.setText(text);
    }
    if (changed) this.draw();
  }

  update(dt: number, turbo: boolean): void {
    this.fx.update(dt, turbo);
    if (this.counterClock.progress < 1) {
      this.counterClock.update(dt / (turbo ? gameConfig.motion.turboFactor : 1));
      this.label
        .setY(this.counterY + (this.still ? 0 : sd(12) * (1 - this.counterClock.progress)))
        .setAlpha(this.counterClock.progress);
    }
    if (!this.scene.game.hasFocus) return;
    this.ambientMs += dt;
    this.idleMs += dt;
    if (this.kind === 'drop') {
      const phase = this.ambientMs / (this.enabled ? gameConfig.motion.swayMs : gameConfig.motion.swayMs * 2);
      for (let i = 0; i < this.bulbs.length; i++)
        this.bulbs[i].setAlpha(this.still ? 1 : 0.85 + 0.15 * Math.sin(phase * Math.PI * 2 + i * 0.2));
      if (!this.pressed && this.enabled && !this.still && this.idleMs > gameConfig.motion.idleMs) {
        this.root.setY(
          this.homeY - sd(3) * Math.max(0, Math.sin((this.idleMs / gameConfig.motion.idleMs) * Math.PI * 2)),
        );
      }
    }
    if (this.name === 'SKIP' && this.enabled && !this.still)
      this.root.setAlpha(0.85 + 0.15 * Math.sin((this.ambientMs / gameConfig.motion.swayMs) * Math.PI * 2));
    if (this.name === 'AUTO' && this.selected && !this.still)
      this.symbol.angle = (this.symbol.angle + dt * 0.09) % 360;
    else this.symbol.setAngle(0);
  }
  private draw(): void {
    if (!this.rect) return;
    this.paint();
    this.counterY = this.label.y;
    const w = Math.ceil(sd(this.rect.w + 32)),
      h = Math.ceil(sd(this.rect.h + 32));
    if (this.texture.width !== w || this.texture.height !== h) this.texture.setSize(w, h);
    // Cache filled paths on state/layout changes; avoid triangulating every button every frame.
    this.texture.clear();
    this.art.generateTexture(this.texture.key, w, h);
    this.plate
      .setTexture(this.texture.key)
      .setOrigin(0.5)
      .setDisplaySize(sd(this.rect.w + 32), sd(this.rect.h + 32));
  }
  private paint(): void {
    if (!this.rect) return;
    const { w, h } = this.rect;
    const color = this.selected ? this.selectedColor : this.color;
    const light = color === PALETTE.cream || color === PALETTE.mustard || color === 0x5fb59c;
    const ink = light ? PALETTE.ink : PALETTE.cream;
    const g = this.art.clear().translateCanvas(sd((w + 32) / 2), sd((h + 32) / 2)),
      icon = this.symbol.clear();
    this.root.setAlpha(this.fx.alpha);
    this.label.setColor(light ? PALETTE.textDark : PALETTE.text);
    this.label.setPosition(0, this.selected ? sd(2) : 0);
    if (this.kind === 'link') return;
    const shadow = this.selected || this.pressed ? 2 : 7;
    const wideDrop = this.kind === 'drop' && w > h * 1.5;
    this.sub.setVisible(this.kind === 'drop' && !wideDrop);
    for (const bulb of this.bulbs) bulb.setVisible(!wideDrop);
    if (this.kind === 'round' || (this.kind === 'drop' && !wideDrop)) {
      g.fillStyle(PALETTE.ink).fillCircle(0, sd(shadow), sd(w / 2 + 5));
      g.fillStyle(color).fillCircle(0, 0, sd(w / 2));
      if (this.kind === 'drop') {
        g.fillStyle(0xda493d, 0.55).fillCircle(0, -sd(w * 0.035), sd(w * 0.44));
        g.lineStyle(sd(5), PALETTE.ink).strokeCircle(0, 0, sd(w / 2));
        this.label.setY(-sd(h * 0.04)).setStroke('#1d130d', sd(2));
        this.sub.setPosition(0, sd(h * 0.26)).setFontSize(sd(h * 0.12));
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          this.bulbs[i]
            .setPosition(sd(Math.cos(a) * w * 0.62), sd(Math.sin(a) * w * 0.62))
            .setDisplaySize(sd(w * 0.2), sd(w * 0.25));
        }
      }
    } else {
      g.fillStyle(PALETTE.ink).fillRoundedRect(
        -sd(w / 2 + 4),
        -sd(h / 2 - shadow),
        sd(w + 8),
        sd(h + 4),
        sd(10),
      );
      g.fillStyle(color).fillRoundedRect(-sd(w / 2), -sd(h / 2), sd(w), sd(h), sd(7));
    }
    if (this.kind !== 'tool') return;
    this.label.setY(sd(h * 0.28));
    const a = Math.min(w, h) * 0.16,
      y = -h * 0.15;
    icon.lineStyle(sd(4), ink);
    icon.fillStyle(ink);
    if (this.name === 'TURBO') {
      icon
        .beginPath()
        .moveTo(sd(a * 0.3), sd(y - a))
        .lineTo(-sd(a * 0.6), sd(y + a * 0.15))
        .lineTo(sd(a * 0.15), sd(y + a * 0.15))
        .lineTo(-sd(a * 0.3), sd(y + a))
        .lineTo(sd(a * 0.7), sd(y - a * 0.2))
        .lineTo(-sd(a * 0.1), sd(y - a * 0.2))
        .closePath()
        .strokePath();
    } else if (this.name === 'AUTO') {
      icon
        .beginPath()
        .arc(0, sd(y), sd(a), 0.3, Math.PI * 1.85)
        .strokePath();
      icon.fillTriangle(sd(a), sd(y - a), sd(a), sd(y), 0, sd(y - a * 0.2));
    } else if (this.name === 'SKIP') {
      for (let i = -1; i < 1; i++)
        icon.strokeTriangle(sd(i * a), sd(y - a), sd(i * a), sd(y + a), sd((i + 1) * a), sd(y));
    } else {
      icon
        .beginPath()
        .moveTo(0, sd(y - a))
        .lineTo(sd(a), sd(y - a * 0.5))
        .lineTo(sd(a * 0.7), sd(y + a * 0.5))
        .lineTo(0, sd(y + a))
        .lineTo(-sd(a * 0.7), sd(y + a * 0.5))
        .lineTo(-sd(a), sd(y - a * 0.5))
        .closePath()
        .strokePath();
      icon.lineBetween(-sd(a * 0.4), sd(y), 0, sd(y + a * 0.35));
      icon.lineBetween(0, sd(y + a * 0.35), sd(a * 0.5), sd(y - a * 0.3));
    }
  }
}

export class Hud {
  readonly fx: HudFx;
  private readonly buttons: Button[];
  private canBet = false;
  settingsOpen = false;
  private layout: Layout | null = null;
  private readonly setup: Button;
  private readonly settingsDim: Phaser.GameObjects.Rectangle;
  private readonly settingsArt: Phaser.GameObjects.Graphics;
  private readonly counter: Phaser.GameObjects.Image;
  private readonly art: Phaser.GameObjects.Graphics;
  private readonly balance: Phaser.GameObjects.Text;
  private readonly lastWin: Phaser.GameObjects.Text;
  private readonly lastMultiplier: Phaser.GameObjects.Text;
  private readonly betValue: Phaser.GameObjects.Text;
  private readonly captions: Phaser.GameObjects.Text[] = [];
  private readonly message: Phaser.GameObjects.Text;
  private readonly noticeClock = new Timeline();
  private noticeY = 0;
  private readonly betDown: Button;
  private readonly betUp: Button;
  private readonly rowButtons: Button[];
  private readonly riskButtons: Button[];
  private readonly drop: Button;
  private readonly turbo: Button;
  private readonly auto: Button;
  private readonly skip: Button;
  private readonly fair: Button;
  private readonly feature: Button;
  private readonly soundBtn: Button;
  private readonly motionBtn: Button;

  constructor(
    private readonly scene: Phaser.Scene,
    ev: HudEvents,
  ) {
    this.settingsDim = scene.add
      .rectangle(0, 0, 1, 1, PALETTE.ink, 0.72)
      .setOrigin(0)
      .setDepth(DEPTH.dim)
      .setInteractive()
      .setVisible(false);
    this.settingsArt = scene.add.graphics().setDepth(DEPTH.modalPanel).setVisible(false);
    this.settingsDim.on('pointerdown', () => this.closeSettings());
    this.setup = new Button(scene, 'SETUP', 'tab', PALETTE.cream, () => {
      this.settingsOpen = !this.settingsOpen;
      this.showSettings();
    });
    scene.input.keyboard?.on('keydown-ESC', () => this.closeSettings());
    this.counter = scene.add.image(0, 0, 'wood-art').setOrigin(0).setTint(0xc4b09c).setDepth(DEPTH.hud);
    this.art = scene.add.graphics().setDepth(DEPTH.hud);
    const text = (value: string, color = PALETTE.text as string) =>
      scene.add
        .text(0, 0, value, {
          fontFamily: FONT.ui,
          fontStyle: 'bold',
          color,
        })
        .setDepth(DEPTH.hud);
    this.balance = text('', PALETTE.textDark);
    this.lastWin = text('', '#e0a02a');
    this.lastMultiplier = text('').setOrigin(1, 0);
    this.betValue = text('', '#e0a02a').setOrigin(0.5);
    this.fx = new HudFx(scene, this.balance, this.lastWin, this.betValue);
    this.message = text('', '#ffe27a').setOrigin(0.5);
    this.message.setBackgroundColor('#b92f27').setDepth(DEPTH.errorModal).setVisible(false);
    for (const c of ['BALANSE', 'PANALO', 'TAYA · BET', 'ROWS', 'RISK']) this.captions.push(text(c));
    this.captions[0].setColor(PALETTE.textDark);
    this.betDown = new Button(scene, '−', 'round', PALETTE.mustard, () => ev.onBet(-1));
    this.betUp = new Button(scene, '+', 'round', PALETTE.mustard, () => ev.onBet(1));
    this.rowButtons = ROWS_OPTIONS.map(
      (r) => new Button(scene, String(r), 'tab', 0x11271f, () => ev.onRows(r), PALETTE.cream),
    );
    this.riskButtons = RISKS.map(
      (r, i) =>
        new Button(
          scene,
          r.toUpperCase(),
          'tab',
          0x11271f,
          () => ev.onRisk(r),
          [0x5fb59c, PALETTE.mustard, PALETTE.enamel][i],
        ),
    );
    this.drop = new Button(scene, 'HULOG', 'drop', PALETTE.drop, ev.onDrop);
    this.turbo = new Button(scene, 'TURBO', 'tool', PALETTE.cream, ev.onTurbo);
    this.auto = new Button(scene, 'AUTO', 'tool', PALETTE.cream, ev.onAuto);
    this.skip = new Button(scene, 'SKIP', 'tool', PALETTE.cream, ev.onSkip);
    this.fair = new Button(scene, 'FAIR', 'tool', PALETTE.cream, () => {
      this.closeSettings();
      ev.onFair();
    });
    this.feature = new Button(scene, 'FEATURE', 'tab', 0x11271f, () => {
      this.closeSettings();
      ev.onFeature();
    });
    this.soundBtn = new Button(scene, 'SOUND', 'tab', 0x11271f, ev.onSound);
    this.motionBtn = new Button(scene, 'REDUCE FX', 'tab', 0x11271f, () => {
      setReducedMotion(!reducedMotion());
      this.motionBtn.set(true, reducedMotion());
    });
    this.buttons = [
      this.setup,
      this.betDown,
      this.betUp,
      ...this.rowButtons,
      ...this.riskButtons,
      this.drop,
      this.turbo,
      this.auto,
      this.skip,
      this.fair,
      this.feature,
      this.soundBtn,
      this.motionBtn,
    ];
    this.betDown.onBlocked = this.betUp.onBlocked = () => {
      if (this.canBet) this.fx.limit();
    };
  }

  update(dt: number, turbo: boolean): void {
    this.fx.update(dt, turbo);
    this.noticeClock.update(dt / (turbo ? gameConfig.motion.turboFactor : 1));
    this.message
      .setY(this.noticeY - (reducedMotion() ? 0 : sd(60) * (1 - this.noticeClock.progress)))
      .setAlpha(this.noticeClock.progress);
    for (let i = 0; i < this.buttons.length; i++) this.buttons[i].update(dt, turbo);
  }
  skipPresentation(): void {
    this.noticeClock.skip();
    this.fx.skip();
    for (let i = 0; i < this.buttons.length; i++) this.buttons[i].fx.skip();
  }
  closeSettings(): void {
    this.settingsOpen = false;
    this.showSettings();
  }

  private showSettings(): void {
    if (!this.layout) return;
    const drawer = !this.layout.landscape;
    const visible = !drawer || this.settingsOpen;
    this.settingsDim.setVisible(drawer && this.settingsOpen);
    this.settingsArt.setVisible(drawer && this.settingsOpen);
    this.scene.tweens.killTweensOf(this.settingsArt);
    if (drawer && this.settingsOpen) {
      this.settingsArt.setAlpha(0);
      this.scene.tweens.add({ targets: this.settingsArt, alpha: 1, duration: gameConfig.motion.modalOpenMs });
    }
    for (const button of [
      ...this.rowButtons,
      ...this.riskButtons,
      this.fair,
      this.feature,
      this.soundBtn,
      this.motionBtn,
    ])
      button.root.setVisible(visible).setDepth(drawer ? DEPTH.modal : DEPTH.hud);
    for (let i = 3; i < 5; i++)
      this.captions[i].setVisible(visible).setDepth(drawer ? DEPTH.modal : DEPTH.hud);
    this.setup.root.setVisible(drawer).setDepth(DEPTH.modal);
    this.setup.set(true, this.settingsOpen, this.settingsOpen ? 'CLOSE' : 'SETUP');
  }

  relayout(layout: Layout): void {
    this.layout = layout;
    if (layout.landscape) this.settingsOpen = false;
    const v = viewport();
    this.settingsDim.setSize(v.w * v.dpr, v.h * v.dpr);
    this.settingsArt.clear();
    if (layout.settings) {
      const r = layout.settings;
      this.settingsArt
        .fillStyle(PALETTE.ink)
        .fillRoundedRect(sx(r.x - 6), sy(r.y - 6), sd(r.w + 12), sd(r.h + 12), sd(24));
      this.settingsArt.fillStyle(PALETTE.felt).fillRoundedRect(sx(r.x), sy(r.y), sd(r.w), sd(r.h), sd(20));
    }
    if (layout.controls.setup) this.setup.layout(layout.controls.setup);
    this.showSettings();
    const g = this.art.clear(),
      p = layout.panel,
      c = layout.controls;
    this.counter
      .setFrame(layout.landscape ? 'counter-tall' : 'counter-wide')
      .setPosition(sx(p.x), sy(p.y))
      .setDisplaySize(sd(p.w), sd(p.h));
    g.fillStyle(0xa87442).fillRect(sx(p.x), sy(p.y), sd(p.w), sd(10));
    for (let i = 0; i < 2; i++) {
      const r = i === 0 ? layout.balance : layout.win;
      g.fillStyle(PALETTE.ink).fillRect(sx(r.x - 4), sy(r.y - 4), sd(r.w + 8), sd(r.h + 10));
      g.fillStyle(i === 0 ? PALETTE.cream : 0x11271f).fillRect(sx(r.x), sy(r.y), sd(r.w), sd(r.h));
      this.captions[i]
        .setPosition(sx(r.x + 22), sy(r.y + 8))
        .setFontSize(sd(layout.landscape ? 22 : 24))
        .setLetterSpacing(sd(2));
      const value = i === 0 ? this.balance : this.lastWin;
      value.setPosition(sx(r.x + 22), sy(r.y + r.h * 0.42)).setFontSize(sd(r.h * 0.48));
    }
    this.lastMultiplier
      .setPosition(sx(layout.win.x + layout.win.w - 20), sy(layout.win.y + 14))
      .setFontSize(sd(22));
    const bet = c.bet;
    g.fillStyle(PALETTE.ink).fillRoundedRect(
      sx(bet.x - 4),
      sy(bet.y - 4),
      sd(bet.w + 8),
      sd(bet.h + 8),
      sd(10),
    );
    g.fillStyle(0x11271f).fillRoundedRect(sx(bet.x), sy(bet.y), sd(bet.w), sd(bet.h), sd(6));
    this.captions[2]
      .setOrigin(0.5)
      .setPosition(sx(bet.x + bet.w / 2), sy(bet.y + bet.h * 0.2))
      .setFontSize(sd(bet.h * 0.2));
    this.betValue.setPosition(sx(bet.x + bet.w / 2), sy(bet.y + bet.h * 0.66)).setFontSize(sd(bet.h * 0.43));
    this.captions[3]
      .setPosition(sx(c.rowsCaption.x), sy(c.rowsCaption.y))
      .setOrigin(0, 0.5)
      .setFontSize(sd(22));
    this.captions[4]
      .setPosition(sx(c.riskCaption.x), sy(c.riskCaption.y))
      .setOrigin(0, 0.5)
      .setFontSize(sd(22));
    this.betDown.layout(c.betDown);
    this.betUp.layout(c.betUp);
    for (let i = 0; i < this.rowButtons.length; i++)
      this.rowButtons[i].layout({
        x: c.rows.x + (c.rows.w / 5) * i,
        y: c.rows.y,
        w: c.rows.w / 5 - 10,
        h: c.rows.h,
        font: c.rows.h * 0.38,
      });
    for (let i = 0; i < this.riskButtons.length; i++)
      this.riskButtons[i].layout({
        x: c.risk.x + (c.risk.w / 3) * i,
        y: c.risk.y,
        w: c.risk.w / 3 - 14,
        h: c.risk.h,
        font: c.risk.h * 0.34,
      });
    this.drop.layout(c.drop);
    this.turbo.layout(c.turbo);
    this.auto.layout(c.auto);
    this.skip.layout(c.skip);
    this.fair.layout(c.fair);
    const extraWidth = (c.sound.x + c.sound.w - c.feature.x - 16) / 3;
    this.feature.layout({ ...c.feature, w: extraWidth, font: Math.min(c.feature.font, 26) });
    this.soundBtn.layout({
      ...c.sound,
      x: c.feature.x + extraWidth + 8,
      w: extraWidth,
      font: Math.min(c.sound.font, 26),
    });
    this.motionBtn.layout({
      ...c.sound,
      x: c.feature.x + (extraWidth + 8) * 2,
      w: extraWidth,
      font: Math.min(c.sound.font, 26),
    });
    this.noticeY = sy(layout.board.y + 52);
    this.message
      .setPosition(sx(layout.board.x + layout.board.w / 2), this.noticeY)
      .setFontSize(sd(24))
      .setWordWrapWidth(sd(layout.board.w - 80))
      .setPadding(sd(18), sd(10));
    this.fx.relayout(layout);
  }

  set(s: HudState): void {
    this.canBet = s.canChangeBet;
    this.fx.sync(s.balance, s.lastWin, s.bet);
    this.lastMultiplier.setText(s.lastMultiplier ? formatMultiplierShort(s.lastMultiplier) : '\u2014');
    const levels = gameConfig.betLevels;
    const index = levels.indexOf(s.bet as (typeof levels)[number]);
    this.betDown.set(s.canChangeBet && index > 0);
    this.betUp.set(s.canChangeBet && index < levels.length - 1 && levels[index + 1] <= s.balance);
    for (let i = 0; i < ROWS_OPTIONS.length; i++)
      this.rowButtons[i].set(s.canChangeBoard, s.rows === ROWS_OPTIONS[i]);
    for (let i = 0; i < RISKS.length; i++) this.riskButtons[i].set(s.canChangeBoard, s.risk === RISKS[i]);
    this.drop.set(s.canDrop && !s.loading, false, s.loading ? 'Loading' : 'HULOG');
    this.turbo.set(true, s.turbo);
    this.auto.set(s.canAuto || s.autoRunning, s.autoRunning, s.autoRunning ? s.autoLabel : 'AUTO');
    this.skip.set(s.canSkip);
    this.fair.set(true);
    this.feature.set(s.canFeature);
    this.soundBtn.set(true, false, s.soundOn ? 'SOUND ON' : 'SOUND OFF');
    this.motionBtn.set(true, reducedMotion());
    if (s.message !== this.message.text) {
      this.message.setText(s.message).setVisible(!!s.message);
      void this.noticeClock.wait(gameConfig.motion.modalOpenMs);
    }
  }
}
