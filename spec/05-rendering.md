---
id: SPEC-RENDER
title: Rendering (Pixel Pipeline, Sprites, Fallback)
status: planned
code: [src/render.ts, src/sprites.ts, src/App.tsx]
---

# Rendering

From the current DPR-scaled smooth-vector canvas to a pixel-art pipeline with
sprite sheets, while staying fully playable with zero image assets.

## Invariants

Status: implemented — see the marker on the invariant

- `RND-INV-1` The game is **fully playable and visually coherent with zero PNG
  files present**. Asset load failure is per-sheet and silent (the existing
  `loadImage` resolve-to-`null` pattern in `src/App.tsx`); tests and CI never
  require binary assets; a fallback drawing renders the **same logical
  footprint (Box)** as its sprite so collision feel is identical either way.
  *(implemented today in the degenerate sense — primitives are the only path)*

## Current pipeline (for reference)

Status: implemented (src/App.tsx resize, render)

Canvas backing store = CSS size × `devicePixelRatio`; all drawing uses smooth
vector primitives (gradients, `roundRect`, shadow-blur glow pre-rendered once
per resize, additive particles). Entity geometry is computed from `view`
(`roadPad`, `laneWidth`) at window size. Everything in this section is
replaced by RND-01/RND-02 in P2.

## RND-01 — Logical resolution: 180×320

Status: planned (P2)

**Source of truth** for the pixel grid:

| value | px | derivation |
|---|---|---|
| logical canvas | 180 × 320 | exactly 9:16, matches `GAME_CONFIG.viewAspect` |
| road padding | 12 per side | replaces `roadPaddingRatio 0.07` (180 × 0.07 ≈ 12.6 → 12) |
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

Status: planned (P2)

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

Status: planned (P3)

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

Illustrative `poco.png` layout (24×32 frames on a 96×160 sheet, one animation
per row, states from `SPEC-WORLD`): row 0 `idle`(2), row 1 `run`(4),
row 2 `switch`(2, facing right — mirror via negative-scale draw for left),
row 3 `crash`(3), row 4 `victory`(2).

## RND-05 — Player key color (e2e harness coupling)

Status: planned (P2) — the constraint it replaces is implemented

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

Status: planned (P2 dispatcher with fallback shapes; P3 sprite path)

- One entry point per entity: `drawEntity(ctx, instance, def, sheets, timeSec)`.
  If `def.sprite` is set and its sheet image loaded → draw the current
  `frameAt` frame; else → the fallback drawer for `def.fallback`. This
  replaces the bespoke `drawObstacles` / `drawPlayer` pair.
- Scenery is **not** entities: cobblestone road, curb tiles, lane markers, the
  castle-gate goal, zone landmark props, and particles remain named painter
  functions in `src/render.ts` (`SPEC-WORLD › WLD-04`). Forcing scenery into
  the registry is over-abstraction; it has no collision or spawn semantics.

## RND-07 — Fallback shapes

Status: planned (P2)

Canonical (target: `src/render.ts` or `src/entities.ts` for the type):

```ts
export type FallbackShape = "runner" | "crate" | "cart" | "coin";
```

A small closed set of parameterized pixel-style primitive drawers (chunky
rects on the logical grid, palette colors, 1 px ink outline — no gradients, no
glow). Each takes the instance Box and draws inside it exactly. New entities
reuse an existing shape unless they genuinely need a new silhouette; adding a
shape is a code change and should stay rare. Mapping per entity:
`SPEC-ENTITIES › ENT-02` (`runner` = poco, `crate` = crates/barrels/static
props, `cart` = wide 2-lane objects, `coin` = round items).

## Asset layout

Status: planned (P3)

```
public/assets/sheets/poco.png       # player animations (RND-04 layout)
public/assets/sheets/entities.png   # obstacles + items, one sheet
public/assets/sheets/town.png       # background tiles: cobbles, curbs, gate, props
```

- Manifests (`SPRITE_SHEETS`) live in `src/sprites.ts` and are bundled; only
  PNGs live under `public/`.
- Loading: `loadImage`-style per-sheet promise resolving to `null` on error;
  remember Vite serves 200 text/html for missing `/assets/*` (SPA fallback),
  so failure detection must come from the `Image` element, never HTTP status.
- The legacy `GAME_CONFIG.assets` two-key object (`player.png`,
  `obstacle.png`) is retired when the manifest lands (P3).
