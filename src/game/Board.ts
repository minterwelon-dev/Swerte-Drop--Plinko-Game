import Phaser from 'phaser';
import { DEPTH, FONT, PALETTE, type Layout } from '../constants';
import { reducedMotion, sd, sx, sy } from '../utils/responsive';
import { Timeline } from '../utils/timeline';
import { ANIM } from './animation/animConfig';
import { BoardGeometry } from './BallPath';

const FLASH_POOL = 24;
const FLASH_MS = ANIM.pegMs;

/** Felt board, baked brass pegs, hopper, active-ball badge and pooled hit overlays. */
export class Board {
  readonly geo = new BoardGeometry();
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly felt: Phaser.GameObjects.Image;
  private readonly decoration: Phaser.GameObjects.Graphics;
  private readonly scene: Phaser.Scene;
  private pegs: Phaser.GameObjects.RenderTexture | null = null;
  private readonly brush: Phaser.GameObjects.Image;
  private readonly flashes: Phaser.GameObjects.Image[] = [];
  private readonly flashLife = new Float32Array(FLASH_POOL);
  private readonly badge: Phaser.GameObjects.Container;
  private readonly badgeArt: Phaser.GameObjects.Graphics;
  private readonly badgeLabel: Phaser.GameObjects.Text;
  private readonly dots: Phaser.GameObjects.Arc[] = [];
  private readonly dotLife = new Float32Array(5);
  private readonly hopperArt: Phaser.GameObjects.Graphics;
  private readonly releaseClock = new Timeline();
  private readonly rebuildClock = new Timeline();
  private readonly readyBall: Phaser.GameObjects.Image;
  private readonly hopper: Phaser.GameObjects.Container;
  private nextFlash = 0;
  private activeBalls = -1;
  private layout: Layout | null = null;
  private get still(): boolean {
    return reducedMotion();
  }
  rebuild(): void {
    void this.rebuildClock.wait(ANIM.rowsMs);
  }

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.panel = scene.add.graphics().setDepth(DEPTH.boardPanel);
    this.felt = scene.add.image(0, 0, 'board-art').setOrigin(0).setDepth(DEPTH.boardPanel);
    this.decoration = scene.add.graphics().setDepth(DEPTH.boardPanel);
    this.brush = scene.make.image({ key: 'brass-peg', add: false });
    this.badgeArt = scene.add.graphics();
    this.badgeLabel = scene.add
      .text(0, 0, 'BOLA', { fontFamily: FONT.ui, fontStyle: 'bold', color: PALETTE.text })
      .setOrigin(0, 0.5);
    this.badge = scene.add.container(0, 0, [this.badgeArt, this.badgeLabel]).setDepth(DEPTH.hud);
    for (let i = 0; i < 5; i++) {
      const dot = scene.add.circle(0, 0, 1, 0x365047);
      this.dots.push(dot);
      this.badge.add(dot);
    }
    this.readyBall = scene.add.image(0, 0, 'ball');
    this.hopperArt = scene.add.graphics();
    this.hopper = scene.add.container(0, 0, [this.hopperArt, this.readyBall]).setDepth(DEPTH.pegs);
    for (let i = 0; i < FLASH_POOL; i++)
      this.flashes.push(
        scene.add
          .image(0, 0, 'dot')
          .setDepth(DEPTH.pegFlash)
          .setTint(PALETTE.pegFlash)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setVisible(false),
      );
    this.setActiveBalls(0);
  }

  setActiveBalls(count: number): void {
    if (count === this.activeBalls) return;
    for (let i = 0; i < this.dots.length; i++) {
      if (i < count !== i < this.activeBalls) this.dotLife[i] = ANIM.badgeMs;
      this.dots[i].setFillStyle(i < count ? 0xf6c744 : 0x365047);
    }
    this.activeBalls = count;
    this.readyBall.setVisible(count === 0);
  }

  setRows(rows: number): void {
    if (this.layout) this.relayout(this.layout, rows);
    else this.geo.rows = rows;
  }

  relayout(layout: Layout, rows = this.geo.rows): void {
    this.layout = layout;
    const r = layout.board;
    const g = this.geo.set({ x: r.x + 28, y: r.y + 26, w: r.w - 56, h: r.h - 52 }, rows);
    const panel = this.panel.clear();
    panel.fillStyle(PALETTE.ink).fillRoundedRect(sx(r.x - 4), sy(r.y + 10), sd(r.w + 8), sd(r.h + 8), sd(34));
    panel.fillStyle(PALETTE.frame).fillRoundedRect(sx(r.x), sy(r.y), sd(r.w), sd(r.h), sd(30));
    this.felt.setPosition(sx(r.x), sy(r.y)).setDisplaySize(sd(r.w), sd(r.h));
    const d = this.decoration.clear();
    // One mirrored stencil, safely below the badge and outside every peg triangle.
    for (const side of [-1, 1])
      for (let i = 0; i < 3; i++) {
        const x = g.cx + side * (r.w * 0.38 - i * 24),
          y = r.y + 132 + i * 28;
        d.fillStyle(i % 2 ? 0x8c9950 : PALETTE.mustard, 0.42);
        d.fillTriangle(sx(x), sy(y - 14), sx(x + 9), sy(y), sx(x - 9), sy(y));
        d.fillTriangle(sx(x), sy(y + 14), sx(x + 9), sy(y), sx(x - 9), sy(y));
      }
    const trayX = g.binX(0) - g.binW / 2 - 6;
    d.fillStyle(0x071c15).fillRoundedRect(
      sx(trayX),
      sy(g.binY - g.binH / 2 - 12),
      sd(g.gap * rows + g.binW + 12),
      sd(g.binH + 24),
      sd(8),
    );
    this.hopperArt
      .clear()
      .fillStyle(0x948666)
      .fillTriangle(-sd(g.ballR * 2.2), -sd(g.ballR), sd(g.ballR * 2.2), -sd(g.ballR), 0, sd(g.ballR * 2));
    this.hopper.setPosition(sx(g.cx), sy(g.startY));
    this.readyBall.setDisplaySize(sd(g.ballR * 2), sd(g.ballR * 2));
    this.badge.setPosition(sx(r.x + r.w - 278), sy(r.y + 64));
    this.badgeArt.clear().fillStyle(PALETTE.ink).fillRoundedRect(-sd(5), -sd(27), sd(254), sd(54), sd(27));
    this.badgeArt.fillStyle(0x11271f).fillRoundedRect(0, -sd(22), sd(244), sd(44), sd(22));
    this.badgeLabel.setPosition(sd(16), 0).setFontSize(sd(24));
    for (let i = 0; i < 5; i++) this.dots[i].setPosition(sd(101 + i * 27), 0).setRadius(sd(8));

    this.pegs?.destroy();
    this.pegs = this.scene.add
      .renderTexture(sx(r.x), sy(r.y), Math.ceil(sd(r.w)), Math.ceil(sd(r.h)))
      .setOrigin(0)
      .setDepth(DEPTH.pegs);
    this.brush.setDisplaySize(sd(g.pegR * 2), sd(g.pegR * 2));
    for (let i = 0; i < g.rows; i++) {
      for (let j = 0; j < i + 3; j++) this.pegs.draw(this.brush, sd(g.pegX(i, j) - r.x), sd(g.rowY(i) - r.y));
    }
    for (let i = 0; i < FLASH_POOL; i++) this.flashes[i].setVisible(false);
  }

  flashPeg(row: number, j: number): void {
    if (this.still) return;
    const f = this.flashes[this.nextFlash];
    this.flashLife[this.nextFlash] = FLASH_MS;
    this.nextFlash = (this.nextFlash + 1) % FLASH_POOL;
    const d = sd(this.geo.pegR * 2.5);
    f.setPosition(sx(this.geo.pegX(row, j)), sy(this.geo.rowY(row)))
      .setDisplaySize(d, d)
      .setAlpha(1)
      .setVisible(true);
  }

  releaseBall(): void {
    if (!this.still) void this.releaseClock.wait(ANIM.loadMs + ANIM.releaseBallMs);
  }
  skip(): void {
    this.rebuildClock.skip();
    this.pegs?.setAlpha(1);
    this.releaseClock.skip();
    this.hopper.setAngle(0);
    this.dotLife.fill(0);
    this.flashLife.fill(0);
    for (let i = 0; i < this.dots.length; i++) this.dots[i].setScale(1).setAlpha(1);
    for (let i = 0; i < this.flashes.length; i++) this.flashes[i].setVisible(false);
  }
  update(dt: number, turbo = false): void {
    const step = dt / (turbo ? ANIM.turboFactor : 1);
    this.rebuildClock.update(step);
    this.pegs?.setAlpha(this.still ? 1 : this.rebuildClock.progress);
    this.releaseClock.update(step);
    this.hopper.setAngle(
      this.still
        ? 0
        : Math.sin(this.releaseClock.progress * Math.PI * 4) * 4 * (1 - this.releaseClock.progress),
    );
    for (let i = 0; i < this.dots.length; i++) {
      if (this.dotLife[i] <= 0) continue;
      this.dotLife[i] = Math.max(0, this.dotLife[i] - step);
      const t = 1 - this.dotLife[i] / ANIM.badgeMs;
      this.dots[i]
        .setScale(this.still || i >= this.activeBalls ? 1 : 1 + Math.sin(t * Math.PI) * 0.25)
        .setAlpha(i < this.activeBalls ? 1 : 0.45 + 0.55 * t);
    }
    for (let i = 0; i < FLASH_POOL; i++) {
      if (this.flashLife[i] <= 0) continue;
      this.flashLife[i] -= step;
      const f = this.flashes[i];
      if (this.flashLife[i] <= 0) f.setVisible(false);
      else {
        const life = this.flashLife[i] / FLASH_MS;
        const d = sd(this.geo.pegR * (2 + Math.sin((1 - life) * Math.PI) * 0.5));
        f.setAlpha(life * life).setDisplaySize(d, d);
      }
    }
  }
}
