import { reducedMotion } from '../../utils/responsive';
import { ANIM } from './animConfig';
let turbo = false;
export function setModalTurbo(value: boolean): void {
  turbo = value;
}
export const modalDuration = (ms: number): number => ms * (turbo ? ANIM.turboFactor : 1);

/** Native compositor animations preserve DOM input/focus and can be finished on tap. */
export function modalTransition(root: HTMLElement, closing = false): Promise<void> {
  const box = root.querySelector<HTMLElement>('.modal')!;
  root.getAnimations({ subtree: true }).forEach((a) => a.cancel());
  const duration = modalDuration(closing ? ANIM.modalCloseMs : ANIM.modalOpenMs);
  const transform = reducedMotion() ? 'none' : 'translateY(0.6rem) scale(0.9)';
  const frames = [
    { opacity: 0, transform },
    { opacity: 1, transform: 'none' },
  ];
  if (closing) frames.reverse();
  const a = box.animate(frames, { duration, easing: 'ease-out', fill: 'both' });
  root.animate(closing ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }], {
    duration,
    fill: 'both',
  });
  return a.finished.then(
    () => undefined,
    () => undefined,
  );
}

export function stamp(node: HTMLElement): void {
  node.animate(
    reducedMotion()
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [
          { opacity: 0, transform: 'scale(1.4)' },
          { opacity: 1, transform: 'scale(1)' },
        ],
    { duration: modalDuration(ANIM.stampMs), easing: 'ease-out' },
  );
}
