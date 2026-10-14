import { gameConfig } from '../gameConfig';
import { validateAutoSettings, type AutoPlaySettings } from '../state/AutoPlay';
import { el, field, Modal, parseMoney } from '../utils/dom';
import { formatMoney } from '../utils/format';
import { reducedMotion } from '../utils/responsive';
import { modalDuration } from './animation/ModalFx';

const D = gameConfig.currencyDecimals;
const toInput = (minor: number) => (minor / 10 ** D).toFixed(D);

/** Auto-drop settings. The loss limit is pre-filled and cannot be left empty. */
export class AutoPlayPanel {
  private readonly modal = new Modal('Auto-drop');
  private readonly rounds = el('select', { name: 'rounds' });
  private readonly loss = el('input', { type: 'text', inputMode: 'decimal', required: true });
  private readonly single = el('input', { type: 'text', inputMode: 'decimal', placeholder: 'Off' });
  private readonly profit = el('input', { type: 'text', inputMode: 'decimal', placeholder: 'Off' });
  private readonly balance = el('input', { type: 'text', inputMode: 'decimal', placeholder: 'Off' });
  private readonly error = el('p', { className: 'error', role: 'alert' });
  private readonly summary = el('p', { className: 'note' });
  private bet = 0;
  private serverBalance = 0;

  constructor(onStart: (s: AutoPlaySettings) => void) {
    for (const r of gameConfig.autoplay.roundOptions)
      this.rounds.append(el('option', { value: String(r) }, `${r} drops`));
    this.rounds.value = String(gameConfig.autoplay.defaultRounds);
    this.loss.value = toInput(gameConfig.autoplay.defaultLossLimit);

    const start = el('button', { className: 'btn primary', type: 'submit' }, 'Start auto-drop');
    this.loss.addEventListener('input', () => {
      const wasDisabled = start.disabled;
      const value = parseMoney(this.loss.value, D);
      start.disabled = value === null || !Number.isFinite(value) || value <= 0;
      if (wasDisabled && !start.disabled)
        start.animate(
          reducedMotion()
            ? [{ opacity: 0.6 }, { opacity: 1 }]
            : [{ transform: 'scale(.96)' }, { transform: 'scale(1)' }],
          { duration: modalDuration(gameConfig.motion.toggleMs), easing: 'ease-out' },
        );
    });
    const form = el(
      'form',
      { className: 'modal-body', noValidate: true },
      this.summary,
      field('Rounds', this.rounds),
      field('Stop if total loss reaches (required)', this.loss),
      field('Stop if a single win is at least', this.single),
      field('Stop if total profit reaches', this.profit),
      field('Stop if balance falls below', this.balance),
      this.error,
      start,
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const settings: AutoPlaySettings = {
        rounds: Number(this.rounds.value),
        lossLimit: parseMoney(this.loss.value, D) ?? NaN,
        singleWinStop: parseMoney(this.single.value, D),
        profitStop: parseMoney(this.profit.value, D),
        balanceBelow: parseMoney(this.balance.value, D),
      };
      const err = validateAutoSettings(settings, this.bet, this.serverBalance);
      this.error.textContent = err ?? '';
      if (err) return;
      this.modal.close();
      onStart(settings);
    });
    this.modal.body.append(form);
  }

  open(bet: number, serverBalance: number): void {
    this.bet = bet;
    this.serverBalance = serverBalance;
    this.summary.textContent = `Bet ${formatMoney(bet)} per drop. Auto-drop pauses while this tab is hidden.`;
    this.error.textContent = '';
    this.modal.open();
  }
}
