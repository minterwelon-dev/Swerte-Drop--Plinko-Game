# Swerte Drop: UI Layout + Animation Spec

> For Codex / Claude Code. Save in the repo root next to `AGENTS.md` and `PROJECT_BRIEF.md`.
> Prompt: **"Read SWERTE_UI_ANIMATION_SPEC.md and AGENTS.md. Implement Phase A (layout) first and stop for review, then Phase B."**
> Visual reference: the "Swerte Drop UI" mockup (portrait 480x1026, landscape 1280x720). Build the look from that mockup; do not invent a different style.

---

## 0. Scope and hard rules

- Visual + animation layer only. **Do not change `math/`, `rgs/` or `state/` logic.** Outcomes (path, bin, win) always come from the RGS response. Animation only plays them back.
- Follow `AGENTS.md`: `sx/sy/sd` helpers, `setDisplaySize(sd())` on images (never `setScale`), one `Phaser.Game`, pooled objects, named DEPTH constants, audio gated on first `pointerdown`, debug code DEV-only.
- **Scale rule:** anything animated that is an image is wrapped in a `Container`. Tween the container's `scale`, never the image's.
- Every animation: respects **Turbo** (shorter durations, fewer particles), is **skippable** (tap to jump to the end state), and has a **reduced-motion** variant (no shake, no flashes, no particles; fades only).
- No flashing faster than 3 Hz. Post-FX on at most 3 objects at once. Cap particles per section 5.
- All durations/easings live in one `ANIM` config (`src/game/animation/animConfig.ts`). No magic numbers in game modules.
- Ball motion is **waypoint-based from `path`**. No physics engine decides anything. A small cosmetic jitter is allowed but must end on the exact bin from the response.

## 1. Design tokens (from the mockup)

| Token | Value | Use |
|---|---|---|
| ink | `#1d130d` | outlines, text on light |
| felt | `#173a2f` -> `#2a5a49` radial | board background |
| cream | `#f1e3c0` | placards, light buttons, text on dark |
| mustard | `#e0a02a` / `#f6c744` | bet value, medium risk, title paint |
| enamel | `#b92f27` | canopy, drop button, high bins, high risk |
| teal-dull | `#365f54` | sub-1x bins |
| teal-light | `#5fb59c` | low risk |
| wood | `#86552f` sign, `#5a331c` counter, `#7a4727` frame | |
| bulb | `#ffd36b`, `#fff1c9`, `#ffb347` | light string, drop ring |
| brass peg | `#fff2c2` -> `#d9a441` -> `#6e4a16` | pegs |
| ball | `#ffe27a` -> `#e8b21e` -> `#9c6a0c`, white specular | balls |

Fonts: **Alfa Slab One** (title, HULOG), **Barlow Condensed 500/600/700** (everything else, tabular figures). Load with the existing iOS font-race pattern (1.5 s timeout). Latin only.

## 2. Layout

### 2.1 Portrait (reference 1080x1920, mockup is 480x1026 scaled)

Top to bottom:

1. **Canopy** striped red/cream, scalloped bottom edge, **bulb string** hanging below it (4 sagging segments, 16 bulbs).
2. **Title sign** (wood plank on two ropes): "SWERTE DROP", subline "HULOG-BOLA · PLAY MONEY ONLY".
3. **Stat placards** (two): `BALANSE` (cream, ink text) and `PANALO` (dark, mustard text, shows last multiplier at the right).
4. **Board** (wood frame, felt, dashed chalk border): hopper at top, brass pegs (row r has r+3 pegs), painted diamond patterns in the empty corners, dark trough with **prize-ticket bins**, `BOLA ●●●○○` badge top right (balls in flight / max 5).
5. **Wooden counter** (controls):
   - Row A: bet stepper (`-`, `TAYA · BET` plaque, `+`) and `ROWS` tabs 8/10/12/14/16.
   - Row B: `RISK` LOW / MEDIUM / HIGH.
   - Row C: `TURBO`, `AUTO` | big round **HULOG** drop button with bulb ring | `SKIP`, `FAIR`.
   - Row D: `KASAYSAYAN` history strip of 9 mini ticket stubs (newest left, glowing).

### 2.2 Landscape (reference 1920x1080)

Three columns: **left** (sign, balance, last win, 3x3 history grid), **centre** (board, same build as portrait, scaled up), **right** (wooden crate: bet, rows, risk, HULOG + ring, 4 small buttons). Canopy and bulb string span the full width.

### 2.3 Rules

- Layout is data-driven: one `layoutPortrait()` / `layoutLandscape()` function sets positions; no per-element if/else scattered in modules.
- The board is a **BinDef-driven** component: rows 8-16 change peg count and bin count; bin widths and the peg spacing are derived, never hard-coded to 10 rows.
- Bin labels and colour tiers come from the generated multiplier table (`m >= 10` enamel, `>= 3` mustard, `>= 1` cream, else dull teal). Never hard-code multipliers.
- Minimum touch target 44 px (reference scale) for every button.
- Texts needing live values (balance, bet, win, multipliers) are Phaser text/bitmap text, not baked into images.

## 3. Elements and states (what must exist as objects)

| Element | Object | States |
|---|---|---|
| Canopy + scallop | static image/Graphics | idle |
| Bulbs (16 / 42 landscape) | pooled Containers | idle twinkle, win chase, off (reduced motion) |
| Title sign + ropes | Container | idle sway, win bump |
| Balance placard | Container + text | idle, updating, low-balance warning |
| Win placard | Container + text | empty, counting up, tier flash |
| Pegs | pooled Containers (brass sprite) | idle, hit (pulse) |
| Hopper | Container | idle, loading ball, releasing |
| Ball | pooled Container | in hopper, falling (per-row hops), landed, fading |
| Prize bin ticket | Container | idle, hit, jackpot-hit |
| Win tag (+amount) | pooled Container | hidden, popping, floating away |
| `BOLA` badge dots | 5 small objects | empty, filled (per active ball) |
| Bet stepper (-, +) | buttons | idle, pressed, disabled (ball in flight or at limit) |
| Bet plaque | Container + text | idle, value change |
| Rows tabs | 5 buttons | idle, selected, pressed, disabled (while balls in flight) |
| Risk buttons | 3 buttons | idle, selected (pressed-in look), disabled |
| HULOG button + bulb ring (12 bulbs) | Container | idle pulse, pressed, cooldown/disabled, auto-active |
| TURBO / AUTO / SKIP / FAIR | buttons | idle, pressed, toggled-on (mustard), disabled |
| History stubs (9) | pooled Containers | idle, new-entry insert |
| Modals (Auto setup, Fair/verify, settings) | Containers | closed, opening, closing |
| Jackpot / big-win overlay | Container | hidden, tier 1-3, dismissing |

## 4. Animation inventory

Durations are starting values for `ANIM`; tune by feel. "Turbo" column = factor applied to duration (and particle counts).

### 4.1 Ball and board (core feel)

| # | Animation | Trigger | Description | Duration | Turbo |
|---|---|---|---|---|---|
| B1 | Hopper load | drop confirmed by RGS response | Ball appears in hopper with a small squash-in, hopper tilts ~4 deg | 180 ms | x0.5 |
| B2 | Release | after B1 | Hopper wobbles, ball drops out | 120 ms | x0.5 |
| B3 | Row hops | each `path` step | Ball travels peg to peg along waypoints (gravity-style ease: accelerate then small hop-back at each peg), slight rotation | ~110 ms per row | x0.4 |
| B4 | Peg hit pulse | ball reaches a peg | Peg scale 1 -> 1.25 -> 1 (container), tiny brightness flick, optional soft "tick" | 120 ms | x0.5 |
| B5 | Cosmetic jitter | during B3 | +-2 px horizontal wobble that **always converges to the exact waypoint** | n/a | skip |
| B6 | Ball trail (optional) | during B3 | Short dotted fade trail, max 6 points, pooled | n/a | off in turbo |
| B7 | Bin landing | ball reaches bin | Ball drops into the slot with a squash, ticket lifts ~12 px and glows, tag pops | 220 ms | x0.5 |
| B8 | Bin settle | after B7 | Ticket returns to rest, ball fades inside the trough | 300 ms | x0.5 |
| B9 | Multi-ball | 2-5 balls in flight | Balls share the pool, each with own timeline, small random start delay so they never overlap exactly | n/a | n/a |
| B10 | Skip | tap during a drop | Fast-forward that ball to its landing (still plays B7/B8 short form). Never changes the result | 150 ms | n/a |

### 4.2 Win presentation

| # | Animation | Trigger | Description | Duration |
|---|---|---|---|---|
| W1 | Win tag | any landing with win > 0 | `+₱x.xx` tag pops above the bin (scale 0 -> 1.15 -> 1), floats up 24 px, fades | 700 ms |
| W2 | Win placard count-up | win > 0 | Number counts up (ease-out), placard does a 4% bump; loss (< 1x) is a quiet instant update, no celebration | 300-900 ms by size |
| W3 | Balance update | after W2 | Balance ticks to new value, brief mustard flash on increase, no flash on decrease | 250 ms |
| W4 | Sub-1x landing | multiplier < 1 | No fanfare: ticket nudges, tag in muted style. Never celebrate a net loss | 150 ms |
| W5 | Bulb chase | win >= 2x | Light string bulbs light in sequence along the canopy | 800 ms |
| W6 | Sign bump | win >= 5x | Sign swings +-3 deg and settles | 600 ms |
| W7 | Big-win overlay | tier big >= 15x / mega >= 50x / epic >= 100x | Banner (painted-sign style) drops from the canopy on ropes, confetti-style paper streamers, count-up, tap to skip. Higher tier = more streamers + longer hold | 1.2 / 1.8 / 2.5 s |
| W8 | Jackpot bin hit (Stage B) | Mini/Minor/Major bin | Dedicated bin glow loop + overlay named after the jackpot; Grand-level handled the same way, bigger | 2-3 s |
| W9 | Cap reached | win hit the 5000x cap | Banner variant with "MAX WIN" copy; the round ends cleanly | 2 s |

### 4.3 Ambient (always on, cheap)

| # | Animation | Description | Cost rule |
|---|---|---|---|
| A1 | Bulb twinkle | Each bulb alpha 0.85 <-> 1 on staggered sine, glow sprite additive | one tween per group, not per bulb where possible |
| A2 | Sign idle sway | +-0.8 deg, 4 s loop | 1 tween |
| A3 | Drop ring pulse | HULOG bulb ring breathes (alpha/scale 1 -> 1.04), slows when disabled | 1 tween |
| A4 | HULOG idle nudge | Subtle vertical bob every ~6 s when idle > 5 s to hint "tap me" | cancelled on any input |
| A5 | Hopper idle | Faint rattle when ball ready (optional) | off in reduced motion |

Pause all ambient animation when the tab is hidden or Phaser loses focus.

### 4.4 Controls and HUD

| # | Animation | Trigger | Description | Duration |
|---|---|---|---|---|
| C1 | Button press | pointerdown | Container scale 1 -> 0.94 and the 4 px "shadow" collapses (button sinks); release springs back (overshoot 1.04) | 80 / 120 ms |
| C2 | HULOG press | pointerdown | Same as C1 but deeper, ring bulbs flash once | 100 ms |
| C3 | HULOG disabled | max balls in flight | Dim to 60% brightness, ring slows; re-enable pops with a small scale tick | 150 ms |
| C4 | Bet change | +/- | Number rolls vertically (old slides up/out, new slides in), plaque nudges | 120 ms |
| C5 | Bet limit | at min/max or > balance | Plaque shakes horizontally 3x (2 px) and flashes enamel border; reduced motion: border flash only | 250 ms |
| C6 | Rows change | tab press | Tab press effect; board rebuilds: pegs fade/scale out then in (stagger by row, 12 ms per row), bins re-tile; **only allowed when no balls are in flight** | 350 ms |
| C7 | Risk change | risk press | Selected button sinks (shadow collapses, text colour swap); bin tickets flip/colour-swap in a left-to-right stagger (20 ms each) to the new multipliers | 300 ms |
| C8 | Toggle on | TURBO / AUTO | Button fills mustard with a small pop; AUTO active also shows the ring in "running" mode (slow chase) | 150 ms |
| C9 | Skip availability | a presentation is skippable | SKIP button gently pulses while available; greyed otherwise | loop |
| C10 | History insert | each landing | New stub slides in at the left, others shift right by one slot, the oldest fades out; newest has a short glow | 220 ms |
| C11 | Low balance | balance < bet | Balance placard border pulses enamel twice, bet auto-clamps with C5 | 600 ms |
| C12 | BOLA badge | ball released / landed | Dot fills with a pop on release, empties with a fade on landing | 150 ms |

### 4.5 Screens, modals and transitions

| # | Animation | Description | Duration |
|---|---|---|---|
| M1 | Boot / intro | Canopy drops in from above (ease-out-back), bulbs light up left to right, sign swings in on ropes, board and counter rise in | 1.2 s, skippable on tap |
| M2 | Modal open | Dim layer fades to 60%, panel (painted-board style) scales 0.9 -> 1 with a slight rise | 200 ms |
| M3 | Modal close | Reverse, faster | 140 ms |
| M4 | Auto-drop setup | Same as M2; the loss-limit field is required before START is enabled (button enable pops) | 200 ms |
| M5 | Auto-drop running | Small counter badge on AUTO ("12 left"), ticks down with C4-style roll; stop-condition hit shows a short banner | 200 ms |
| M6 | Fair / verify | Panel opens; verification result shows a stamp animation (checkmark stamp scales in 1.4 -> 1 with a small thud) or a clear error state, no confetti | 400 ms |
| M7 | Seed rotate | Old seed text strikes through and the new hash types in (cap at 600 ms, skippable) | 600 ms |
| M8 | Orientation change | Layout re-flows with a 200 ms fade; no tween of positions across orientations | 200 ms |
| M9 | Error / retry | RGS failure: small enamel banner slides from the canopy; ball in hopper returns (reverse B1) and the bet is not deducted | 250 ms |
| M10 | Resume | When resuming an unfinished round, balls are placed at their landing state (no replay unless the player taps "Replay") | instant |

### 4.6 Plinko Feature (Stage B, only after Stage A is stable)

| # | Animation | Description |
|---|---|---|
| F1 | Trigger | Bonus bin hit: the board dims, the bin pulses, "PLINKO FEATURE" painted banner drops from the canopy |
| F2 | Ball-count wheel | A perya wheel (spin, clack ticks slowing down, settle with a small bounce) picks 10-30 balls. Result from the RGS, wheel only presents it |
| F3 | Feature board | Bins swap to BinDef feature layout (jackpot bins: Mini / Minor / Major) with a stagger reveal |
| F4 | Ball rain | Balls release in bursts from the hopper (max 5 on screen, queue the rest); counter shows remaining |
| F5 | Running total | Total win placard counts up per landing, cap (5000x) handled with W9 |
| F6 | Summary | Painted board summary with total, count-up, tap to collect |

## 5. Particle and object budgets

| Item | Cap |
|---|---|
| Balls in flight | 5 |
| Ball trail points | 6 per ball, off in turbo |
| Win-tag objects | 6 pooled |
| Confetti / paper streamers | 40 (big), 80 (mega), 120 (epic); half in turbo; 0 in reduced motion |
| Bulb glow sprites | 1 additive sprite per bulb group, not per bulb where possible |
| Post-FX objects | max 3 (e.g. the lit bin glow, the overlay banner, one spare) |
| Active tweens (ambient) | under 12 |

Everything pooled; no allocation inside `update()`; no per-frame string building for text.

## 6. Module structure

```
src/game/animation/
  animConfig.ts        // ANIM durations/easings, TURBO factors, budgets
  AnimDirector.ts      // plays presentations from a PlinkoDropResult, owns skip + turbo
  BallAnimator.ts      // waypoints, hops, landing (B1-B10)
  BoardEffects.ts      // peg pulses, bin states, rebuild (B4, C6, C7)
  WinPresenter.ts      // W1-W9
  Ambient.ts           // A1-A5, pause/resume on visibility
  ButtonFx.ts          // C1-C3, C8, C9 reusable press behaviour
  HudFx.ts             // C4, C5, C10-C12
  ModalFx.ts           // M2-M7
  Intro.ts             // M1
```

Rules:
- `AnimDirector` takes a finished `DropResult` (path, bin, win, tier) and returns a Promise that resolves when the presentation ends or is skipped. The state machine awaits it; it never asks the director for outcomes.
- Emit events (`ball:released`, `ball:landed`, `win:counted`, `presentation:done`) so audio and HUD subscribe without coupling.
- Reduced motion = `matchMedia('(prefers-reduced-motion: reduce)')` plus an in-game toggle. It maps to `ANIM.reduced` variants (fades only, no shake, no particles, ball hops shortened, no ambient twinkle).

## 7. Audio hooks (events only; assets later)

`peg_tick` (pitch rises slightly per row), `ball_release`, `bin_land_low/mid/high`, `win_count_loop`, `bulb_chase`, `big_win_sting`, `button_press`, `modal_open`, `stamp`. Gated on the first `pointerdown`; mute toggle persists; no audio on hidden tab.

## 8. Build order

**Phase A: layout (stop for review)**
1. Tokens, fonts, `layoutPortrait()` / `layoutLandscape()`, static scene matching the mockup (no animation).
2. BinDef-driven board for all row counts (8-16), correct bin colours from the multiplier table.
3. Controls wired to the existing state (bet, rows, risk, drop, turbo, auto, skip, fair).

**Phase B: core animation**
4. `animConfig`, `ButtonFx` (C1-C3, C8).
5. `BallAnimator` (B1-B10) with turbo + skip; multi-ball (B9).
6. `WinPresenter` W1-W4, `HudFx` C4, C5, C10-C12.

**Phase C: polish**
7. `Ambient` (A1-A5), W5-W7, big-win tiers.
8. `ModalFx` (M2-M7), `Intro` (M1), orientation change (M8), error/resume (M9, M10).
9. Reduced-motion pass over everything.

**Phase D: Stage B only after A-C are accepted**
10. F1-F6, jackpot bins W8, cap W9.

## 9. Acceptance checklist

- [ ] Portrait and landscape match the mockup structure; no overlap or clipping at 360x640 up to 1920x1080 and on rotation.
- [ ] All 5 row counts and 3 risk levels render correct pegs, bins and colours from data.
- [ ] A seeded drop always lands in the bin from the RGS response, at normal speed, turbo and after skip.
- [ ] Skip never changes balance, bin or win; displayed totals equal `totalWin` (dev assert).
- [ ] 5 balls in flight hold 60 FPS desktop and >= 55 FPS at 4x CPU throttle (mobile viewport).
- [ ] Sub-1x results are visibly calm (no celebration).
- [ ] No flashing above 3 Hz; reduced motion removes shake, flashes, particles and twinkle.
- [ ] Controls that change the board (rows, risk, bet) are disabled while balls are in flight, with a visible disabled state.
- [ ] Ambient animation pauses on hidden tab and resumes cleanly.
- [ ] Pools are used for balls, tags, pegs, bulbs, streamers; no allocations in `update()`.
- [ ] No Phaser import under `src/math/`; no outcome logic in `src/game/animation/`.
- [ ] Production build has no debug or forced-outcome code.

## 10. Do not

- Do not add text, people, faces or religious imagery to any asset.
- Do not use real perya or casino brand names, logos or existing game art.
- Do not add real-money wording; keep "PLAY MONEY" visible (sign, settings, verify screen).
- Do not invent extra screens or features beyond this document; ask first.
