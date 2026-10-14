import type Phaser from 'phaser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameConfig } from '../src/gameConfig';
import { LAYOUT } from '../src/constants';
import { Ball, type BallRound } from '../src/game/Ball';
import { BoardGeometry } from '../src/game/BallPath';
import { ROWS_OPTIONS } from '../src/math/config';
import { computeViewport, setViewport, sx, sy } from '../src/utils/responsive';
import * as responsive from '../src/utils/responsive';

class ImageStub {
  x = 0;
  y = 0;
  visible = false;
  scaleX = 1;
  scaleY = 1;
  alpha = 1;
  setScale(x: number, y = x) {
    this.scaleX = x;
    this.scaleY = y;
    return this;
  }
  setAngle() {
    return this;
  }
  width = 0;
  height = 0;
  setDepth() {
    return this;
  }
  setVisible(value: boolean) {
    this.visible = value;
    return this;
  }
  setAlpha(value: number) {
    this.alpha = value;
    return this;
  }
  setPosition(x: number, y: number) {
    this.x = x;
    this.y = y;
    return this;
  }
  setDisplaySize(w: number, h: number) {
    this.width = w;
    this.height = h;
    return this;
  }
}

function fixture(rows = 16) {
  const images: ImageStub[] = [];
  const roots: ImageStub[] = [];
  const scene = {
    add: {
      container: () => {
        const root = new ImageStub();
        roots.push(root);
        return root;
      },
      image: () => {
        const image = new ImageStub();
        images.push(image);
        return image;
      },
    },
  };
  const ball = new Ball(scene as unknown as Phaser.Scene);
  const geo = new BoardGeometry().set(LAYOUT.portrait.board, rows);
  const path = Array.from({ length: rows }, (_, i) => i % 2);
  const res: BallRound = { roundId: 'visual-test', path, bin: rows / 2, multiplierX100: 100, win: 100 };
  setViewport(computeViewport(390, 844, 2));
  ball.hold(geo);
  ball.launch(res, geo);
  return { ball, geo, res, images, roots };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ball presentation', () => {
  it('withdraws an unconfirmed ball without landing, then restores it for retry', () => {
    const { ball, geo, res, roots } = fixture();
    ball.release();
    ball.hold(geo);
    ball.withdraw();
    const events = { onPeg: vi.fn(), onLand: vi.fn() };
    ball.update(gameConfig.motion.shortMs, 110, geo, events);
    expect(roots[3].alpha).toBe(0);
    expect(events.onLand).not.toHaveBeenCalled();
    ball.hold(geo);
    ball.launch(res, geo);
    expect(roots[3].alpha).toBe(1);
    ball.update(10000, 110, geo, events);
    expect(events.onLand).toHaveBeenCalledOnce();
  });
  it('normal and turbo report each peg row and settle in the response bin exactly once', () => {
    for (const rows of ROWS_OPTIONS) {
      for (const rowMs of [gameConfig.turboRowMs, gameConfig.rowMs]) {
        const { ball, geo, res, images, roots } = fixture(rows);
        let landed = 0;
        let pegs = 0;
        const events = {
          onPeg: (row: number) => {
            expect(row).toBe(pegs++);
          },
          onLand: () => {
            expect(ball.root.x).toBeCloseTo(sx(geo.binX(res.bin)), 3);
            expect(ball.root.y).toBeCloseTo(sy(geo.binY), 3);
            landed++;
            ball.release();
          },
        };
        for (let t = 0; t < (rows + 3) * rowMs + 400; t += 16) ball.update(16, rowMs, geo, events);
        expect(pegs).toBe(rows);
        expect(landed).toBe(1);
        expect(images).toHaveLength(4);
        expect(roots.every((image) => !image.visible)).toBe(true);
      }
    }
  });

  it('turbo suppresses trails and skip is preserved while awaiting a response', () => {
    const { ball, geo, res, roots } = fixture();
    for (let i = 0; i < 30; i++)
      ball.update(16, gameConfig.turboRowMs, geo, { onPeg: vi.fn(), onLand: vi.fn() });
    expect(roots.slice(0, 3).every((r) => !r.visible)).toBe(true);
    ball.release();
    ball.hold(geo);
    ball.skipping = true;
    ball.launch(res, geo);
    const landed = vi.fn(() => ball.release());
    ball.update(16, gameConfig.rowMs, geo, { onPeg: vi.fn(), onLand: landed });
    expect(landed).toHaveBeenCalledOnce();
    expect(ball.root.x).toBeCloseTo(sx(geo.binX(res.bin)), 3);
  });

  it('skip snaps to the server bin after a live orientation change, with no lingering trail', () => {
    const { ball, geo, res, roots } = fixture();
    const onLand = vi.fn(() => {
      expect(ball.root.x).toBeCloseTo(sx(geo.binX(res.bin)), 3);
      expect(ball.root.y).toBeCloseTo(sy(geo.binY), 3);
      ball.release();
    });
    ball.update(90, 150, geo, { onPeg: vi.fn(), onLand });
    setViewport(computeViewport(844, 390, 2));
    geo.set(LAYOUT.landscape.board, 16);
    ball.relayout(geo);
    ball.skipping = true;
    ball.update(16, 150, geo, { onPeg: vi.fn(), onLand });
    expect(onLand).toHaveBeenCalledOnce();
    expect(roots.every((image) => !image.visible)).toBe(true);
    ball.hold(geo);
    expect(ball.skipping).toBe(false);
    expect(roots.filter((image) => image.visible)).toHaveLength(1);
  });

  it('reduced motion suppresses trails and squash without changing the path', () => {
    vi.spyOn(responsive, 'reducedMotion').mockReturnValue(true);
    const { ball, geo, images, roots } = fixture();
    ball.update(160, 150, geo, { onPeg: vi.fn(), onLand: vi.fn() });
    expect(roots.slice(0, 3).every((image) => !image.visible)).toBe(true);
    expect(images[3].width).toBe(images[3].height);
    expect(ball.root.scaleX).toBe(1);
    expect(ball.root.y).not.toBe(sy(geo.startY));
  });
});
