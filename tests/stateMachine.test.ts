import { describe, expect, it, vi } from 'vitest';
import { MockRGS, memoryStore } from '../src/rgs/MockRGS';
import { PlinkoStateMachine } from '../src/state/PlinkoStateMachine';

vi.spyOn(console, 'debug').mockImplementation(() => {});

describe('PlinkoStateMachine', () => {
  it('display balance equals server balance once every ball has landed', async () => {
    const rgs = new MockRGS({ seed: 11, storage: memoryStore() });
    const init = await rgs.init();
    const sm = new PlinkoStateMachine(init.balance, 5);
    const err = vi.spyOn(console, 'error');

    for (let round = 0; round < 20; round++) {
      const res = [];
      for (let i = 0; i < 5; i++) {
        expect(sm.canDrop(500)).toBe(true);
        sm.beginDrop(500);
        res.push(rgs.drop({ sessionId: init.sessionId, bet: 500, rows: 16, risk: 'high' }));
      }
      expect(sm.canDrop(500)).toBe(false); // 5 in flight
      expect(sm.canChangeBoard()).toBe(false);
      const settled = await Promise.all(res);
      for (const r of settled) sm.serverSettled(r.balance);
      // Land out of order, as concurrent balls do.
      for (const r of [...settled].reverse()) sm.ballLanded(r.win);
      expect(sm.state).toBe('Idle');
      expect(sm.displayBalance).toBe(sm.serverBalance);
    }
    expect(err).not.toHaveBeenCalled();
  });

  it('refunds a failed drop and blocks drops above the balance', () => {
    const sm = new PlinkoStateMachine(300, 5);
    sm.beginDrop(200);
    expect(sm.displayBalance).toBe(100);
    sm.dropFailed(200);
    expect(sm.displayBalance).toBe(300);
    expect(sm.state).toBe('Idle');
    expect(sm.canDrop(500)).toBe(false);
    expect(() => sm.beginDrop(500)).toThrow();
  });
});

describe('PlinkoStateMachine auto and resume', () => {
  it('auto-drop locks manual drops and the board until stopped and settled', () => {
    const sm = new PlinkoStateMachine(10_000, 5);
    sm.startAuto();
    expect(sm.canDrop(100)).toBe(false);
    expect(sm.canAutoDrop(100)).toBe(true);
    expect(sm.canChangeBet()).toBe(false);
    sm.beginDrop(100);
    sm.serverSettled(9_950);
    sm.ballLanded(50);
    expect(sm.state).toBe('AutoRunning'); // still active with no balls in flight
    sm.beginDrop(100);
    sm.stopAuto();
    expect(sm.state).toBe('AutoRunning'); // waits for the last ball
    expect(sm.canAutoDrop(100)).toBe(false);
    sm.serverSettled(9_850);
    sm.ballLanded(0);
    expect(sm.state).toBe('Idle');
    expect(sm.displayBalance).toBe(9_850);
  });

  it('resume credits pending wins as their balls land', () => {
    const sm = new PlinkoStateMachine(10_300, 5); // server balance already includes both wins
    sm.resume([{ win: 200 }, { win: 100 }]);
    expect(sm.displayBalance).toBe(10_000);
    expect(sm.inFlight).toBe(2);
    sm.ballLanded(200);
    sm.ballLanded(100);
    expect(sm.state).toBe('Idle');
    expect(sm.displayBalance).toBe(sm.serverBalance);
  });
});
