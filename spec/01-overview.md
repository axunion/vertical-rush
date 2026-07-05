---
id: SPEC-OVERVIEW
title: Game Overview & Global Invariants
status: partial
code: [src/App.tsx, src/gameLogic.ts]
---

# Game Overview

## Pitch

Status: partial — mechanics implemented, theme planned (P2)

vertical-rush is a mobile-first, one-session (60–90 s) vertical lane runner:
tap the left or right half of the screen to switch between 3 lanes, dodge
obstacles scrolling toward you, and reach the goal 500 m ahead. One hit ends
the run.

The **current** build renders a neon night-highway look with canvas primitives.
The **target** direction is a pixel-art (dot-anime) fantasy town: the player
sprints through the town of Karamell at golden hour, from the old town through
the market street up to the castle gate. See `SPEC-WORLD` for the full concept.

The redesign keeps the proven core loop untouched (lanes, one-hit runs, 500 m
goal) and changes theme, art pipeline, and content structure. Entities become
data-driven so new characters, obstacles, and items can be added by editing
data tables, not core code (`SPEC-ENTITIES`).

## Glossary

Status: implemented (terms in current code) / planned where marked

| Term | Meaning |
|---|---|
| lane | One of 3 vertical tracks (`0` left, `1` center, `2` right) |
| distance | Meters progressed, the run's sole progress metric; clear at `TARGET_DISTANCE` (500) |
| speed | Distance units (m) per second, set by the current zone/level |
| safe lane | The lane guaranteed free of obstacles in each spawned row (`sim.safeLane`) |
| row | One spawn event: obstacles placed at the same y, leaving the safe lane open |
| phase | UI/sim state machine: `ready → running → cleared \| gameover` |
| sim | Plain mutable per-frame state object in `src/App.tsx` (not Solid signals) |
| view | Plain object holding derived canvas geometry (`w`, `h`, `roadPad`, `laneWidth`) |
| zone *(planned)* | Named themed segment of the run (old-town / market-street / castle-road); 1:1 with today's levels — see `SPEC-CORE` |
| entity *(planned)* | Any spawnable object (obstacle or item) defined by an `EntityDef` registry row |
| logical pixel *(planned)* | Coordinate unit of the 180×320 offscreen canvas — see `SPEC-RENDER › RND-01` |
| fallback drawing *(planned; exists today as the only path)* | Canvas-primitive rendering used when a sprite sheet PNG is absent |

## Global invariants

Status: implemented for INV rows marked so; planned rows bind future phases

These rules hold in every phase and every commit. Each invariant is owned and
detailed by the referenced spec.

| ID | Invariant | Owner |
|---|---|---|
| `CORE-INV-1` | All collision decisions go through `checkCollision` in `src/gameLogic.ts`. Never reimplement hit detection elsewhere. *(implemented)* | `SPEC-CORE` |
| `CORE-INV-2` | Pure modules (`src/gameLogic.ts`; later `src/entities.ts`, `src/sprites.ts`) never import UI dependencies (`window`, `document`, Canvas, SolidJS) and stay unit-testable in the node environment. *(implemented for gameLogic)* | `SPEC-CORE` |
| `CORE-INV-3` | Distance is the sole clear condition. Items and score never gate progress. *(implemented trivially — no items yet)* | `SPEC-CORE` |
| `ENT-INV-1` | Every spawned row leaves at least one passable lane. *(implemented via the safe-lane random walk)* | `SPEC-ENTITIES` |
| `ENT-INV-2` | Moving obstacles never enter the current safe lane while within 1.5 player heights of the player row. *(planned — binds when movers exist)* | `SPEC-ENTITIES` |
| `RND-INV-1` | The game is fully playable and visually coherent with zero PNG assets present; asset load failure is silent and per-sheet. *(implemented — primitives are currently the only path)* | `SPEC-RENDER` |
| `OVR-INV-1` | No magic numbers at use sites: every tunable lives in a named config/table in the module that owns it (view/feel in `GAME_CONFIG`, entity data in `entities.ts`, difficulty in `gameLogic.ts`). *(implemented for the current single-file layout)* | this spec |

## Environment constraints

Status: implemented (toolchain facts)

Restated here because they shape every canonical code block in these specs:

- `tsconfig.app.json` sets `erasableSyntaxOnly` — **no enums or namespaces**;
  use string-literal unions and plain `const` objects. It also sets
  `verbatimModuleSyntax` — type-only imports must use `import type`.
- Vitest runs with `environment: "node"` (set in `vite.config.ts`); pure
  modules must not touch the DOM even transitively.
- The e2e harness (`.claude/skills/verify/SKILL.md`) stubs `Math.random` for
  deterministic scenarios and locates the player by **scanning canvas pixels
  for the player body color**. Randomness in spawn logic must stay routed
  through an injectable rng, and palette changes must update the verify skill
  in the same phase (`SPEC-RENDER › RND-05`, `SPEC-ROADMAP` P2).
- Missing `/assets/*.png` requests return 200 text/html (Vite SPA fallback),
  not 404 — asset loading must key off `Image` `onerror`/decode failure, never
  HTTP status (implemented in `src/App.tsx` `loadImage`).
