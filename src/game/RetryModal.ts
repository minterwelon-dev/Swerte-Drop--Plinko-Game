import { el, Modal } from '../utils/dom';

/** Error / reconnect prompt. Concurrent failures share one prompt and one answer. */
export class RetryModal {
  private readonly modal = new Modal('Connection problem', 'modal-error');
  private readonly text = el('p', { className: 'note' });
  private pending: Promise<boolean> | null = null;
  private resolve: ((retry: boolean) => void) | null = null;

  constructor() {
    const retry = el('button', { className: 'btn primary', type: 'button' }, 'Retry');
    const cancel = el('button', { className: 'btn', type: 'button' }, 'Cancel drop');
    retry.addEventListener('click', () => this.answer(true));
    cancel.addEventListener('click', () => this.answer(false));
    this.modal.onClose = () => this.answer(false);
    this.modal.body.append(this.text, el('div', { className: 'row' }, retry, cancel));
  }

  ask(message: string): Promise<boolean> {
    if (this.pending) return this.pending;
    this.text.textContent = message;
    this.pending = new Promise((r) => (this.resolve = r));
    this.modal.open();
    return this.pending;
  }

  private answer(retry: boolean): void {
    const resolve = this.resolve;
    this.pending = null;
    this.resolve = null;
    this.modal.close();
    resolve?.(retry);
  }
}
