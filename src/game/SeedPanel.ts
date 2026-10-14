import type { RotateResponse, SeedState } from '../rgs/types';
import { el, field, Modal } from '../utils/dom';
import { reducedMotion } from '../utils/responsive';
import { ANIM } from './animation/animConfig';
import { modalDuration } from './animation/ModalFx';

export interface SeedPanelEvents {
  setClientSeed(seed: string): Promise<SeedState>;
  rotate(): Promise<RotateResponse>;
  verify(): void;
}

/** Provably fair: committed hash, client seed edit, nonce, rotate (reveals the old server seed). */
export class SeedPanel {
  private readonly modal = new Modal('Provably fair');
  private readonly hash = el('div', { className: 'mono' });
  private readonly nonce = el('div', { className: 'mono' });
  private readonly clientSeed = el('input', {
    type: 'text',
    maxLength: 64,
    spellcheck: false,
    autocomplete: 'off',
  });
  private readonly saveSeed = el('button', { className: 'btn', type: 'button' }, 'Save client seed');
  private readonly rotateBtn = el('button', { className: 'btn', type: 'button' }, 'Rotate server seed');
  private readonly revealed = el('div');
  private readonly error = el('p', { className: 'error', role: 'alert' });
  private readonly busyNote = el('p', { className: 'note' });

  constructor(ev: SeedPanelEvents) {
    const verifyBtn = el('button', { className: 'btn primary', type: 'button' }, 'Verify a round');
    this.modal.body.append(
      el(
        'p',
        { className: 'note' },
        'Play money demo. The mock server seed lives in this browser, so this shows the protocol, not a real trust model.',
      ),
      el(
        'div',
        { className: 'field' },
        el('span', {}, 'Server seed hash (committed before play)'),
        this.hash,
      ),
      el('div', { className: 'field' }, el('span', {}, 'Next nonce'), this.nonce),
      field('Client seed', this.clientSeed),
      this.busyNote,
      el('div', { className: 'row' }, this.saveSeed, this.rotateBtn),
      this.error,
      this.revealed,
      verifyBtn,
    );

    this.saveSeed.addEventListener('click', async () => {
      try {
        this.show(await ev.setClientSeed(this.clientSeed.value));
        this.error.textContent = '';
      } catch (e) {
        this.error.textContent = e instanceof Error ? e.message : String(e);
      }
    });
    this.rotateBtn.addEventListener('click', async () => {
      try {
        const oldHash = this.hash.textContent ?? '';
        const r = await ev.rotate();
        this.revealed.replaceChildren(
          el(
            'div',
            { className: 'field' },
            el('span', {}, 'Revealed previous server seed'),
            el('div', { className: 'mono' }, r.revealedServerSeed),
            el('del', { className: 'mono' }, oldHash),
          ),
        );
        this.hash.textContent = r.newServerSeedHash;
        const reveal = this.hash.animate(
          reducedMotion()
            ? [{ opacity: 0 }, { opacity: 1 }]
            : [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }],
          { duration: modalDuration(ANIM.seedMs), easing: 'steps(32)' },
        );
        this.hash.onclick = () => reveal.finish();
        this.nonce.textContent = '0';
        this.error.textContent = '';
      } catch (e) {
        this.error.textContent = e instanceof Error ? e.message : String(e);
      }
    });
    verifyBtn.addEventListener('click', () => {
      this.modal.close();
      ev.verify();
    });
  }

  /** `canChange` is false while balls are in flight or auto-drop runs. */
  open(seed: SeedState, canChange: boolean): void {
    this.show(seed);
    this.saveSeed.disabled = !canChange;
    this.rotateBtn.disabled = !canChange;
    this.clientSeed.disabled = !canChange;
    this.busyNote.textContent = canChange ? '' : 'Seeds can change once all balls have landed.';
    this.error.textContent = '';
    this.modal.open();
  }

  private show(seed: SeedState): void {
    this.hash.textContent = seed.serverSeedHash;
    this.nonce.textContent = String(seed.nonce);
    this.clientSeed.value = seed.clientSeed;
  }
}
