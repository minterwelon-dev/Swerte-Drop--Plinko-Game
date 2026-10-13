import { gameConfig } from '../gameConfig';

const money = new Intl.NumberFormat(gameConfig.locale, {
  minimumFractionDigits: gameConfig.currencyDecimals,
  maximumFractionDigits: gameConfig.currencyDecimals,
});

/** Minor units -> display string. Render time only; money stays integer everywhere else. */
export function formatMoney(minor: number): string {
  return money.format(minor / 10 ** gameConfig.currencyDecimals);
}

/** Exact multiplier, e.g. 999.96x, 0.2x. */
export function formatMultiplier(m100: number): string {
  return `${String(m100 / 100)}x`;
}

/** Short bin label that fits narrow bins: 1000x, 38.9x, 2.88x. */
export function formatMultiplierShort(m100: number): string {
  const m = m100 / 100;
  if (m >= 100) return `${Math.round(m)}x`;
  if (m >= 10) return `${String(Math.round(m * 10) / 10)}x`;
  return `${String(m)}x`;
}

/** Landing probability, e.g. "19.64%" or "1 in 65,536". */
export function formatProbability(p: number): string {
  if (p >= 0.01) return `${(p * 100).toFixed(2)}%`;
  return `1 in ${Math.round(1 / p).toLocaleString(gameConfig.locale)}`;
}
