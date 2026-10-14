import { describe, expect, it } from 'vitest';
import { sampleConfetti } from '../src/game/animation/confettiMotion';
import { gameConfig } from '../src/gameConfig';

describe('confetti presentation', () => {
  it('rises from a burst, loses upward speed, and falls under gravity', () => {
    const out = new Float64Array(5);
    for (let i = 0; i < 120; i++) {
      sampleConfetti(i, 0, 760, out);
      const early = out[1];
      sampleConfetti(i, 200, 760, out);
      expect(out[1]).toBeLessThan(early);
      const apex = out[1];
      sampleConfetti(i, 2400, 760, out);
      expect(out[1]).toBeGreaterThan(apex);
    }
  });
  it('varies trajectories, fades only at the end, and samples identically after resize', () => {
    const out = new Float64Array(5),
      values = new Set<number>();
    for (let i = 0; i < 120; i++) {
      sampleConfetti(i, 1000, 760, out);
      values.add(out[1]);
      expect(out[4]).toBe(1);
      expect(out[3]).toBeGreaterThanOrEqual(0.12);
      expect(out[3]).toBeLessThanOrEqual(1);
    }
    expect(values.size).toBe(120);
    sampleConfetti(12, 1000, 760, out);
    const before = [...out];
    sampleConfetti(12, 1000, 500, out);
    sampleConfetti(12, 1000, 760, out);
    expect([...out]).toEqual(before);
    sampleConfetti(12, gameConfig.motion.confetti.lifeMs, 760, out);
    expect(out[4]).toBe(0);
  });
});
