# AGENTS.md — Ember Drop (Phaser 3 Plinko)

Read [PROJECT_BRIEF.md](PROJECT_BRIEF.md) for the game spec, RGS contract, phases and acceptance criteria. This file holds the **conventions and rules** for working in the repo.

## Stack
Phaser 3.90 · TypeScript (strict) · Vite · Vitest · `tsx` for Node scripts · WebP · MP3 96kbps
Targets: desktop and mobile browsers (iOS Safari / WKWebView, Android Chrome). Not a playable ad: no ad networks, no MRAID, no single-file build.

## Structure
```
src/
  main.ts                # Bootstrap, DOM ready gate, resize binding, lifecycle
  constants.ts           # DEPTH map, reference resolutions, layout constants
  gameConfig.ts          # Single public config object (bets, timings, defaults, autoplay options)
  analytics.ts           # trackEvent() stub (console in dev)
  utils/
    responsive.ts        # sx(), sy(), sd() + orientation reference helpers
    format.ts            # Money formatting (minor units -> display)
    timeline.ts          # Skippable promise-based presentation helper
  math/                  # PURE TS. Zero Phaser/DOM imports. Used by MockRGS and scripts/
    config.ts            # Rows options, risk levels, bet levels, cap, target RTP
    binomial.ts          # C(n,k), bin probabilities
    multipliers.ts       # GENERATED tables (MultiplierX100). Never hand-edit
    tuner.ts             # Table generator logic (used by scripts/tune.ts, not at runtime)
    rng.ts               # Seedable PRNG for mock seeds and simulation
    fair.ts              # HMAC-SHA256 path derivation via globalThis.crypto.subtle
    drop.ts              # Builds a DropResponse from path + bet + table
    feature.ts           # Multi-ball Plinko Feature outcome (Stage B)
  rgs/
    types.ts             # DropRequest / DropResponse / SeedState / FeatureRequest / FeatureResult
    RGS.ts               # Interface the client depends on
    MockRGS.ts           # Seeds, nonce, balance, rotate, latency, failures, resume, forced outcomes (DEV)
  state/
    PlinkoStateMachine.ts  # Single source of truth for round flow
    AutoPlay.ts            # Auto-drop controller and stop conditions
  scenes/
    BootScene.ts         # Critical preload + deferred manifest
    GameScene.ts         # Orchestrator only
  game/                  # Single-responsibility Phaser modules
    Board.ts             # Pegs and bins, driven by BinDef[] (not by risk tables)
    BallPath.ts          # Converts a path into waypoints and timings
    Ball.ts              # One ball view
    BallPool.ts          # Pooled balls (max 5 concurrent)
    Bins.ts              # Bin visuals, tier colours, landing feedback
    Hud.ts               # Balance, bet, rows, risk, drop, turbo, skip
    HistoryStrip.ts      # Last 20 results
    AutoPlayPanel.ts     # Auto-drop settings and limits
    SeedPanel.ts         # Hash display, client seed edit, rotate
    VerifyModal.ts       # DOM modal that recomputes a round
    FeatureOverlay.ts    # Stage B: intro, ball count wheel, summary
    SoundManager.ts      # Audio gating, mute, visibility suspend
    DebugPanel.ts        # DEV ONLY (import.meta.env.DEV)
Assets/
scripts/
  tune.ts                # Generates src/math/multipliers.ts to the target RTP
  simulate.ts            # RTP / volatility / distribution report (Node, imports src/math only)
docs/
  simulation-report.txt  # Committed output of `simulate --all`
```

### Responsibility split

- **`math/`** owns all outcome logic. Deterministic given seeds. No Phaser or DOM dependencies, so Node and Vitest can run it. `globalThis.crypto.subtle` is allowed (available in browsers and Node 20+).
- **`rgs/`** wraps `math/` behind the contract the client uses. The client depends on the `RGS` interface only, never on `math/` directly (except display helpers that read generated tables, such as bin labels and probabilities for tooltips).
- **`game/`** modules each own one concern. They receive the Phaser scene as a constructor argument and own their own game objects. They never call the RGS and never decide outcomes.
- **`state/`** decides what may happen next. Modules emit events, the state machine transitions.
- **`GameScene.ts`** is the wiring layer: creates modules, calls the RGS, feeds responses to the state machine and presenters. No layout math and no outcome logic.

## Rules

### Plinko-specific
- **The client never decides outcomes.** `path`, `bin`, `multiplierX100`, `win` and `balance` all come from the response. The ball must land in `response.bin`. Dev builds assert `sum(path) === bin` and that the displayed win equals `response.win`.
- **No physics for outcomes.** Do not use Arcade or Matter to decide where the ball goes. Animate waypoints derived from `path`; small visual wobble is allowed only if the ball is snapped to the next waypoint every row.
- **Multipliers are integer hundredths** (`MultiplierX100`). `win = bet * multiplierX100 / 100` is exact because bet levels are multiples of 100 minor units. Never use floats for currency or multipliers in `math/`.
- **Tables are generated.** Only `scripts/tune.ts` writes `multipliers.ts`. Vitest fails if any table's analytical RTP leaves 96.9% to 97.1%. Tuner constraint order is in PROJECT_BRIEF §2.4.
- **Win cap (5000x bet) applies to the feature round total** and is enforced in `feature.ts`. Classic tables max out at 1000x; `drop.ts` keeps a defensive clamp only.
- **Board is driven by `BinDef[]`**, not by risk tables, so the same board renders the classic game and the Stage B feature (jackpot bins).
- **Display balance vs server balance.** The server settles instantly. The HUD shows `displayBalance`, updated only when a ball visually lands. When no balls are in flight, assert `displayBalance === serverBalance`.
- **Provably fair protocol is fixed:** `HMAC-SHA256(serverSeed, "${clientSeed}:${nonce}")`, bit `i` = `(bytes[i >> 3] >> (i & 7)) & 1`, 0 = left, 1 = right. Changing it requires updating `fair.ts`, the verify modal, tests and the README together.
- **Auto-drop safety:** a loss limit is required and cannot be left empty. Auto-drop pauses when the tab is hidden. It cannot start with insufficient balance.
- **State machine is law.** No path starts a drop outside `Idle` or `Dropping` with fewer than 5 balls in flight. Log every transition in dev.
- **Every presentation is skippable.** Use `utils/timeline.ts`. Skip fast-forwards balls to their landing; turbo shortens row timing.
- **Reproducibility.** Any round replays from `(serverSeed, clientSeed, nonce, rows, risk)`. No `Math.random()` outside `math/rng.ts`.
- **Debug code is DEV only.** Forced bins, seed override, latency and failure controls live behind `import.meta.env.DEV`. The production bundle must not contain `force=` handling or the debug panel.
- **Tooltips and rules text are generated** from `math/` data (bin probabilities, multipliers). Never hand-type them.

### General (carried over from the slot and playable-ad projects)
- 60 FPS target; never below 30 on mid-range Android
- No hardcoded px: `sx()`, `sy()`, `sd()` only
- `setDisplaySize(sd())` on images, never `setScale`
- No audio autoplay: unmute on first `pointerdown`
- `for` loops in game logic; pool objects (balls, popups, peg flashes); no per-drop allocations
- Never dim via `body` / page background
- Named depth constants only, no magic numbers in scene code
- Single `Phaser.Game` per page

## Phaser Config
```ts
{ type: Phaser.AUTO, transparent: true,
  parent: <HTMLElement created at runtime>,
  scale:  { mode: Phaser.Scale.NONE, width: <ref w>, height: <ref h> },
  render: { antialias: true, pixelArt: false } }
```
`Scale.NONE`: manual sizing; CSS = viewport px; internal = viewport x DPR. `antialias: true` is required to avoid jagged edges on scaled WebP assets. Never set to `false`.

## Responsive (two references)
```ts
const landscape = viewW >= viewH
const ref = landscape ? { w: 1920, h: 1080 } : { w: 1080, h: 1920 }
const s    = Math.min(viewW / ref.w, viewH / ref.h)
const offX = (viewW - ref.w * s) / 2
const offY = (viewH - ref.h * s) / 2
// sx/sy/sd apply offX, offY, s
```

- `update()` polls `visualViewport` per frame for rotation
- On change: `game.scale.resize(vw * dpr, vh * dpr)` then `relayout()`
- `bindResponsiveResize()`: rAF debounce plus 100/300/600 ms retries
- Portrait is the primary layout: board on top, control panel below. Landscape: board centred, control panel at the side.
- Every module exposes `relayout(layout)`. Peg spacing, ball size and bin sizes derive from the layout rect and the row count.

## Round flow
```
Idle -> Dropping (1..5 balls in flight) -> Settling -> Idle
Idle -> AutoRunning -> Idle
Idle -> FeatureIntro -> BallCountWheel -> FeatureDropping -> FeatureSummary -> Idle
```
- A drop sends the request, shows the ball at the top immediately, and starts moving once the response arrives (target < one frame of added delay in the mock at 0 latency).
- Each ball is tied to a `roundId`; the landing handler credits `displayBalance` and updates the history strip.
- On RGS failure: retry modal; never leave a ball hovering forever.
- On refresh mid-drop: resume from the persisted unsettled rounds and animate them to their landing.

## Ball animation
- `BallPath` turns `path` into per-row waypoints (peg centre x/y per row, then bin centre).
- Per row: parabolic hop between pegs with a small random horizontal wobble (visual only), peg flash and tick sound with pitch rising by row.
- Timings (starting values, tune in `gameConfig.ts`): normal about 150 ms per row, turbo about 55 ms. A 16-row drop is about 2.4 s at normal speed.
- Landing: bin bounce, multiplier popup, tier-coloured flash, history push.
- Pegs are static: bake into one texture (RenderTexture) per layout; only flash overlays animate.

## Math and simulation
- `npm run tune` regenerates `src/math/multipliers.ts` for the target RTP (97%).
- `npm run simulate -- --rows 16 --risk high --drops 10000000 --seed 42` prints analytical RTP, simulated RTP with standard error, hit frequency, bin frequency vs expected, volatility, max multiplier, longest losing streak.
- `npm run simulate -- --all` runs all 15 tables plus the feature round and writes `docs/simulation-report.txt`.
- Same seed must produce identical output.
- Run `simulate --all` and commit the report whenever tables, tuner or feature weights change.
- Use analytical RTP as the source of truth. The simulation is a verification, and high-risk tables are expected to have a noisy simulated RTP (large edge multipliers are rare).

## Depth Map
Define in [constants.ts](src/constants.ts) as a `DEPTH` object.

| Layer | Depth |
|---|---|
| Background | 0 |
| Board back panel | 1 |
| Pegs (baked) | 2 |
| Bins | 3 |
| Balls | 5 |
| Peg flash FX | 6 |
| Multiplier popups | 8 |
| HUD and history strip | 10 |
| Dim overlay | 20 |
| Feature overlay (intro, wheel, summary) | 21 |
| Rules / seed / verify modals | 22 |
| Error / reconnect modal | 30 |
| Debug panel (DEV only) | 40 |

## Build
Standard Vite build (`dist/` with hashed assets). No `vite-plugin-singlefile`, no IIFE requirement.

- `npm run dev` runs the dev server with debug tools enabled
- `npm run build` produces the production bundle (debug code stripped)
- `npm test` runs Vitest
- `npm run tune` / `npm run simulate` run Node scripts via `tsx`
- Report bundle size (raw and gzip) in the README after each milestone
- If built output contains `console.error` from Phaser or bundled node modules, drop it at bundle time in the Vite config instead of editing library source:

```js
export default { esbuild: { pure: ['console.error'] } };
```

## Asset Loading
- **Critical** (BootScene): loader bar, background, board panel, ball, peg texture source. Target < 300 KB.
- **Deferred**: audio, feature overlay art, wheel art, particles. Loads while the player sits on the first `Idle` screen.
- Drop is disabled until the deferred-ready flag is set, with a visible "Loading" state on the button.
- Placeholder art is generated at boot (`Graphics` / `generateTexture`). Real art must not change any module API.

## Game Config
- `src/gameConfig.ts` is the single public source for client settings: bet levels, default bet, starting balance, default rows and risk, ball timings, turbo multiplier, max concurrent balls, auto-drop options and defaults, history length, currency format.
- Math parameters (rows options, tables, target RTP, cap, feature weights) live in `src/math/` and are **not** part of the client config.
- Do not scatter editable constants across modules.

## Tests (Vitest)
- Bin probabilities sum to 1; tables are symmetric; all 15 analytical RTPs inside the window
- `sum(path) === bin` for random paths; bins always in `[0, rows]`
- Same seeds and nonce give identical `DropResponse`; the verify function agrees with the server path
- Chi-square check of simulated bin frequencies on a fixed seed
- Feature total capped at 5000x bet in `feature.ts`; defensive clamp in `drop.ts`; every classic table's max <= 1000x
- Integer money in `drop.ts` and `feature.ts`
- Auto-drop stop conditions (win limit, loss limit, balance, rounds)
- Display balance equals server balance when no balls are in flight

## Ship Checklist

- [ ] All 15 analytical RTPs within 96.9% to 97.1% and tests pass
- [ ] `simulate --all` report committed
- [ ] Replaying a recorded drop through the verify screen matches the server response
- [ ] No Phaser/DOM imports in `src/math/` or `scripts/`
- [ ] Ball always lands in `response.bin`; dev assertions pass
- [ ] Display balance equals server balance when idle
- [ ] Auto-drop: loss limit required, pauses on hidden tab, all stop conditions work
- [ ] FPS >= 55 under 4x CPU throttle with 5 balls in flight
- [ ] Portrait and landscape pass, including live rotation and resize
- [ ] Skip and turbo work, including during auto-drop and the feature round
- [ ] Refresh mid-drop resumes correctly
- [ ] Audio muted until first `pointerdown`; suspended when tab hidden
- [ ] No `console.error` in production output
- [ ] Production bundle contains no debug panel or forced-outcome code
- [ ] Rules, tooltips and bin probabilities generated from `math/` data
- [ ] README includes the mock-fairness note and the "play-money only, simulated RTP" statement
- [ ] Demo link, simulation report and video present

## Pitfalls
| Issue | Fix |
|---|---|
| Ball lands in a different bin than the response | Derive waypoints from `path` only; assert `sum(path) === bin`; snap to waypoint each row |
| RTP drifts after editing tables | Never hand-edit `multipliers.ts`; rerun `tune`; tests enforce the window |
| Rounding changes the RTP | Multipliers are `x100` integers and bets are multiples of 100; tuner nudges centre bins to correct rounding |
| Simulated RTP looks off on high risk | Expected: edge bins are rare. Compare against analytical RTP using standard error |
| Win shown before the ball lands | Credit `displayBalance` only on landing; keep server balance separate |
| Async HMAC blocks or races the animation | Await the response before moving the ball; never block the render loop |
| FPS drops with many balls and pegs | Bake pegs into one texture, pool balls and popups, no per-frame allocations |
| Different results between Node and browser | Same `fair.ts`, `globalThis.crypto.subtle`, same text encoding; cover with a test vector |
| Rotation stuck | `Scale.NONE` + per-frame `visualViewport` poll |
| Mobile aliasing | Canvas = viewport x DPR, `antialias: true` |
| FPS drop on resize | rAF debounce |
| Audio blocked | Gate on first `pointerdown` |
| Audio keeps playing when tab hides | `visibilitychange` listener in `SoundManager`: mute Phaser sound and `suspend()` the `AudioContext` when `document.hidden`, resume on return |
| iPhone black screen (Android works) | Only one `Phaser.Game` per page. iOS WKWebView can reject a second WebGL context. Render the page background as CSS |
| iOS hangs on font load | `document.fonts.load()` can stall with base64 `@font-face`. Race against a 1.5 s timeout before starting the game |
| `Cannot read properties of null (reading 'appendChild')` in Phaser boot | Script ran before `<body>` existed. Gate `main.ts` on `DOMContentLoaded`; create the parent `<div>` at runtime and pass the element reference to `Phaser.Game({ parent })` |
| NineSlice won't shrink in landscape | `NineSlice` clamps to its inset sizes in source pixels. Operate it in source-pixel space and scale uniformly with `setScale(sd(1))` |
| Letterbox appears | Avoid `Scale.FIT/EXPAND/CENTER_BOTH`; keep `Scale.NONE` with manual sizing |
| Debug code leaks to production | Guard with `import.meta.env.DEV`; grep `dist/` for `force=` before release |
| Build output contains library `console.error` | Use `esbuild: { pure: ['console.error'] }` in the Vite config. Do not edit library source |
