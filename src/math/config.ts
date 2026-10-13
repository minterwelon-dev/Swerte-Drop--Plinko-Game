// Math parameters. Not part of the client config (see AGENTS.md "Game Config").

export const ROWS_OPTIONS = [8, 10, 12, 14, 16] as const;
export type Rows = (typeof ROWS_OPTIONS)[number];

export const RISKS = ['low', 'medium', 'high'] as const;
export type Risk = (typeof RISKS)[number];

/** Multiplier in integer hundredths: 1.50x = 150. */
export type MultiplierX100 = number;
export type MultiplierTable = readonly MultiplierX100[];

/** Bet levels in minor units. Multiples of 100 so bet * m100 / 100 is an exact integer. */
export const BET_LEVELS = [100, 200, 500, 1000, 2000, 5000] as const;

export const TARGET_RTP = 0.97;
export const RTP_MIN = 0.969;
export const RTP_MAX = 0.971;

/** Feature round total cap, in multiples of the triggering bet. */
export const WIN_CAP_X = 5000;
/** Highest multiplier any classic table may contain (1000.00x). */
export const CLASSIC_MAX_X100 = 100_000;

/**
 * Tuner shape per risk: m(d) = centre * exp(alpha * d^beta), d = |k - rows/2|.
 * centre and beta are fixed here; alpha is solved per table for TARGET_RTP.
 * guideMax is the §2.4 design guidance (soft), used only for reporting.
 */
export const TUNER_SHAPE: Record<Risk, { centre: number; beta: number; guideMax: Record<Rows, number> }> = {
  low: { centre: 0.5, beta: 1.2, guideMax: { 8: 5, 10: 7, 12: 9, 14: 12, 16: 15 } },
  medium: { centre: 0.3, beta: 1.4, guideMax: { 8: 15, 10: 25, 12: 40, 14: 70, 16: 120 } },
  high: { centre: 0.2, beta: 1.68, guideMax: { 8: 30, 10: 80, 12: 170, 14: 420, 16: 1000 } },
};
/** Allowed centre drift from rounding nudges, in hundredths (±0.05x). */
export const CENTRE_TOLERANCE_X100 = 5;
