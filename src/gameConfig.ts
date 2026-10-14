import { BET_LEVELS, type Risk, type Rows } from './math/config';

/** Single public source for client settings. Math parameters live in src/math and are not configurable here. */
export const gameConfig = {
  startingBalance: 100_000,
  betLevels: BET_LEVELS,
  defaultBet: 100,
  defaultRows: 16 as Rows,
  defaultRisk: 'medium' as Risk,

  /** Row hops plus the short hopper load/release make a 16-row drop about 2.2 s. */
  rowMs: 110,
  turboRowMs: 44,
  maxBalls: 5,
  historyLength: 9,

  motion: {
    introMs: 1200,
    rowsMs: 350,
    riskMs: 300,
    binStaggerMs: 20,
    modalOpenMs: 200,
    modalCloseMs: 140,
    stampMs: 400,
    seedMs: 600,
    orientationMs: 200,
    chaseMs: 800,
    signBumpMs: 600,
    swayMs: 4000,
    idleMs: 6000,
    bigWinMs: [1200, 1800, 2500],
    streamers: [40, 80, 120],
    confetti: {
      lifeMs: 2800,
      emissionMs: 180,
      drag: 1.8,
      gravity: 420,
      launchSpeed: 360,
      flutterHz: 1.4,
      fadeMs: 650,
    },
    pressMs: 80,
    releaseMs: 120,
    toggleMs: 150,
    loadMs: 180,
    releaseBallMs: 120,
    staggerMs: 16,
    pegMs: 120,
    landingMs: 220,
    settleMs: 300,
    shortMs: 150,
    tagMs: 700,
    tagPool: 6,
    winMinMs: 300,
    winMaxMs: 900,
    balanceMs: 250,
    betMs: 120,
    limitMs: 250,
    lowBalanceMs: 600,
    historyMs: 220,
    badgeMs: 150,
    turboFactor: 0.5,
    reducedFactor: 0.45,
    trailAlpha: 0.2,
  },

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

  /** Stage B Plinko Feature presentation timings (ms). Every step is skippable. */
  feature: {
    boardRevealMs: 550,
    jackpotMs: 2000,
    capMs: 2000,
    wheelTickMs: 70,
    introMs: 1800,
    spinMs: 3000,
    turboSpinMs: 1200,
    resultMs: 1000,
    turboResultMs: 400,
    /** Gap between feature ball launches (normal / turbo); up to maxBalls fly at once. */
    launchMs: 220,
    turboLaunchMs: 90,
    summaryMs: 5000,
  },

  /** Mock transport. The DEV debug panel overrides these at runtime. */
  mock: { latencyMs: 0, failureRate: 0 },
};
