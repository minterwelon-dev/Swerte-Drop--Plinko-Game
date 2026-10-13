import Phaser from 'phaser';
import { DEPTH, PALETTE, type Layout } from '../constants';
import { sd, sx, sy } from '../utils/responsive';
import { BoardGeometry } from './BallPath';

const FLASH_POOL = 24;
const FLASH_MS = 220;

/** Board panel, baked peg texture and pooled peg-flash overlays. Owns the geometry for the current rows. */
export class Board {
  readonly geo = new BoardGeometry();
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly scene: Phaser.Scene;
  private pegs: Phaser.GameObjects.RenderTexture | null = null;
  private readonly brush: Phaser.GameObjects.Graphics;
  private readonly flashes: Phaser.GameObjects.Image[] = [];
  private readonly flashLife = new Float32Array(FLASH_POOL);
  private nextFlash = 0;
  private layout: Layout | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.panel = scene.add.graphics().setDepth(DEPTH.boardPanel);
    this.brush = scene.make.graphics({}, false);
    for (let i = 0; i < FLASH_POOL; i++) {
      this.flashes.push(
        scene.add
          .image(0, 0, 'dot')
          .setDepth(DEPTH.pegFlash)
          .setTint(PALETTE.pegFlash)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setVisible(false),
      );
    }
  }

  setRows(rows: number): void {
    if (this.layout) this.relayout(this.layout, rows);
    else this.geo.rows = rows;
  }

  relayout(layout: Layout, rows = this.geo.rows): void {
    this.layout = layout;
    const r = layout.board;
    this.geo.set(r, rows);

    this.panel.clear();
    this.panel.fillStyle(PALETTE.panel, 0.92);
    this.panel.lineStyle(sd(4), PALETTE.panelStroke, 1);
    this.panel.fillRoundedRect(sx(r.x), sy(r.y), sd(r.w), sd(r.h), sd(28));
    this.panel.strokeRoundedRect(sx(r.x), sy(r.y), sd(r.w), sd(r.h), sd(28));

    // Pegs never move: bake them into one texture per layout; only flash overlays animate.
    const w = Math.max(1, Math.ceil(sd(r.w)));
    const h = Math.max(1, Math.ceil(sd(r.h)));
    // Recreated, not resized: Phaser 3.90 RenderTexture.resize() keeps the old projection, so draws land wrong.
    this.pegs?.destroy();
    this.pegs = this.scene.add.renderTexture(sx(r.x), sy(r.y), w, h).setOrigin(0, 0).setDepth(DEPTH.pegs);
    this.brush.clear();
    this.brush.fillStyle(PALETTE.peg, 1);
    const g = this.geo;
    for (let i = 0; i < g.rows; i++) {
      for (let j = 0; j < i + 3; j++)
        this.brush.fillCircle(sd(g.pegX(i, j) - r.x), sd(g.rowY(i) - r.y), sd(g.pegR));
    }
    this.pegs.draw(this.brush, 0, 0);

    for (let i = 0; i < FLASH_POOL; i++) this.flashes[i].setVisible(false);
  }

  flashPeg(row: number, j: number): void {
    const f = this.flashes[this.nextFlash];
    this.flashLife[this.nextFlash] = FLASH_MS;
    this.nextFlash = (this.nextFlash + 1) % FLASH_POOL;
    const d = sd(this.geo.pegR * 5);
    f.setPosition(sx(this.geo.pegX(row, j)), sy(this.geo.rowY(row)))
      .setDisplaySize(d, d)
      .setAlpha(1)
      .setVisible(true);
  }

  update(dt: number): void {
    for (let i = 0; i < FLASH_POOL; i++) {
      if (this.flashLife[i] <= 0) continue;
      this.flashLife[i] -= dt;
      const f = this.flashes[i];
      if (this.flashLife[i] <= 0) f.setVisible(false);
      else f.setAlpha(this.flashLife[i] / FLASH_MS);
    }
  }
}
