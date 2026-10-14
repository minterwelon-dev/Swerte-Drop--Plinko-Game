import { expect, it } from 'vitest';
import { CountUp } from '../src/game/animation/CountUp';

it('holds balance during win counting and finishes at the exact integer target', () => {
  const c = new CountUp();
  c.start(10000, 0);
  c.start(10437, 250, 300);
  c.update(200);
  expect(c.value).toBe(10000);
  c.update(150);
  expect(c.value).toBeGreaterThan(10000);
  expect(c.value).toBeLessThan(10437);
  expect(Number.isInteger(c.value)).toBe(true);
  c.update(1000);
  expect(c.value).toBe(10437);
  expect(c.active).toBe(false);
});
it('a new debit or landing supersedes an unfinished count; skip cannot restore an old target', () => {
  const c = new CountUp();
  c.start(10000, 0);
  c.start(12000, 600);
  c.update(120);
  c.start(11000, 0);
  c.update(999);
  expect(c.value).toBe(11000);
  c.start(12501, 500, 300);
  c.update(50);
  c.skip();
  expect(c.value).toBe(12501);
  expect(c.active).toBe(false);
  c.update(5000);
  expect(c.value).toBe(12501);
});
