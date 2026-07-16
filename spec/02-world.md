---
id: SPEC-WORLD
title: World, Cast & Art Style
status: implemented
code: [src/entities.ts, src/sprites.ts, src/render/]
---

# World, Cast & Art Style

This spec owns the fiction and the look. Mechanical values (hitbox sizes, spawn
weights, effects) for the same cast live in `SPEC-ENTITIES` and are keyed by the
same entity ids.

## World concept: "Poco's Special Delivery"

Status: implemented — theme, Poco, and the full P0–P11 cast, including the
P11 effect items

**Premise.** Poco is a baker's apprentice in the fantasy town of **Karamell**.
The queen's birthday cake is finished — but the castle gate closes at sundown,
240 meters up the main street. Poco sprints from the bakery through the old
town, weaves through the crowded market, and charges up the castle road with
the cake box held high. Bumping into anything ruins the cake; scattered coins
(the townsfolk cheering him on) sweeten the score.

**Tone.** Cozy and slightly comedic, never punishing: a crash is a pratfall
(the cake box goes flying), not a death. Warm golden late-afternoon light
shifts toward dusk as the run progresses — the lighting change doubles as the
zone-transition mechanic (`SPEC-CORE › zones`). Chibi pixel art, big readable
silhouettes, gentle humor (napping cats, chicken flocks, flustered guards).

**Why a delivery.** A deadline delivery explains the whole mechanical contract
for free: run forward, don't touch anything, the goal is a gate.

**Rejected alternatives** (recorded so they are not re-proposed):

- *Apprentice witch on a broom* — flying reads as vertical dodging, which
  fights the ground-lane collision model and makes static obstacles illogical.
- *Knight squire fetching a sword* — sets combat expectations the game never
  fulfills.

## Protagonist: Poco (`poco`)

Status: implemented — fallback look (P2, src/render/shapes.ts drawFallback
`"runner"`) and sprite sheet + animation states (P3, public/assets/sheets/poco.png,
src/sprites.ts, src/render/entities-draw.ts drawPlayer)

- **Silhouette:** chibi, 2 heads tall, carrying a square cake box overhead —
  the box extends the silhouette upward, reads instantly at mobile size, and
  motivates the crash animation (box launches). Logical sprite size **24×32**
  (including box); see `SPEC-RENDER › RND-01` for the pixel grid.
- **Colors** (from the base palette below): cream shirt `parchment`, rust-red
  scarf `rust-red` (signature accent and the player key color — see
  `SPEC-RENDER › RND-05`), brown hair `wood-brown`, outline `ink`, white cake
  box `warm-white` with a `gold` ribbon.
- **Animation states** (sprite-sheet rows; frame data contract in
  `SPEC-RENDER › RND-04`):

| state | frames | fps | loop | notes |
|---|---|---|---|---|
| `idle` | 2 | 4 | yes | ready-screen breathing |
| `run` | 4 | 10, sped up by the current zone's level (same `0.75 + level*0.25` curve as the fallback sin-bob) | yes | replaces the current sin-bob body |
| `switch` | 2 | 8 | no | body lean + scarf whip; fixed `GAME_CONFIG.playerSwitchDuration` hold (0.22s) approximating the lane-ease travel time; mirrored horizontally for the other direction |
| `crash` | 3 | 12 | no | tumble; the cake box becomes a particle |
| `victory` | 2 | 6 | yes | box held up, hop — shown on the clear overlay |

## Obstacle cast

Status: implemented — `market-crate`/`hay-cart` implemented (P2); `stray-cat`/
`chicken-flock`/`rolling-barrel` implemented (P5); `town-guard`/`fountain`/
`banner-arch` implemented (P10)

Design-level roster. `WLD-01`: every obstacle row here has a matching registry
row in `SPEC-ENTITIES › ENT-02` with the same id; neither table may gain an id
the other lacks (a `planned` stub row is enough).

| id | motif | lane behavior | zones | phase |
|---|---|---|---|---|
| `market-crate` | stacked wooden apple crates | static, 1 lane (successor of the current single obstacle) | all | **P2** |
| `hay-cart` | parked hay wagon | static, 2 adjacent lanes (themed reuse of the existing all-open-lanes spawn) | all | **P2** |
| `stray-cat` | napping orange cat | wakes with a 0.5 s crouch telegraph, then hops one lane sideways over 0.3 s toward a lane that isn't the row's safe lane (or stays put if none qualifies) | old-town, market-street | **P5** |
| `chicken-flock` | 3 chickens, staggered vertically behind one another | each bird independently drifts at 90 px/s toward the same lane-adjacent, non-safe target lane — a diagonal crossing rather than a literal full-road sweep | old-town, market-street | **P5** |
| `rolling-barrel` | runaway ale barrel | scrolls at 1.5× world speed down its lane (fast approach) | castle-road | **P5** |
| `town-guard` | guard on patrol | scrolls at 0.6× world speed (player slowly catches up — teaches relative speed) | market-street, castle-road | **P10** |
| `fountain` | round stone fountain | static, center lane only, taller than one row (forces early commitment) | market-street | **P10** |
| `banner-arch` | low festival banner spanning the street | full-row visual with one open lane — a themed skin of the safe-lane row, not new logic | castle-road | **P10** |

## Item cast

Status: implemented — `coin` implemented (P4); `gem` implemented (P5);
`sweet-roll`/`hourglass`/`magnet` implemented (P11)

Same pairing rule as obstacles (`WLD-01`). Effects and spawn rules are
normative in `SPEC-ENTITIES › ENT-03`.

| id | motif | effect (summary) | phase |
|---|---|---|---|
| `coin` | copper coin, 4-frame spin | +10 score | **P4** |
| `gem` | blue gem | +50 score, one guaranteed per zone (safe lane, `ENT-INV-3`) | **P5** |
| `sweet-roll` | glowing pastry | shield: absorbs one hit | **P11** |
| `hourglass` | blue hourglass | slow-time: world speed ×0.6 for 3 s | **P11** |
| `magnet` | horseshoe magnet (duskPurple body, gold tips — avoids the `RND-05` rust-red tolerance box) | nearby coins fly to Poco for 5 s | **P11** |

## Base palette

Status: implemented (src/config.ts GAME_CONFIG.colors)

`WLD-02` — **source of truth** for the Karamell palette. 12 colors, warm and
mobile-readable: entities stay warm/saturated, the road stays neutral so they
pop. The player scarf (`rust-red`) vs. base road (`cobble-mid`) contrast must
stay ≥ 4:1. Replaces the neon set in `GAME_CONFIG.colors`.

| name | role | hex |
|---|---|---|
| `ink` | outlines, darkest shadow | `#33272E` |
| `dusk-purple` | deep shadow, dusk road (castle-road) | `#5B4A68` |
| `cobble-mid` | base road | `#8D7B84` |
| `cobble-light` | curb stones, road highlights | `#B5A6A8` |
| `parchment` | skin, cream cloth | `#F4E3C1` |
| `warm-white` | highlights, cake box | `#FFF7E6` |
| `rust-red` | Poco's scarf (player key color), awnings, crash accents | `#D95763` |
| `terracotta` | roofs, apples on crates | `#C65B41` |
| `gold` | coins, lanterns, torches, ribbon | `#F2B63D` |
| `wood-brown` | crates, carts, signs, hair | `#8A5A3B` |
| `leaf-green` | plants, hedges | `#6DA34D` |
| `dusk-teal` | sky, gems, water, UI accent | `#3E6B73` |

Particle colors move to `gold` / `warm-white` / `terracotta` (dust) and
`gold` (sparks → cake crumbs and coins on crash).

## Art style rules

Status: implemented — `WLD-03`/`WLD-04` (P2), `WLD-05` (P5, src/render/landmarks.ts
drawCastleGate)

- `WLD-03` Pixel art on a 16 px background tile grid at the 180×320 logical
  resolution (`SPEC-RENDER › RND-01`); sprites use the sizes in
  `SPEC-ENTITIES › ENT-02`. No anti-aliasing, no gradients inside sprites,
  1 px `ink` outlines on characters and interactive objects.
- `WLD-04` Scenery (cobblestone road, hedge/stone curbs, house fronts, the
  castle gate goal, zone landmark props) is drawn by named background
  painters, not entities — see `SPEC-RENDER › RND-06`.
- `WLD-05` The goal line becomes the **castle gate**: a road-spanning gate
  (flanking stone towers, a flat-color torch-flame accent, the checkered
  drawbridge-deck threshold) drawn by `src/render/landmarks.ts` `drawCastleGate`. Poco's
  `victory` animation plays in front of it on clear.
- Typography: HUD/overlay text may keep the current sans-serif stack for now;
  an embedded pixel font is scheduled (`SPEC-ROADMAP › P12`). UI display text
  remains Japanese; spec and code text are English.

## Theme swap

Status: implemented (P7 entities, P8 background — `SPEC-ROADMAP`)

`WLD-06` — The Karamell world above is the **default theme**, not a hard
dependency. The entire visible world is re-skinnable by replacing the three
fixed-name PNGs under `public/assets/sheets/` (`poco.png`, `entities.png`,
`town.png`) per the exact layouts and authoring rules in `SPEC-RENDER ›
RND-08` — no code, config, or spec change per theme. Constraints that survive
any theme: the player key color rules (`SPEC-RENDER › RND-05` theming
addendum), silhouettes/footprints fixed by `SPEC-ENTITIES › ENT-02` sizes,
and the procedural fallback look (this spec's palette and cast), which
remains what players see when a sheet is absent (`RND-INV-1`). Fiction,
entity motifs, and zone names stay as authored here unless a future spec
change renames them — a theme changes pixels, not mechanics.
