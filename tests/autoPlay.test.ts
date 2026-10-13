import { describe, expect, it } from 'vitest';
import { AutoPlay, validateAutoSettings, type AutoPlaySettings } from '../src/state/AutoPlay';

const base: AutoPlaySettings = {
  rounds: 10,
  lossLimit: 1000,
  singleWinStop: null,
  profitStop: null,
  balanceBelow: null,
};

describe('AutoPlay', () => {
  it('requires a loss limit and enough balance to start', () => {
    expect(validateAutoSettings(base, 100, 10_000)).toBeNull();
    expect(validateAutoSettings({ ...base, lossLimit: 0 }, 100, 10_000)).toMatch(/loss limit/i);
    expect(validateAutoSettings({ ...base, lossLimit: NaN }, 100, 10_000)).toMatch(/loss limit/i);
    expect(validateAutoSettings({ ...base, lossLimit: 50 }, 100, 10_000)).toMatch(/at least one bet/);
    expect(validateAutoSettings(base, 100, 50)).toMatch(/insufficient/i);
  });

  it('stops after the configured rounds', () => {
    const a = new AutoPlay({ ...base, rounds: 3 });
    for (let i = 0; i < 3; i++) {
      expect(a.canDrop(100, 10_000)).toBe(true);
      a.record(100, 100);
    }
    expect(a.stopReason).toBe('rounds');
    expect(a.canDrop(100, 10_000)).toBe(false);
  });

  it('never starts a drop that could exceed the loss limit', () => {
    const a = new AutoPlay({ ...base, rounds: 100, lossLimit: 250 });
    expect(a.canDrop(100, 10_000)).toBe(true);
    a.record(100, 20); // net -80
    expect(a.canDrop(100, 10_000)).toBe(true);
    a.record(100, 20); // net -160: one more full loss would reach -260
    expect(a.canDrop(100, 10_000)).toBe(false);
    expect(a.stopReason).toBe('lossLimit');
  });

  it('stops on the loss limit reached exactly', () => {
    const a = new AutoPlay({ ...base, rounds: 100, lossLimit: 200 });
    a.record(100, 0);
    a.record(100, 0);
    expect(a.stopReason).toBe('lossLimit');
  });

  it('stops on single win, profit and balance limits', () => {
    const single = new AutoPlay({ ...base, singleWinStop: 1000 });
    single.record(100, 999);
    expect(single.active).toBe(true);
    single.record(100, 1000);
    expect(single.stopReason).toBe('singleWin');

    const profit = new AutoPlay({ ...base, profitStop: 300 });
    profit.record(100, 250);
    profit.record(100, 250); // net +300
    expect(profit.stopReason).toBe('profit');

    const bal = new AutoPlay({ ...base, balanceBelow: 5000 });
    expect(bal.canDrop(100, 5000)).toBe(true);
    expect(bal.canDrop(100, 4999)).toBe(false);
    expect(bal.stopReason).toBe('balanceBelow');

    const broke = new AutoPlay(base);
    expect(broke.canDrop(100, 99)).toBe(false);
    expect(broke.stopReason).toBe('insufficientBalance');
  });

  it('keeps the first stop reason', () => {
    const a = new AutoPlay(base);
    a.stop('user');
    a.stop('error');
    expect(a.stopReason).toBe('user');
  });
});
