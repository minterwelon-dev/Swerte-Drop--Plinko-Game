// DEV ONLY. Imported behind import.meta.env.DEV so production builds drop it.
import { Rng, cryptoSeed } from '../math/rng';
import type { MockRGS, MockRGSOptions } from '../rgs/MockRGS';
import { el } from '../utils/dom';

/** URL overrides for the mock in dev: ?seed=42&latency=300&fail=0.2 */
export function devRgsOptions(): MockRGSOptions {
  const q = new URLSearchParams(location.search);
  const opts: MockRGSOptions = {};
  if (q.has('seed')) {
    opts.seed = Number(q.get('seed'));
    opts.storageKey = `swertedrop.mockrgs.seed${opts.seed}`; // deterministic sessions never clobber the normal one
  }
  if (q.has('latency')) opts.latencyMs = Number(q.get('latency'));
  if (q.has('fail')) opts.failureRate = Number(q.get('fail'));
  return opts;
}

const rng = new Rng(cryptoSeed());

/** A path with exactly `bin` right moves (clamped to rows) in shuffled order, so the ball still zig-zags. */
export function forcedPath(rows: number, bin: number): number[] {
  const ones = Math.max(0, Math.min(bin, rows));
  const path: number[] = [];
  for (let i = 0; i < rows; i++) path.push(i < ones ? 1 : 0);
  for (let i = rows - 1; i > 0; i--) {
    const j = rng.nextU32() % (i + 1);
    const t = path[i];
    path[i] = path[j];
    path[j] = t;
  }
  return path;
}

export class DebugPanel {
  constructor(rgs: MockRGS) {
    const latency = el('input', { type: 'number', min: '0', step: '50', value: String(rgs.latencyMs) });
    const fail = el('input', {
      type: 'number',
      min: '0',
      max: '1',
      step: '0.1',
      value: String(rgs.failureRate),
    });
    const bin = el('input', { type: 'number', min: '0', max: '16', placeholder: 'bin' });
    const status = el('span');
    const btn = (label: string, fn: () => void) => {
      const b = el('button', { type: 'button' }, label);
      b.addEventListener('click', fn);
      return b;
    };
    // edge/centre resolve against the rows of the drop that consumes the force.
    const force = (bin: (rows: number) => number, label: string) => {
      rgs.forceNextPath((rows) => forcedPath(rows, bin(rows)));
      status.textContent = `next: ${label}`;
    };
    latency.addEventListener('change', () => (rgs.latencyMs = Math.max(0, Number(latency.value) || 0)));
    fail.addEventListener(
      'change',
      () => (rgs.failureRate = Math.min(1, Math.max(0, Number(fail.value) || 0))),
    );

    document.body.append(
      el(
        'details',
        { className: 'debug' },
        el('summary', {}, 'DEV debug'),
        el('label', {}, 'Latency ms ', latency),
        el('label', {}, 'Failure rate ', fail),
        el(
          'div',
          {},
          btn('Force edge', () => force((rows) => rows, 'edge')),
          btn('Centre', () => force((rows) => rows / 2, 'centre')),
        ),
        el(
          'div',
          {},
          bin,
          btn('Force bin', () => force(() => Number(bin.value) || 0, `bin ${bin.value || 0}`)),
        ),
        status,
        btn('Reset session', () => {
          localStorage.clear();
          location.reload();
        }),
      ),
    );
  }
}
