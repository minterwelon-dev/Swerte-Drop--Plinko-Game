import { BET_LEVELS, type Risk, type Rows } from './math/config';

/** Single public source for client settings. Math parameters live in src/math and are not configurable here. */
export const gameConfig = {
  startingBalance: 100_000,
  betLevels: BET_LEVELS,
  defaultBet: 100,
  defaultRows: 16 as Rows,
  defaultRisk: 'medium' as Risk,

  /** Per-row hop duration. A 16-row drop is about 2.4 s normal. */
  rowMs: 150,
  turboRowMs: 55,
  maxBalls: 5,
  historyLength: 20,

  locale: 'en-US',
  currencyDecimals: 2,

  autoplay: {
    roundOptions: [10, 25, 50, 100],
    defaultRounds: 10,
    /** Pre-filled loss limit in minor units; the player can change it but not clear it. */
    defaultLossLimit: 10_000,
    /** Gap between auto drops (normal / turbo). */
    intervalMs: 300,
    turboIntervalMs: 120,
  },

  /** Mock transport. The DEV debug panel overrides these at runtime. */
  mock: { latencyMs: 0, failureRate: 0 },
};
