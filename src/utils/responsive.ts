import type Phaser from 'phaser';
import { LAYOUT, REF_LANDSCAPE, REF_PORTRAIT, type Layout } from '../constants';

export interface Viewport {
  /** CSS px */
  w: number;
  h: number;
  dpr: number;
  landscape: boolean;
  ref: { w: number; h: number };
  /** reference px -> canvas px */
  s: number;
  offX: number;
  offY: number;
}

export const RELAYOUT_EVENT = 'relayout';

let vp: Viewport = computeViewport(REF_LANDSCAPE.w, REF_LANDSCAPE.h, 1);

/** Fit the orientation's reference rect into the viewport. Canvas px = CSS px x DPR. */
export function computeViewport(viewW: number, viewH: number, dpr: number): Viewport {
  const landscape = viewW >= viewH;
  const ref = landscape ? REF_LANDSCAPE : REF_PORTRAIT;
  const cw = viewW * dpr;
  const ch = viewH * dpr;
  const s = Math.min(cw / ref.w, ch / ref.h);
  return {
    w: viewW,
    h: viewH,
    dpr,
    landscape,
    ref,
    s,
    offX: (cw - ref.w * s) / 2,
    offY: (ch - ref.h * s) / 2,
  };
}

export function setViewport(next: Viewport): void {
  vp = next;
}

export function viewport(): Viewport {
  return vp;
}

export function currentLayout(): Layout {
  return vp.landscape ? LAYOUT.landscape : LAYOUT.portrait;
}

/** Reference x -> canvas x */
export const sx = (x: number): number => vp.offX + x * vp.s;
/** Reference y -> canvas y */
export const sy = (y: number): number => vp.offY + y * vp.s;
/** Reference size -> canvas size */
export const sd = (d: number): number => d * vp.s;

/** Browser viewport in CSS px and the DPR to render at (capped at 3 for fill rate). */
export function readBrowserViewport(): Viewport {
  const v = window.visualViewport;
  const w = Math.round(v?.width ?? window.innerWidth);
  const h = Math.round(v?.height ?? window.innerHeight);
  return computeViewport(w, h, Math.min(window.devicePixelRatio || 1, 3));
}

/**
 * Resize the canvas if the browser viewport changed. Canvas = viewport x DPR; zoom 1/DPR keeps the CSS size
 * at viewport px under Scale.NONE. Emits RELAYOUT_EVENT on the game. Cheap enough to call every frame.
 */
export function syncViewport(game: Phaser.Game): boolean {
  const next = readBrowserViewport();
  if (next.w === vp.w && next.h === vp.h && next.dpr === vp.dpr) return false;
  setViewport(next);
  game.scale.setZoom(1 / next.dpr);
  game.scale.resize(Math.round(next.w * next.dpr), Math.round(next.h * next.dpr));
  game.events.emit(RELAYOUT_EVENT);
  return true;
}

/** Window resize/rotation: rAF debounce plus 100/300/600 ms retries for late-settling mobile viewports. */
export function bindResponsiveResize(game: Phaser.Game): void {
  let raf = 0;
  const timers: number[] = [];
  const schedule = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => syncViewport(game));
    for (const t of timers) clearTimeout(t);
    timers.length = 0;
    for (const ms of [100, 300, 600]) timers.push(window.setTimeout(() => syncViewport(game), ms));
  };
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
}
