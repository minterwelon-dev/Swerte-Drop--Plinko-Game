export const DEPTH = {
  background: 0,
  boardPanel: 1,
  pegs: 2,
  bins: 3,
  balls: 5,
  pegFlash: 6,
  popups: 8,
  hud: 10,
  dim: 20,
  featureOverlay: 21,
  modal: 22,
  errorModal: 30,
  debug: 40,
} as const;

export const REF_LANDSCAPE = { w: 1920, h: 1080 } as const;
export const REF_PORTRAIT = { w: 1080, h: 1920 } as const;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  landscape: boolean;
  board: Rect;
  history: Rect;
  panel: Rect;
}

/** Layout rects in reference units. Portrait: board on top, panel below. Landscape: panel left, board centred right. */
export const LAYOUT: { portrait: Layout; landscape: Layout } = {
  portrait: {
    landscape: false,
    history: { x: 40, y: 30, w: 1000, h: 80 },
    board: { x: 40, y: 130, w: 1000, h: 1150 },
    panel: { x: 40, y: 1310, w: 1000, h: 580 },
  },
  landscape: {
    landscape: true,
    panel: { x: 40, y: 40, w: 520, h: 1000 },
    history: { x: 600, y: 30, w: 1280, h: 70 },
    board: { x: 600, y: 120, w: 1280, h: 930 },
  },
};

export const PALETTE = {
  panel: 0x2a1748,
  panelStroke: 0x5b3a8c,
  peg: 0xf3e6ff,
  pegFlash: 0xffe27a,
  ball: 0xffd23f,
  button: 0x3d2466,
  buttonActive: 0xffb800,
  buttonDisabled: 0x2a2236,
  drop: 0x2fbf71,
  text: '#fff6e0',
  textDim: '#b9a6d6',
  textDark: '#1a0f2e',
} as const;

export type Tier = 'lose' | 'low' | 'mid' | 'high' | 'top' | 'mini' | 'minor' | 'major';

export const TIER_COLOR: Record<Tier, number> = {
  lose: 0x5a4a7a,
  low: 0x2bb3a3,
  mid: 0xf2c14e,
  high: 0xf28a30,
  top: 0xe8384f,
  mini: 0x7fd1ff,
  minor: 0xb07cff,
  major: 0xff4fd8,
};
