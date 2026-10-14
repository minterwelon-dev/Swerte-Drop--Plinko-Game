import { modalTransition } from '../game/animation/ModalFx';
type Child = Node | string | null | false;

/** Tiny element builder. Text goes through text nodes, never innerHTML (client seeds are user input). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & Record<string, unknown> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('aria-') || k === 'role' || k === 'for') node.setAttribute(k, String(v));
    else (node as unknown as Record<string, unknown>)[k] = v;
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

/** Labelled form field; returns the wrapper and the control. */
export function field<T extends HTMLInputElement | HTMLSelectElement>(
  label: string,
  control: T,
): HTMLLabelElement {
  return el('label', { className: 'field' }, el('span', {}, label), control);
}

/** Display money string (e.g. "100.00") -> minor units, or null when empty / not a number. */
export function parseMoney(text: string, decimals: number): number | null {
  const t = text.trim();
  if (t === '') return null;
  const v = Number(t);
  return Number.isFinite(v) ? Math.round(v * 10 ** decimals) : NaN;
}

let openCount = 0;

/** Any DOM modal open? Game keyboard shortcuts must ignore keys while typing in one. */
export function modalOpen(): boolean {
  return openCount > 0;
}

/** Accessible DOM modal over the canvas. The backdrop dims; the page body is never touched. */
export class Modal {
  readonly body: HTMLDivElement;
  private readonly root: HTMLDivElement;
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.close();
    if (e.key === 'Tab') {
      const controls = this.root.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
      );
      const first = controls[0],
        last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  };
  private isOpen = false;
  private closing = false;
  private transition = 0;
  private previousFocus: HTMLElement | null = null;
  onClose: (() => void) | null = null;

  constructor(title: string, className = '') {
    this.body = el('div', { className: 'modal-body' });
    const heading = el('h2', { id: `m-${title.replace(/\W+/g, '-').toLowerCase()}` }, title);
    const close = el('button', { className: 'modal-close', type: 'button', 'aria-label': 'Close' }, '×');
    close.addEventListener('click', () => this.close());
    const box = el(
      'div',
      {
        className: `modal ${className}`,
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': heading.id,
      },
      el('div', { className: 'modal-head' }, heading, close),
      this.body,
    );
    this.root = el('div', { className: 'modal-backdrop' }, box);
    this.root.addEventListener('pointerdown', (e) => {
      for (const a of this.root.getAnimations({ subtree: true })) a.finish();
      if (e.target === this.root) this.close();
    });
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.transition++;
    this.closing = false;
    this.root.style.pointerEvents = '';
    this.previousFocus = document.activeElement as HTMLElement;
    openCount++;
    document.body.append(this.root);
    void modalTransition(this.root);
    document.addEventListener('keydown', this.onKey);
    (this.body.querySelector('input, select, button') as HTMLElement | null)?.focus();
  }

  close(): void {
    if (!this.isOpen || this.closing) return;
    this.closing = true;
    this.isOpen = false;
    openCount--;
    const transition = ++this.transition;
    this.root.style.pointerEvents = 'none';
    void modalTransition(this.root, true).then(() => {
      if (transition !== this.transition) return;
      this.closing = false;
      this.root.remove();
      this.root.style.pointerEvents = '';
      if (openCount === 0) this.previousFocus?.focus();
    });
    document.removeEventListener('keydown', this.onKey);
    this.onClose?.();
  }
}
