export const DEPTH = {
  background: 0,
  boardPanel: 1,
  pegs: 2,
  bins: 3,
  ballTrail: 4,
  balls: 5,
  pegFlash: 6,
  popups: 8,
  hud: 10,
  dim: 20,
  featureOverlay: 21,
  modalPanel: 21,
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

export interface ControlRect extends Rect {
  font: number;
}
export interface Layout {
  landscape: boolean;
  board: Rect;
  panel: Rect;
  sign: Rect;
  signText: string;
  signFont: number;
  balance: Rect;
  win: Rect;
  history: Rect;
  historyColumns: number;
  historyLabel: { x: number; y: number; font: number; text: string };
  canopy: { height: number; stripes: number; bulbs: number };
  controls: {
    setup?: ControlRect;
    betDown: ControlRect;
    betUp: ControlRect;
    bet: Rect;
    rows: Rect;
    risk: Rect;
    drop: ControlRect;
    turbo: ControlRect;
    auto: ControlRect;
    skip: ControlRect;
    fair: ControlRect;
    feature: ControlRect;
    sound: ControlRect;
    rowsCaption: { x: number; y: number };
    riskCaption: { x: number; y: number };
    message: { x: number; y: number; font: number };
  };
  featureBanner: Rect;
  settings?: Rect;
}

export function layoutPortrait(height = 1920, top = 0): Layout {
  const bottom = top + height;
  const settingsY = bottom - 1020;
  return {
    landscape: false,
    canopy: { height: top + 36, stripes: 12, bulbs: 12 },
    sign: { x: 140, y: top + 88, w: 800, h: 80 },
    signText: 'SWERTE DROP',
    signFont: 50,
    balance: { x: 24, y: top + 188, w: 500, h: 84 },
    win: { x: 556, y: top + 188, w: 500, h: 84 },
    board: { x: 12, y: top + 292, w: 1056, h: height - 734 },
    panel: { x: 0, y: bottom - 346, w: 1080, h: 346 },
    history: { x: 204, y: bottom - 422, w: 852, h: 66 },
    historyColumns: 9,
    historyLabel: { x: 24, y: bottom - 389, font: 22, text: 'HISTORY' },
    featureBanner: { x: 24, y: bottom - 428, w: 1032, h: 76 },
    settings: { x: 40, y: settingsY, w: 1000, h: 652 },
    controls: {
      betDown: { x: 30, y: bottom - 314, w: 132, h: 132, font: 64 },
      betUp: { x: 490, y: bottom - 314, w: 132, h: 132, font: 64 },
      bet: { x: 184, y: bottom - 314, w: 282, h: 132 },
      drop: { x: 676, y: bottom - 314, w: 364, h: 132, font: 51 },
      setup: { x: 30, y: bottom - 150, w: 234, h: 132, font: 32 },
      turbo: { x: 292, y: bottom - 150, w: 234, h: 132, font: 30 },
      auto: { x: 554, y: bottom - 150, w: 234, h: 132, font: 30 },
      skip: { x: 816, y: bottom - 150, w: 234, h: 132, font: 30 },
      rows: { x: 84, y: settingsY + 102, w: 922, h: 132 },
      rowsCaption: { x: 84, y: settingsY + 68 },
      risk: { x: 84, y: settingsY + 304, w: 922, h: 132 },
      riskCaption: { x: 84, y: settingsY + 270 },
      fair: { x: 84, y: settingsY + 480, w: 270, h: 132, font: 30 },
      feature: { x: 394, y: settingsY + 480, w: 270, h: 132, font: 30 },
      sound: { x: 704, y: settingsY + 480, w: 270, h: 132, font: 28 },
      message: { x: 540, y: top + 284, font: 22 },
    },
  };
}

export function layoutLandscape(): Layout {
  return {
    landscape: true,
    canopy: { height: 92, stripes: 32, bulbs: 42 },
    sign: { x: 62, y: 180, w: 446, h: 175 },
    signText: 'SWERTE\nDROP',
    signFont: 66,
    balance: { x: 62, y: 392, w: 446, h: 108 },
    win: { x: 62, y: 518, w: 446, h: 108 },
    board: { x: 550, y: 155, w: 820, h: 880 },
    panel: { x: 1414, y: 155, w: 446, h: 880 },
    history: { x: 62, y: 698, w: 446, h: 180 },
    historyColumns: 3,
    historyLabel: { x: 62, y: 674, font: 20, text: 'HISTORY · LAST DROPS' },
    featureBanner: { x: 62, y: 660, w: 446, h: 218 },
    controls: {
      betDown: { x: 1438, y: 214, w: 74, h: 74, font: 48 },
      betUp: { x: 1762, y: 214, w: 74, h: 74, font: 48 },
      bet: { x: 1536, y: 207, w: 202, h: 86 },
      rows: { x: 1438, y: 333, w: 398, h: 68 },
      rowsCaption: { x: 1438, y: 314 },
      risk: { x: 1438, y: 446, w: 398, h: 70 },
      riskCaption: { x: 1438, y: 423 },
      drop: { x: 1555, y: 568, w: 164, h: 164, font: 38 },
      turbo: { x: 1438, y: 773, w: 88, h: 98, font: 18 },
      auto: { x: 1542, y: 773, w: 88, h: 98, font: 18 },
      skip: { x: 1646, y: 773, w: 88, h: 98, font: 18 },
      fair: { x: 1750, y: 773, w: 88, h: 98, font: 18 },
      feature: { x: 1460, y: 953, w: 150, h: 44, font: 20 },
      sound: { x: 1664, y: 953, w: 150, h: 44, font: 20 },
      message: { x: 1637, y: 913, font: 18 },
    },
  };
}

export const LAYOUT = { portrait: layoutPortrait(), landscape: layoutLandscape() };

export const PALETTE = {
  ink: 0x1d130d,
  felt: 0x173a2f,
  feltLight: 0x2a5a49,
  cream: 0xf1e3c0,
  mustard: 0xe0a02a,
  enamel: 0xb92f27,
  wood: 0x86552f,
  counter: 0x5a331c,
  frame: 0x7a4727,
  panel: 0x173a2f,
  panelStroke: 0x7a4727,
  peg: 0xd9a441,
  pegFlash: 0xffe27a,
  ball: 0xe8b21e,
  button: 0xf1e3c0,
  buttonActive: 0xe0a02a,
  buttonDisabled: 0x35433b,
  drop: 0xb92f27,
  text: '#f1e3c0',
  textDim: '#b6b49b',
  textDark: '#1d130d',
} as const;

export const FONT = { title: 'Bungee, sans-serif', ui: 'Nunito Sans, sans-serif' } as const;
export type Tier = 'lose' | 'low' | 'mid' | 'high' | 'top' | 'mini' | 'minor' | 'major';
export const TIER_COLOR: Record<Tier, number> = {
  lose: 0x365f54,
  low: 0xf1e3c0,
  mid: 0xe0a02a,
  high: 0xb92f27,
  top: 0xb92f27,
  mini: 0x5fb59c,
  minor: 0xe0a02a,
  major: 0xb92f27,
};
