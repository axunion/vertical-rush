---
id: SPEC-RENDER
title: Rendering (Pixel Pipeline, Sprites, Fallback)
status: implemented
code: [src/render.ts, src/sprites.ts, src/App.tsx]
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
  identical either way. *(implemented: `src/render.ts` `loadSpriteSheets`
  resolves each sheet to `null` on `onerror`, never throws; `drawEntity`/
  `drawPlayer` fall back to `drawFallback`'s primitive shapes whenever a sheet
  or animation is missing — verified by moving `public/assets/sheets/` away
  entirely)*

## Current pipeline (for reference)

Status: superseded by RND-01/RND-02 (P2) — kept for historical context only

The pre-P2 pipeline: canvas backing store = CSS size × `devicePixelRatio`;
all drawing used smooth vector primitives (gradients, `roundRect`,
shadow-blur glow pre-rendered once per resize, additive particles). Entity
geometry was computed from `view` (`roadPad`, `laneWidth`) at window size,
recomputed on every resize. None of this describes the current code.

## RND-01 — Logical resolution: 180×320

Status: implemented (src/entities.ts PLAYER_SIZE, src/App.tsx GAME_CONFIG.logical/view)

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

Status: implemented (src/render.ts computeDisplayFit/sizeDisplayCanvas/blitFrame)

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

Status: implemented (src/sprites.ts SPRITE_SHEETS, frameAt) — only the `poco`
sheet is authored so far, matching the roadmap's "at minimum" P3 scope; the
`entities`/`town` sheets below remain illustrative until an `EntityDef` or
background painter actually references them

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
`drawImage` for left, `src/render.ts` `drawPlayer`), row 3 `crash`(3), row 4
`victory`(2). The PNG itself reuses the fallback runner's palette and
proportions so the sprite and fallback read as the same character.

## RND-05 — Player key color (e2e harness coupling)

Status: implemented (src/App.tsx GAME_CONFIG.colors.rustRed, .claude/skills/verify/SKILL.md)

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

## RND-06 — Draw dispatcher and background painters

Status: implemented (src/render.ts drawEntity, drawPlayer)

- One entry point per entity: `drawEntity(ctx, instance, def, colors, sheets,
  timeSec)` (the actual signature keeps `colors` alongside `sheets`/`timeSec`
  since the fallback branch still needs the palette). If `def.sprite` is set
  and its sheet image loaded and the named animation exists → draw the
  current `frameAt` frame; else → the fallback drawer for `def.fallback`.
  Today every `ENTITY_DEFS` row has `sprite: null`, so this path is exercised
  by tests but not yet visible in play — it activates automatically once an
  obstacle/item def gains a `sprite` reference.
- The player is not an entity (no `EntityDef`/category, per `src/entities.ts`)
  so it has its own dispatcher, `drawPlayer(ctx, box, colors, animState,
  animTime, animStateTime, sheet, facing)`: draws the `poco` sheet's current
  frame for the given animation state, mirrored for `facing === -1`, else the
  `"runner"` fallback shape.
- Scenery is **not** entities: cobblestone road, curb tiles, lane markers, the
  castle-gate goal, zone landmark props, and particles remain named painter
  functions in `src/render.ts` (`SPEC-WORLD › WLD-04`). Forcing scenery into
  the registry is over-abstraction; it has no collision or spawn semantics.

## RND-07 — Fallback shapes

Status: implemented (src/entities.ts FallbackShape, src/render.ts drawFallback) — the `FallbackShape` union has 8 members (`runner`/`crate`/`cart`/`coin`/`gem`/`cat`/`chicken`/`barrel`); `coin` landed in P4 (src/render.ts drawCoinShape), `gem`/`cat`/`chicken`/`barrel` landed in P5 (src/render.ts drawGemShape/drawCatShape/drawChickenShape/drawBarrelShape)

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
  | "barrel";
```

A small closed set of parameterized pixel-style primitive drawers (chunky
rects on the logical grid, palette colors, 1 px ink outline — no gradients, no
glow). Each takes the instance Box and draws inside it exactly. New entities
reuse an existing shape unless they genuinely need a new silhouette; adding a
shape is a code change and should stay rare. Mapping per entity:
`SPEC-ENTITIES › ENT-02` (`runner` = poco, `crate` = crates/static props,
`cart` = wide 2-lane objects, `coin`/`gem` = round/faceted items, `cat` =
stray-cat, `chicken` = chicken-flock birds, `barrel` = rolling-barrel). P4
added `"coin"` when the `coin` item landed; P5 added `"gem"` and the three
mover silhouettes, per `ENT-05`'s extension contract.

## Asset layout

Status: partial — `poco.png` implemented; `entities.png`/`town.png` remain
planned (unscheduled — no `EntityDef` or background painter references a
sheet yet)

```
public/assets/sheets/poco.png       # player animations (RND-04 layout) — implemented
public/assets/sheets/entities.png   # obstacles + items, one sheet — planned
public/assets/sheets/town.png       # background tiles: cobbles, curbs, gate, props — planned
```

- Manifests (`SPRITE_SHEETS`) live in `src/sprites.ts` and are bundled; only
  PNGs live under `public/`.
- Loading: `src/render.ts` `loadSpriteSheets` builds a per-sheet promise
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
  manifest below (`SPRITE_SHEETS`, actual PNGs, a fresh per-sheet loader) is
  still P3 scope.
