import { describe, expect, it } from 'vitest';
import { computeViewport, sd, setViewport, sx, sy } from '../src/utils/responsive';

describe('responsive', () => {
  it('portrait phone letterboxes the 1080x1920 reference vertically', () => {
    setViewport(computeViewport(390, 844, 3));
    // canvas 1170x2532; s = min(1170/1080, 2532/1920) = 1.0833
    expect(sd(1080)).toBeCloseTo(1170);
    expect(sx(0)).toBeCloseTo(0);
    expect(sy(1920) - sy(0)).toBeCloseTo(1920 * (1170 / 1080));
    expect(sy(960)).toBeCloseTo(2532 / 2);
  });

  it('landscape picks the 1920x1080 reference and centres it', () => {
    const v = computeViewport(1000, 1000, 1);
    expect(v.landscape).toBe(true);
    setViewport(v);
    expect(sx(960)).toBeCloseTo(500);
    expect(sy(540)).toBeCloseTo(500);
  });
});
