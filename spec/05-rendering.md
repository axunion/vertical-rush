---
id: SPEC-RENDER
title: Rendering (Pixel Pipeline, Sprites, Fallback)
status: implemented
code: [src/render/, src/sprites.ts, src/config.ts, src/gameController.ts, src/App.tsx]
---

# Rendering

From the current DPR-scaled smooth-vector canvas to a pixel-art pipeline with
sprite sheets, while staying fully playable with zero image assets.

## Invariants

Status: implemented — see the marker on the invariant

- `RND-INV-1` The game is **fully playable and visually coherent with zero PNG
  files present**. Asset load failure must be per-sheet and silent (an
  `Image` `onerror`/`onload` resolving to `null` on failure, never thrown);
  tests and CI never require binary assets; a fallback drawing renders the
  **same logical footprint (Box)** as its sprite so collision feel is
  identical either way. *(implemented: `src/render/sheets.ts`
  `loadSpriteSheets` resolves each sheet to `null` on `onerror`, never throws;
  `src/render/entities-draw.ts` `drawEntity`/`drawPlayer` fall back to
  `src/render/shapes.ts` `drawFallback`'s primitive shapes whenever a sheet
  or animation is missing — verified by moving `public/assets/sheets/` away
  entirely)*

## RND-01 — Logical resolution: 180×320

Status: implemented (src/entities.ts PLAYER_SIZE, src/config.ts GAME_CONFIG.logical, src/App.tsx view)

**Source of truth** for the pixel grid:

| value | px | derivation |
|---|---|---|
| logical canvas | 180 × 320 | exactly 9:16, fixed by `GAME_CONFIG.logical` (no longer window-derived) |
| road padding | 12 per side | fixed by `GAME_CONFIG.logical.roadPad` (was `roadPaddingRatio 0.07`, 180 × 0.07 ≈ 12.6 → 12) |
| playfield | 156 | 180 − 2×12 |
| lane width | 52 | 156 / 3 |
| background tile | 16 × 16 | cobbles, curbs, props (`SPEC-WORLD › WLD-03`) |
| player sprite | 24 × 32 | `poco`, incl. cake box |
| player screen y | fixed row at 320 × 0.78 ≈ 250 | keeps `playerYRatio` feel |

Entity sizes: `SPEC-ENTITIES › ENT-02`. All sim coordinates become logical
pixels — entity boxes stop depending on window size entirely, which also
removes today's resize-time geometry recomputation. `pxPerUnit` becomes
`320 × speedRatio` (`SPEC-CORE › units`).

## RND-02 — Scaling contract

Status: implemented (src/render/display.ts computeDisplayFit/sizeDisplayCanvas/blitFrame)

1. Every frame renders to an **offscreen canvas fixed at 180×320**.
2. The display canvas keeps backing store = CSS size × DPR (as today). Blit
   with `drawImage(offscreen, dx, dy, 180 * k, 320 * k)` where
   `k = max(1, floor(min(deviceW / 180, deviceH / 320)))` computed in device
   pixels; center the result and letterbox the remainder with a theme border
   color (`ink` from `SPEC-WORLD › WLD-02`).
3. `RND-03` `imageSmoothingEnabled = false` on **both** contexts, re-applied
   after every canvas resize — resizing a canvas resets its context state
   (gotcha; the current code already re-derives gradients on resize for the
   same reason).
4. Sim keeps float coordinates for smooth easing; sprite/tile draws round to
   integer logical coordinates at draw time only.

## RND-04 — Sprite-sheet manifest

Status: implemented (src/sprites.ts SPRITE_SHEETS, frameAt) — the `poco` and
`entities` sheets are both defined and authored; the `town` tile sheet's own
manifest type and regions are `RND-09` (`src/sprites.ts` `TILE_SHEETS`)

Canonical (target: `src/sprites.ts`):

```ts
export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AnimationDef {
  frames: FrameRect[]; // explicit rects: unambiguous without seeing the PNG
  fps: number;
  loop: boolean;
}

export interface SpriteSheetDef {
  id: string; // e.g. "poco"
  src: string; // e.g. "/assets/sheets/poco.png"
  animations: Record<string, AnimationDef>;
}

export const SPRITE_SHEETS: Record<string, SpriteSheetDef> = {
  /* one entry per sheet */
};

/** Pure frame picker: loops or clamps per the animation def. Unit-tested. */
export function frameAt(anim: AnimationDef, timeSec: number): FrameRect {
  /* floor(timeSec * fps), modulo length when loop, clamped to last frame otherwise */
  return anim.frames[0];
}
```

Explicit frame rects are chosen over grid-index shorthand deliberately: an AI
implementer cannot look inside a PNG, and the shape is a strict subset of
Aseprite's JSON `frames` export, so a converter is mechanical if authoring
tools enter the picture later.

`poco.png` layout (24×32 frames on a 96×160 sheet, one animation per row,
states from `SPEC-WORLD`) — implemented exactly as authored: row 0 `idle`(2),
row 1 `run`(4), row 2 `switch`(2, facing right — mirrored via a negative-scale
`drawImage` for left, `src/render/entities-draw.ts` `drawPlayer`), row 3 `crash`(3), row 4
`victory`(2). The PNG itself reuses the fallback runner's palette and
proportions so the sprite and fallback read as the same character.

## RND-05 — Player key color (e2e harness coupling)

Status: implemented (src/config.ts GAME_CONFIG.colors.rustRed, .claude/skills/verify/SKILL.md)

The verify skill (`.claude/skills/verify/SKILL.md`) locates the player by
scanning a canvas pixel row for the player body color — today `#ff7a29` with
±40 tolerance at row `height × 0.78`. This coupling survives the redesign as a
named contract:

- The **player key color** is `rust-red #D95763` (Poco's scarf,
  `SPEC-WORLD › WLD-02`). It must appear in the player's scan row in both the
  sprite and fallback renderings, and no scenery drawn at that row (road,
  curbs, lane lines) may use a color within the scan tolerance of it.
- Any phase that changes the palette or the player look must update the verify
  skill's color constant **in the same change** (`SPEC-ROADMAP › P2`).

Theming addendum (binds every authored/replacement asset per `RND-08`;
implemented P7/P8):

- The key color stays **fixed across themes** — that is what keeps drop-in
  swap zero-config. Every frame of a replacement `poco.png`'s `idle`, `run`,
  and `switch` animations must contain at least 2 pixels of exactly `#D95763`
  within sprite rows 14–18 (counted from the frame's top edge — the band the
  verify scan row crosses); the scarf is the natural place. `crash`/`victory`
  frames are exempt (the scan never runs in those phases).
- No art in `entities.png`, or in `town.png`'s road/curb/landmark regions,
  may use a color inside the ±40/channel tolerance box around `#D95763`:
  R ∈ [177, 255], G ∈ [47, 127], B ∈ [59, 139].
- A theme that genuinely must change the key color updates the verify skill's
  color constant in the same change (the existing rule above) — by definition
  it is then no longer a pure drop-in.
- Known pre-existing ambiguity: the base palette's `terracotta #C65B41`
  (fallback cat body, chicken beaks) already sits inside that tolerance box.
  Authored themes following the rule above are strictly cleaner than the
  procedural fallback; tightening the fallback palette is optional later
  work, tracked in `SPEC-ROADMAP › Backlog`.

## RND-06 — Draw dispatcher and background painters

Status: implemented (src/render/entities-draw.ts drawEntity, drawPlayer)

- One entry point per entity: `drawEntity(ctx, instance, def, colors, sheets,
  timeSec)` (the actual signature keeps `colors` alongside `sheets`/`timeSec`
  since the fallback branch still needs the palette). If `def.sprite` is set
  and its sheet image loaded and the named animation exists → draw the
  current `frameAt` frame; else → the fallback drawer for `def.fallback`.
  Every `ENTITY_DEFS` row is bound to the `entities` sheet (P7,
  `SPEC-ENTITIES › ENT-06`), so the sprite path is live whenever the sheet
  is present; the fallback branch stays exercised whenever a sheet is
  absent (`RND-INV-1`).
- The player is not an entity (no `EntityDef`/category, per `src/entities.ts`)
  so it has its own dispatcher, `drawPlayer(ctx, box, colors, animState,
  animTime, animStateTime, sheet, facing)`: draws the `poco` sheet's current
  frame for the given animation state, mirrored for `facing === -1`, else the
  `"runner"` fallback shape.
- Scenery is **not** entities: cobblestone road, curb tiles, lane markers, the
  castle-gate goal, zone landmark props, and particles remain named painter
  functions in `src/render/` (`road.ts`/`landmarks.ts`/`particles.ts`,
  `SPEC-WORLD › WLD-04`). Forcing scenery into the registry is
  over-abstraction; it has no collision or spawn semantics.

## RND-07 — Fallback shapes

Status: implemented (src/entities.ts FallbackShape, src/render/shapes.ts drawFallback) — the `FallbackShape` union has 11 members (`runner`/`crate`/`cart`/`coin`/`gem`/`cat`/`chicken`/`barrel`/`guard`/`fountain`/`banner`); `coin` landed in P4 (src/render/shapes.ts drawCoinShape), `gem`/`cat`/`chicken`/`barrel` landed in P5 (src/render/shapes.ts drawGemShape/drawCatShape/drawChickenShape/drawBarrelShape), `guard`/`fountain`/`banner` landed in P10 (src/render/shapes.ts drawGuardShape/drawFountainShape/drawBannerShape)

Canonical (target: `src/entities.ts`):

```ts
export type FallbackShape =
  | "runner"
  | "crate"
  | "cart"
  | "coin"
  | "gem"
  | "cat"
  | "chicken"
  | "barrel"
  | "guard"
  | "fountain"
  | "banner";
```

A small closed set of parameterized pixel-style primitive drawers (chunky
rects on the logical grid, palette colors, 1 px ink outline — no gradients, no
glow). Each takes the instance Box and draws inside it exactly. New entities
reuse an existing shape unless they genuinely need a new silhouette; adding a
shape is a code change and should stay rare. Mapping per entity:
`SPEC-ENTITIES › ENT-02` (`runner` = poco, `crate` = crates/static props,
`cart` = wide 2-lane objects, `coin`/`gem` = round/faceted items, `cat` =
stray-cat, `chicken` = chicken-flock birds, `barrel` = rolling-barrel, `guard`
= town-guard, `fountain` = fountain, `banner` = banner-arch). P4 added
`"coin"` when the `coin` item landed; P5 added `"gem"` and the three mover
silhouettes, per `ENT-05`'s extension contract. P10 added `"guard"`/
`"fountain"`/`"banner"` for the same reason — each obstacle's silhouette
(a patrolling guard, a round fountain, a hanging banner) has no honest reuse
among the existing eight. P11 may extend this union further (the three
effect items) or reuse existing shapes — decided in that phase; the union in
code and this block change in the same commit.

## RND-08 — Fixed asset contract (drop-in theming)

Status: implemented — `poco.png` (P3), `entities.png` (P7, src/sprites.ts
SPRITE_SHEETS.entities, src/entities.ts ENTITY_DEFS; grew from 80×144 to
80×232 in P10 to append the `town-guard`/`fountain`/`banner-arch` bands), and
`town.png` (P8, src/sprites.ts TILE_SHEETS.town, src/render/road.ts
drawRoad/drawCurbs, src/render/landmarks.ts
drawCastleGate/drawZoneLandmark) are all authored under
`public/assets/sheets/` and loaded; `RND-INV-1`'s fallback path is exercised
identically whenever any one of the three is absent

A **theme is exactly three PNGs** with fixed filenames and fixed layouts under
`public/assets/sheets/`. Replacing them (all or some) re-themes the game;
there is no theme manifest, config file, or code change. The in-code manifests
(`SPRITE_SHEETS`, `TILE_SHEETS`) describe these layouts and never change per
theme (`SPEC-WORLD › WLD-06`).

```
public/assets/sheets/poco.png       # player animations — implemented (P3)
public/assets/sheets/entities.png   # obstacles + items — implemented (P7)
public/assets/sheets/town.png       # road, curbs, gate, landmarks — implemented (P8)
```

Fallback granularity is **per file** (`RND-INV-1`): a missing/unloadable PNG
means everything it covers renders procedurally; a present PNG means all of
its regions are treated as authored (a transparent region draws nothing).

### `poco.png` — player (implemented, layout unchanged)

**96 × 160**, 24×32 frame cells, one animation per row, frames left-to-right
(full frame data in `RND-04`; animation timings in `SPEC-WORLD ›
Protagonist`):

| row | y | animation | frames |
|---|---|---|---|
| 0 | 0 | `idle` | 2 |
| 1 | 32 | `run` | 4 |
| 2 | 64 | `switch` (author facing **right**; mirrored in code for left) | 2 |
| 3 | 96 | `crash` | 3 |
| 4 | 128 | `victory` | 2 |

### `entities.png` — obstacles + items (implemented, P7; extended P10)

**80 × 232** (P10 grew the sheet's height from 144 to 232 to append three
bands; its width, 80, was already wide enough for every new band). One
entity per horizontal band; frames at the entity's native
logical size (frame w×h **equals** `EntityDef.size` — `SPEC-ENTITIES ›
ENT-06` — so `drawImage` never scales), laid out left-to-right from x = 0;
band y-offsets are multiples of 8; unused band remainder is fully
transparent. **Source of truth** for the sheet layout:

| entity id | band y | frame w×h | frames | frame x offsets | fps | loop | content |
|---|---|---|---|---|---|---|---|
| `hay-cart` | 0 | 80×32 | 1 | 0 | — | yes | static parked wagon (fills the full frame — it is the hitbox) |
| `market-crate` | 32 | 38×24 | 1 | 0 | — | yes | static crate stack |
| `rolling-barrel` | 56 | 20×20 | 4 | 0, 20, 40, 60 | 12 | yes | 90°-step roll |
| `stray-cat` | 80 | 16×12 | 2 | 0, 16 | 4 | yes | nap ↔ ear-twitch (doubles as the dart telegraph) |
| `chicken-flock` | 96 | 12×12 | 2 | 0, 12 | 8 | yes | walk waddle — one bird; the game draws 3 staggered |
| `coin` | 112 | 12×12 | 4 | 0, 12, 24, 36 | 8 | yes | spin |
| `gem` | 128 | 12×12 | 2 | 0, 12 | 4 | yes | sparkle blink |
| `town-guard` | 144 | 16×24 | 1 | 0 | — | yes | patrolling guard (the `roller` behavior scrolls it independently; no lateral motion) |
| `fountain` | 168 | 40×40 | 2 | 0, 40 | 4 | yes | water shimmer blink |
| `banner-arch` | 208 | 38×24 | 1 | 0 | — | yes | festival banner segment (one per blocked lane; adjacent segments read as one arch) |

- One looping animation per entity, **named by its entity id**, driven by the
  global animation clock `drawEntity` already receives — all instances of an
  entity animate in sync (classic pixel-runner look). No per-instance state
  animations (e.g. separate cat telegraph/hop rows): `drawEntity` has no
  per-instance behavior state, and adding it is not justified.
- `stray-cat` and `chicken-flock` are authored facing right; no mirroring is
  applied to entities.
- P10 appended `town-guard`/`fountain`/`banner-arch` below y = 144 (table
  above). `banner-arch` is authored as its 38×24 hitbox size rather than one
  continuous 156-wide visual: reusing the generic per-instance sprite
  dispatch (`RND-06`) needs no new rendering machinery, and two adjacent
  38×24 segments still read as one banner when a row blocks two lanes. The
  sheet grew in height only (144 → 232); its width (80) already fit every
  new band.
- P11 will append `sweet-roll` 14×14, `hourglass` 12×16, `magnet` 14×12
  below y = 232; widening and appending stay additive-safe because frames
  are addressed by explicit rects and existing band offsets never move.
  Exact band y-offsets and frame counts are added to this table in that
  phase.

### `town.png` — background tiles, gate, landmarks (implemented, P8)

**192 × 128.** Region-based (no animation). Zone ids match `SPEC-CORE ›
CORE-03`. **Source of truth** for the sheet layout:

| region key | x, y | w×h | drawn how |
|---|---|---|---|
| `road-old-town` | 0, 0 | 32×32 | repeating pattern filling the 156-wide playfield; vertical scroll period 32 (matches today's procedural pattern) |
| `road-market-street` | 32, 0 | 32×32 | 〃 |
| `road-castle-road` | 64, 0 | 32×32 | 〃 |
| `curb-old-town` | 96, 0 | 12×32 | repeating pattern filling both 12-wide curb strips (x 0–11 and 168–179); identical art both sides |
| `curb-market-street` | 112, 0 | 12×32 | 〃 |
| `curb-castle-road` | 128, 0 | 12×32 | 〃 |
| `castle-gate` | 0, 32 | 180×48 | single `drawImage`; the drawbridge threshold line sits exactly 32 px from the region top (towers above, 16 px deck below) |
| `town-gate-arch` | 0, 80 | 180×24 | single `drawImage` at the zone-1 exit landmark position |
| `market-banner` | 0, 104 | 180×24 | single `drawImage` at the zone-2 exit landmark position |

- Everything outside the listed regions is transparent.
- Per-zone road/curb variants replace the palette crossfade for image themes:
  during the zone-transition fade window the painters blend the from/to zone
  patterns (`RND-09`). The area outside the curbs keeps the procedural
  `duskPurple` fill (still palette-crossfaded).
- Gate/landmark regions are 180 wide (full canvas) so art may bleed over the
  curbs, as the procedural towers/pillars do today.
- **Not themeable** (stays procedural): lane lines, speed lines, particles —
  palette-driven fx, not theme art.

### Authoring rules (all three files)

1. **Format:** PNG with alpha (indexed PNG-8 or RGBA). Rendered with
   smoothing off at 1:1 logical scale — author at the exact pixel dimensions
   above; the code never scales frames.
2. **Alpha is 1-bit in effect:** every pixel fully opaque or fully
   transparent. No semi-transparent pixels (they anti-alias edges, breaking
   `SPEC-WORLD › WLD-03`).
3. **Road and curb regions must be fully opaque** — they are pattern fills;
   holes would show the sky fill through the road.
4. **Outlines are baked into the art:** 1 px dark outline on characters and
   interactive objects (`WLD-03`); the outline color is the theme's own
   darkest "ink".
5. **Palette is otherwise free per theme**, except the player key color rules
   in `RND-05`'s theming addendum (fixed `#D95763` scarf pixels in poco's
   scan band; the tolerance-box exclusion for entities/town regions).

### Loading

- Manifests (`SPRITE_SHEETS`, `TILE_SHEETS`) live in `src/sprites.ts` and are
  bundled; only PNGs live under `public/`.
- Loading: `src/render/sheets.ts` `loadSpriteSheets` builds a per-sheet promise
  resolving to `null` on error (`Image` `onload`/`onerror`); remember Vite
  serves 200 text/html for missing `/assets/*` (SPA fallback), so failure
  detection must come from the `Image` element, never HTTP status.
- The legacy `GAME_CONFIG.assets` two-key object (`player.png`,
  `obstacle.png`) and its `loadImage`/`loadImages` helpers were removed in
  P2, ahead of this section's own scope: the new `drawEntity`/`drawFallback`
  dispatcher (`RND-06`) has no slot for the old bespoke
  `drawObstacles`/`drawPlayer` pair, so both the two-key config and its
  loader became orphaned as soon as that pair was deleted. Neither PNG ever
  existed under `public/`, so behavior is unaffected. The real sprite-sheet
  manifest (`SPRITE_SHEETS`, actual PNGs, a fresh per-sheet loader) landed in
  P3.

## RND-09 — Tile-region manifest & background image painters

Status: implemented (P8, src/sprites.ts TILE_SHEETS, src/render/road.ts
drawRoad/drawCurbs, src/render/landmarks.ts drawCastleGate/drawZoneLandmark)

`town.png` is region-based, not animated, so it gets its own minimal manifest
type instead of overloading `SpriteSheetDef` with animation semantics.

Canonical (target: `src/sprites.ts`):

```ts
export interface TileSheetDef {
  id: string; // "town"
  src: string; // "/assets/sheets/town.png"
  regions: Record<string, FrameRect>; // keys per RND-08's town.png table
}

export const TILE_SHEETS: Record<string, TileSheetDef> = {
  /* one entry: town */
};
```

- `src/render/sheets.ts` `loadSpriteSheets` loosens its input type to
  `Record<string, { src: string }>` (it only reads `src`), so the shell loads
  `{ ...SPRITE_SHEETS, ...TILE_SHEETS }` into the one existing sheet-image
  map — ids (`poco`/`entities`/`town`) are disjoint.
- Road/curb regions are cropped once into a cached `CanvasPattern` (keyed
  `sheetId|regionKey`, the existing pattern-cache idiom) and pattern-fill
  their strips with the existing scroll offset.
- **Zone crossfade with tiles:** during the zone-transition fade window the
  painters fill with the previous zone's pattern, then the new zone's pattern
  at `globalAlpha = t` (two-pass blend of the same fade state `frameColors`
  already tracks). Steady state is a single fill of the current zone's
  pattern.
- Gate and landmark regions draw with a single `drawImage` each; the gate is
  anchored so its threshold line (region top + 32) sits at the goal y the
  procedural `drawCastleGate` uses today.
- Every painter keeps its procedural branch: `town.png` missing →
  `drawRoad`/`drawCurbs`/`drawCastleGate`/`drawZoneLandmark` render exactly
  as today (`RND-INV-1`).
