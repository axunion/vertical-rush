---
paths:
  - "src/**"
---

# Implementation Invariants

This rule file is the authoritative home of these invariants.

## Global invariants — must hold in every commit

- `CORE-INV-1` All collision decisions go through `checkCollision` in
  `src/gameLogic.ts`. Never reimplement hit detection elsewhere.
- `CORE-INV-2` Pure modules (`src/gameLogic.ts`, `src/entities.ts`,
  `src/sprites.ts`) never import `window`, `document`, Canvas, or SolidJS —
  Vitest runs in the node environment.
- `CORE-INV-3` Distance is the sole clear condition. Items and score never
  gate progress.
- `ENT-INV-1` Every spawned row leaves at least one passable lane.
- `ENT-INV-2` Moving obstacles never enter the current safe lane while within
  1.5 player heights of the player row.
- `ENT-INV-3` Items are always optional to collect; they never block the course.
- `RND-INV-1` The game is fully playable and visually coherent with zero PNG
  assets present.
- `OVR-INV-1` No magic numbers at use sites: view/feel values in `GAME_CONFIG`,
  entity data in `entities.ts`, difficulty values in `gameLogic.ts`.

## E2E harness coupling

- Spawn randomness stays routed through an injectable rng — the verify skill
  stubs `Math.random` for deterministic scenarios.
- Any palette or player-look change updates the scan color constant in
  `.claude/skills/verify/SKILL.md` in the same change (player key color
  `#D95763`, `GAME_CONFIG.colors.rustRed`).

## Compiler constraints

No enums or namespaces (`erasableSyntaxOnly`); type-only imports must use
`import type` (`verbatimModuleSyntax`).
