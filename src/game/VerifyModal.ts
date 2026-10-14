import { RISKS, ROWS_OPTIONS, type Risk, type Rows } from '../math/config';
import { verifyRound } from '../math/fair';
import { el, field, Modal } from '../utils/dom';
import { formatMultiplier } from '../utils/format';
import { stamp } from './animation/ModalFx';

export interface VerifyInput {
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  rows: Rows;
  risk: Risk;
  /** The hash committed before play, to compare against. */
  expectedHash: string;
}

/** Recomputes any round from its public inputs with the same fair.ts the mock server uses. */
export class VerifyModal {
  private readonly modal = new Modal('Verify a round');
  private readonly serverSeed = el('input', { type: 'text', spellcheck: false, autocomplete: 'off' });
  private readonly expectedHash = el('input', { type: 'text', spellcheck: false, autocomplete: 'off' });
  private readonly clientSeed = el('input', { type: 'text', spellcheck: false, autocomplete: 'off' });
  private readonly nonce = el('input', { type: 'number', min: '0', step: '1' });
  private readonly rows = el('select');
  private readonly risk = el('select');
  private readonly out = el('dl', { className: 'result', 'aria-live': 'polite' });
  private readonly error = el('p', { className: 'error', role: 'alert' });

  constructor() {
    for (const r of ROWS_OPTIONS) this.rows.append(el('option', { value: String(r) }, String(r)));
    for (const r of RISKS) this.risk.append(el('option', { value: r }, r));
    const run = el('button', { className: 'btn primary', type: 'submit' }, 'Verify');
    const form = el(
      'form',
      { className: 'modal-body', noValidate: true },
      el(
        'p',
        { className: 'note' },
        'HMAC-SHA256(server seed, "client seed:nonce"). Bit i of the result is row i: 0 = left, 1 = right.',
      ),
      field('Server seed (revealed after rotating)', this.serverSeed),
      field('Committed server seed hash (optional)', this.expectedHash),
      field('Client seed', this.clientSeed),
      el(
        'div',
        { className: 'row' },
        field('Nonce', this.nonce),
        field('Rows', this.rows),
        field('Risk', this.risk),
      ),
      this.error,
      run,
      this.out,
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.verify();
    });
    this.modal.body.append(form);
  }

  open(prefill?: Partial<VerifyInput>): void {
    if (prefill) {
      this.serverSeed.value = prefill.serverSeed ?? '';
      this.expectedHash.value = prefill.expectedHash ?? '';
      this.clientSeed.value = prefill.clientSeed ?? '';
      this.nonce.value = prefill.nonce !== undefined ? String(prefill.nonce) : '';
      if (prefill.rows) this.rows.value = String(prefill.rows);
      if (prefill.risk) this.risk.value = prefill.risk;
    }
    this.out.replaceChildren();
    this.error.textContent = '';
    this.modal.open();
    if (this.serverSeed.value && this.clientSeed.value && this.nonce.value) void this.verify();
  }

  private async verify(): Promise<void> {
    const serverSeed = this.serverSeed.value.trim();
    const clientSeed = this.clientSeed.value.trim();
    const nonce = Number(this.nonce.value);
    this.out.replaceChildren();
    if (!serverSeed || !clientSeed)
      return void (this.error.textContent = 'Server seed and client seed are required');
    if (!Number.isSafeInteger(nonce) || nonce < 0)
      return void (this.error.textContent = 'Nonce must be 0 or more');
    this.error.textContent = '';

    const rows = Number(this.rows.value) as Rows;
    const v = await verifyRound(serverSeed, clientSeed, nonce, rows, this.risk.value as Risk);
    const expected = this.expectedHash.value.trim().toLowerCase();
    const rowsOut: [string, Node | string][] = [
      ['SHA-256', el('span', { className: 'mono' }, v.serverSeedHash)],
      ['Path', el('span', { className: 'mono' }, v.path.map((b) => (b ? 'R' : 'L')).join(''))],
      ['Bin', String(v.bin)],
      ['Multiplier', formatMultiplier(v.multiplierX100)],
    ];
    if (expected) {
      const match = expected === v.serverSeedHash;
      rowsOut.splice(1, 0, [
        'Hash check',
        el(
          'span',
          { className: match ? 'ok' : 'bad' },
          match ? 'Matches the committed hash' : 'Does NOT match',
        ),
      ]);
    }
    for (const [k, val] of rowsOut) this.out.append(el('dt', {}, k), el('dd', {}, val));
    stamp(this.out);
  }
}
