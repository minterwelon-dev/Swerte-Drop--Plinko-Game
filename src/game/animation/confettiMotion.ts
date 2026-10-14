import { ANIM } from './animConfig';

/** Cosmetic, time-based paper motion. Writes into one reusable buffer: x, y, angle, flip, alpha. */
export function sampleConfetti(i: number, elapsedMs: number, width: number, out: Float64Array): void {
  const c = ANIM.confetti;
  const a = ((i + 1) * 0.61803398875) % 1;
  const b = ((i + 1) * 0.41421356237) % 1;
  const d = ((i + 1) * 0.73205080757) % 1;
  const age = elapsedMs - b * c.emissionMs;
  const t = Math.max(0, age) / 1000;
  const side = i % 2 ? 1 : -1;
  const drag = c.drag * (0.75 + b * 0.5);
  const travel = -Math.expm1(-drag * t) / drag;
  const speed = c.launchSpeed * (0.65 + a * 0.8);
  const vx = -side * width * (0.25 + d * 0.55);
  const vy = -speed * (0.6 + b * 0.5);
  const terminal = (c.gravity * (0.65 + d * 0.7)) / drag;
  const phase = a * Math.PI * 2;
  const flutter = t * Math.PI * 2 * c.flutterHz * (0.65 + b * 0.7);
  out[0] =
    side * width * (0.42 + b * 0.04) +
    vx * travel +
    (Math.sin(phase + flutter) - Math.sin(phase)) * (7 + d * 13);
  out[1] = -170 - d * 20 + terminal * t + (vy - terminal) * travel;
  out[2] = a * 360 + side * (70 + d * 170) * t;
  out[3] = 0.12 + 0.88 * Math.abs(Math.cos(phase + flutter));
  out[4] = age < 0 ? 0 : Math.min(1, Math.max(0, (c.lifeMs - elapsedMs) / c.fadeMs));
}
