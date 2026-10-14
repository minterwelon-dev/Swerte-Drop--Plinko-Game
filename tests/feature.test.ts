import { describe, expect, it, vi } from 'vitest';
import { forcedPath } from '../src/game/DebugPanel';
import { BET_LEVELS, WIN_CAP_X } from '../src/math/config';
import {
  BALL_WHEEL,
  buildFeature,
  deriveFeature,
  FEATURE_BINS,
  FEATURE_ROWS,
  pickBallCount,
} from '../src/math/feature';
import { derivePath } from '../src/math/fair';
import { Rng } from '../src/math/rng';
import { MockRGS, memoryStore } from '../src/rgs/MockRGS';
import { PlinkoStateMachine } from '../src/state/PlinkoStateMachine';
import { Timeline } from '../src/utils/timeline';

vi.spyOn(console, 'debug').mockImplementation(() => {});

const randomPaths = (rng: Rng, n: number) =>
  Array.from({ length: n }, () => Array.from({ length: FEATURE_ROWS }, () => rng.nextU32() & 1));

describe('feature math', () => {
  it('bins are symmetric with jackpots at the edges', () => {
    expect(FEATURE_BINS).toHaveLength(FEATURE_ROWS + 1);
    for (let k = 0; k <= FEATURE_ROWS; k++) expect(FEATURE_BINS[k]).toEqual(FEATURE_BINS[FEATURE_ROWS - k]);
    expect(FEATURE_BINS.map((b) => b.jackpot).slice(0, 3)).toEqual(['major', 'minor', 'mini']);
  });

  it('wheel pick covers every segment and the uint32 range', () => {
    expect(pickBallCount(0)).toBe(BALL_WHEEL[0].balls);
    expect(pickBallCount(2 ** 32 - 1)).toBe(BALL_WHEEL[BALL_WHEEL.length - 1].balls);
    const seen = new Set<number>();
    const rng = new Rng(1);
    for (let i = 0; i < 10_000; i++) seen.add(pickBallCount(rng.nextU32()));
    expect([...seen].sort((a, b) => a - b)).toEqual(BALL_WHEEL.map((w) => w.balls));
  });

  it('integer money, bin = sum(path), total = capped sum', () => {
    const rng = new Rng(9);
    for (let i = 0; i < 500; i++) {
      const bet = BET_LEVELS[i % BET_LEVELS.length];
      const out = buildFeature(randomPaths(rng, BALL_WHEEL[i % BALL_WHEEL.length].balls), bet);
      let sum = 0;
      for (const b of out.balls) {
        expect(b.bin).toBe(b.path.reduce((s, x) => s + x, 0));
        expect(b.multiplierX100).toBe(FEATURE_BINS[b.bin].multiplierX100);
        expect(b.tier).toBe(FEATURE_BINS[b.bin].jackpot);
        expect(Number.isSafeInteger(b.win)).toBe(true);
        sum += b.win;
      }
      expect(out.totalWin).toBe(Math.min(sum, bet * WIN_CAP_X));
      expect(out.capped).toBe(sum > bet * WIN_CAP_X);
    }
  });

  it('caps the total at 5000x bet', () => {
    const paths = Array.from({ length: 30 }, () => new Array<number>(FEATURE_ROWS).fill(1)); // 30 Majors
    const out = buildFeature(paths, 5000);
    expect(out.balls.every((b) => b.tier === 'major')).toBe(true);
    expect(out.capped).toBe(true);
    expect(out.totalWin).toBe(5000 * WIN_CAP_X);
  });

  it('rejects malformed input', () => {
    const ok = new Array<number>(FEATURE_ROWS).fill(0);
    expect(() =>
      buildFeature(
        Array.from({ length: 11 }, () => ok),
        100,
      ),
    ).toThrow(); // not a wheel count
    expect(() =>
      buildFeature(
        Array.from({ length: 10 }, () => [0, 1]),
        100,
      ),
    ).toThrow();
    expect(() =>
      buildFeature(
        Array.from({ length: 10 }, () => ok),
        150,
      ),
    ).toThrow();
  });

  it('ball i replays from nonce + 1 + i', async () => {
    const out = await deriveFeature('server', 'client', 5, 100);
    for (let i = 0; i < out.balls.length; i++)
      expect(out.balls[i].path).toEqual(await derivePath('server', 'client', 6 + i, FEATURE_ROWS));
    expect(await deriveFeature('server', 'client', 5, 100)).toEqual(out);
  });
});

describe('MockRGS feature', () => {
  it('settles, advances the nonce, verifies after rotation, and resumes until acked', async () => {
    const storage = memoryStore();
    const rgs = new MockRGS({ seed: 21, storage });
    const init = await rgs.init();
    const seedRef = { serverSeedHash: init.seed.serverSeedHash, clientSeed: init.seed.clientSeed };
    const res = await rgs.feature({ sessionId: init.sessionId, bet: 200, seedRef });
    expect(res.nonce).toBe(0);
    expect(res.balance).toBe(init.balance + res.totalWin); // free round: no bet taken
    await expect(rgs.feature({ sessionId: init.sessionId, bet: 200, seedRef })).rejects.toMatchObject({
      code: 'BAD_REQUEST', // one feature at a time
    });

    const again = await new MockRGS({ seed: 21, storage }).init(); // simulated refresh
    expect(again.pendingFeature).toEqual(res);
    expect(again.seed.nonce).toBe(1 + res.balls.length);
    await rgs.ack(res.roundId);
    expect((await rgs.init()).pendingFeature).toBeNull();

    const rot = await rgs.rotateSeed();
    expect(await deriveFeature(rot.revealedServerSeed, res.clientSeed, res.nonce, 200)).toEqual({
      balls: res.balls,
      totalWin: res.totalWin,
      capped: res.capped,
    });
  });

  it('rejects a stale seed reference', async () => {
    const rgs = new MockRGS({ seed: 22, storage: memoryStore() });
    const { sessionId, seed } = await rgs.init();
    const seedRef = { serverSeedHash: 'old', clientSeed: seed.clientSeed };
    await expect(rgs.feature({ sessionId, bet: 100, seedRef })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('DEV forced edge feature hits the cap', async () => {
    const rgs = new MockRGS({ seed: 23, storage: memoryStore() });
    const { sessionId, seed } = await rgs.init();
    rgs.forceNextPath((rows) => forcedPath(rows, rows));
    const res = await rgs.feature({ sessionId, bet: 100, seedRef: seed });
    expect(res.balls).toHaveLength(30);
    expect(res.capped).toBe(true);
    expect(res.totalWin).toBe(100 * WIN_CAP_X);
  });
});

describe('feature flow', () => {
  it('state machine walks the feature in order and ends with display = server', () => {
    const sm = new PlinkoStateMachine(1_000, 5);
    sm.startFeature();
    expect(sm.canDrop(100)).toBe(false);
    expect(sm.canChangeBet()).toBe(false);
    expect(() => sm.featureStep('FeatureDropping')).toThrow();
    sm.featureStep('BallCountWheel');
    sm.serverSettled(1_500);
    sm.featureStep('FeatureDropping');
    sm.featureCredit(300);
    sm.featureCredit(200);
    sm.featureStep('FeatureSummary');
    const err = vi.spyOn(console, 'error');
    sm.endFeature();
    expect(err).not.toHaveBeenCalled();
    expect(sm.state).toBe('Idle');
    expect(sm.displayBalance).toBe(1_500);
  });

  it('resume holds back the feature total until balls land', () => {
    const sm = new PlinkoStateMachine(1_500, 5);
    sm.resumeFeature(500);
    expect(sm.displayBalance).toBe(1_000);
    expect(sm.state).toBe('FeatureIntro');
  });

  it('timeline waits, reports progress and skips', async () => {
    const t = new Timeline();
    let done = false;
    const p = t.wait(100).then(() => (done = true));
    t.update(50);
    expect(t.progress).toBeCloseTo(0.5);
    await Promise.resolve();
    expect(done).toBe(false);
    t.skip();
    await p;
    expect(done).toBe(true);
    expect(t.progress).toBe(1);
  });
});
