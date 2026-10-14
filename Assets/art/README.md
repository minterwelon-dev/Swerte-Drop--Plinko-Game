# Swerte Drop generated art, v1

## Current board correction, v2

The built-in imagegen tool edited `source/board-v1.png` to remove the flawed corner diamonds. The output is preserved as `source/board-v2.png`; exact edit prompt: [board-v2-prompt.txt](source/board-v2-prompt.txt). The game loads **board-v2.webp (53126 bytes)**. A mirrored Phaser stencil places identical diamonds below the badge; the generated wood and felt remain in use. Both v1 files remain for provenance, but are not imported into the build.

Current total runtime art: **207214 bytes** including the unchanged wood and canopy. WebP conversion: `docs/phase-a-review/optimize-board-v2.mjs`. Current layout review: `docs/layout-v2-review/`. Below is the original v1 record.

Generated with the built-in imagegen tool on 2026-10-14. The user requested generated assets to improve the supplied perya mockups. Bungee and Nunito Sans remain live fonts. No third-party game artwork was incorporated.

| Runtime asset | Purpose | Bytes | Exact prompt |
| --- | --- | ---: | --- |
| board-v1.webp | Framed felt board and corner diamond paint | 109458 | [Board](source/board-prompt.txt) |
| wood-v1.webp | Sign and counter, cropped to each layout's aspect ratio | 67694 | [Wood](source/wood-prompt.txt) |
| canopy-v1.webp | Red/cream cloth valance, genuine alpha below scallops | 86394 | [Canopy](source/canopy-prompt.txt) |

Total runtime image payload: **263546 bytes**. Original unmodified PNGs are preserved in `source/`. Browser Canvas performs only downsampling and WebP encoding (quality 0.78), preserving canopy alpha. See `docs/phase-a-review/optimize-art.mjs`. Sources are not included in the production bundle.

Board corners are opaque dark pixels; the board sits over the dark booth. The landscape canopy repeats three sections. Lettering, controls, bulbs, pegs, balls and prize tickets remain separate Phaser objects so they can respond to gameplay and future animation work.

Visual checks: 360x640, 390x844, 1280x720 and 1920x1080; screenshots and checks are in `docs/imagegen-review/`. No generated lettering, people, brand marks or religious imagery. Material detail was inspected at phone and desktop sizes. Physical-device performance is not yet measured.
