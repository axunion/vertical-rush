---
paths:
  - "src/**"
---

# Implementation Invariants

`spec/01-overview.md` (Global invariants, Environment constraints) is authoritative;
this rule is its enforcement summary for implementation work.

## Global invariants — must hold in every commit

- `CORE-INV-1` All collision decisions go through `checkCollision` in
  `src/gameLogic.ts`. Never reimplement hit detection elsewhere.
- `CORE-INV-2` Pure modules (`src/gameLogic.ts`; later `src/entities.ts`,
  `src/sprites.ts`) never import `window`, `document`, Canvas, or SolidJS —
  Vitest runs in the node environment.
- `CORE-INV-3` Distance is the sole clear condition. Items and score never
  gate progress.
- `ENT-INV-1` Every spawned row leaves at least one passable lane.
- `ENT-INV-2` Moving obstacles never enter the current safe lane while within
  1.5 player heights of the player row (binds from P5, when movers exist).
- `ENT-INV-3` Items are always optional to collect; they never block the course.
- `RND-INV-1` The game is fully playable and visually coherent with zero PNG
  assets present.
- `OVR-INV-1` No magic numbers at use sites: view/feel values in `GAME_CONFIG`,
  entity data in `entities.ts`, difficulty values in `gameLogic.ts`.

## Spec sync

Any change to gameplay rules, entity data, the rendering pipeline, or difficulty
values updates the matching spec section — including its `Status:` line — in the
same commit. Source-of-truth tables (`WLD-02` palette, `CORE-03` ZONE_TABLE,
`ENT-02` entity registry, `RND-01` pixel grid) must match code values exactly.

## Phase discipline

Do not implement scope marked `planned (Pn)` for a later phase in
`spec/07-roadmap.md`.

## E2E harness coupling

- Spawn randomness stays routed through an injectable rng — the verify skill
  stubs `Math.random` for deterministic scenarios.
- Any palette or player-look change updates the scan color constant in
  `.claude/skills/verify/SKILL.md` in the same change (`RND-05`).

## Compiler constraints

No enums or namespaces (`erasableSyntaxOnly`); type-only imports must use
`import type` (`verbatimModuleSyntax`).
