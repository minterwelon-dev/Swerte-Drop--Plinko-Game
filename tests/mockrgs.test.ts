import { describe, expect, it } from 'vitest';
import { forcedPath } from '../src/game/DebugPanel';
import { verifyRound } from '../src/math/fair';
import { MockRGS, memoryStore } from '../src/rgs/MockRGS';
import { RGSError } from '../src/rgs/types';

describe('MockRGS', () => {
  it('same seed gives identical responses', async () => {
    const run = async () => {
      const rgs = new MockRGS({ seed: 1, storage: memoryStore() });
      const { sessionId } = await rgs.init();
      const out = [];
      for (let i = 0; i < 5; i++) out.push(await rgs.drop({ sessionId, bet: 100, rows: 16, risk: 'high' }));
      return out;
    };
    expect(await run()).toEqual(await run());
  });

  it('settles balance, increments nonce, and verifies after rotation', async () => {
    const rgs = new MockRGS({ seed: 2, storage: memoryStore(), startingBalance: 10_000 });
    const init = await rgs.init();
    let balance = init.balance;
    const rounds = [];
    for (let i = 0; i < 10; i++) {
      const r = await rgs.drop({ sessionId: init.sessionId, bet: 500, rows: 12, risk: 'medium' });
      expect(r.nonce).toBe(i);
      expect(r.bin).toBe(r.path.reduce((s, x) => s + x, 0));
      balance = balance - 500 + r.win;
      expect(r.balance).toBe(balance);
      rounds.push(r);
    }
    const rot = await rgs.rotateSeed();
    for (const r of rounds) {
      const v = await verifyRound(rot.revealedServerSeed, r.clientSeed, r.nonce, r.rows, r.risk);
      expect(v.serverSeedHash).toBe(r.serverSeedHash);
      expect(v.path).toEqual(r.path);
      expect(v.multiplierX100).toBe(r.multiplierX100);
    }
    expect(rot.newServerSeedHash).not.toBe(init.seed.serverSeedHash);
    expect((await rgs.init()).seed.nonce).toBe(0);
  });

  it('concurrent drops get unique nonces and a consistent balance', async () => {
    const rgs = new MockRGS({ seed: 3, storage: memoryStore(), latencyMs: 5 });
    const { sessionId, balance } = await rgs.init();
    const res = await Promise.all(
      Array.from({ length: 5 }, () => rgs.drop({ sessionId, bet: 100, rows: 8, risk: 'low' })),
    );
    expect(new Set(res.map((r) => r.nonce)).size).toBe(5);
    const final = balance + res.reduce((s, r) => s + r.win - 100, 0);
    expect(Math.max(...res.map((r) => r.nonce))).toBe(4);
    expect(res.find((r) => r.nonce === 4)!.balance).toBe(final);
  });

  it('resumes unacknowledged rounds after a refresh', async () => {
    const storage = memoryStore();
    const a = new MockRGS({ seed: 4, storage });
    const { sessionId } = await a.init();
    const r1 = await a.drop({ sessionId, bet: 100, rows: 8, risk: 'low' });
    const r2 = await a.drop({ sessionId, bet: 100, rows: 8, risk: 'low' });
    await a.ack(r1.roundId);

    const b = new MockRGS({ seed: 4, storage }); // simulated refresh
    const init = await b.init();
    expect(init.pending).toEqual([r2]);
    expect(init.balance).toBe(r2.balance);
    expect(init.seed.nonce).toBe(2);
  });

  it('rejects insufficient funds and bad requests without changing state', async () => {
    const rgs = new MockRGS({ seed: 5, storage: memoryStore(), startingBalance: 100 });
    const { sessionId } = await rgs.init();
    await expect(rgs.drop({ sessionId, bet: 200, rows: 8, risk: 'low' })).rejects.toMatchObject({
      code: 'INSUFFICIENT_FUNDS',
    });
    await expect(rgs.drop({ sessionId, bet: 150, rows: 8, risk: 'low' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await expect(rgs.drop({ sessionId: 'nope', bet: 100, rows: 8, risk: 'low' })).rejects.toMatchObject({
      code: 'BAD_SESSION',
    });
    const init = await rgs.init();
    expect(init.balance).toBe(100);
    expect(init.seed.nonce).toBe(0);
  });

  it('injected failures throw NETWORK and leave state untouched', async () => {
    const rgs = new MockRGS({ seed: 6, storage: memoryStore() });
    const { sessionId } = await rgs.init();
    rgs.failureRate = 1;
    await expect(rgs.drop({ sessionId, bet: 100, rows: 8, risk: 'low' })).rejects.toBeInstanceOf(RGSError);
    rgs.failureRate = 0;
    expect((await rgs.init()).seed.nonce).toBe(0);
  });

  it('DEV forced bin lands where asked and leaves later rounds fair', async () => {
    const rgs = new MockRGS({ seed: 7, storage: memoryStore() });
    const { sessionId } = await rgs.init();
    rgs.forceNextPath((rows) => forcedPath(rows, rows));
    const forced = await rgs.drop({ sessionId, bet: 100, rows: 16, risk: 'high' });
    expect(forced.bin).toBe(16);
    expect(forced.path.reduce((s, x) => s + x, 0)).toBe(16);
    const next = await rgs.drop({ sessionId, bet: 100, rows: 16, risk: 'high' });
    const rot = await rgs.rotateSeed();
    const v = await verifyRound(rot.revealedServerSeed, next.clientSeed, next.nonce, 16, 'high');
    expect(v.path).toEqual(next.path);
  });
});
