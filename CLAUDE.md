# Global Claude Rules

Behavioral defaults plus house conventions. Bias toward caution over speed; on trivial
tasks, use judgment.

## Approach

- **Think before coding.** State assumptions; if uncertain, ask. When multiple
  interpretations exist, surface them rather than silently picking one. If a simpler path
  exists, say so and push back when warranted.
- **Simplest thing that works.** Write the minimum code that solves the stated problem —
  nothing speculative. No unasked-for abstractions, flexibility, or error handling for
  impossible cases. If 200 lines could be 50, rewrite it.
- **Surgical changes.** Every changed line should trace to the request. Don't refactor,
  reformat, or "improve" adjacent code that isn't broken; match the surrounding style.
  Remove only the imports and symbols your change orphaned; leave unrelated dead code alone
  and mention it.
- **Goal-driven.** Turn each task into a verifiable outcome ("fix the bug" → "write a
  failing test that reproduces it, then make it pass"). For multi-step work, state a brief
  plan with a verification check per step, then loop until it passes.

## Language

Write in **English only**: in-code comments, console output, error and log messages, and
AI-readable config files (CLAUDE.md, AGENT.md, etc.).

## Code Structure

- Name variables, functions, and files to communicate intent.
- One concern per file; split when a file exceeds ~300 lines.
- Extract a helper only when used in 3+ places; otherwise inline it.
- Delete dead code you create; never comment it out.

## Testing

- Write tests before or alongside implementation — they are your success criteria.
- Test observable outcomes and edge cases, not implementation details.
- Each test is fully self-contained; no shared mutable state between tests.

## Commits

Format:

```
<one-line summary>

<Why: one sentence — motivation or problem>

- <change 1>
- <change 2>
```

- Summary: imperative mood, ≤70 chars, no trailing period, no prefix tags (`feat:`, `fix:`, etc.).
- Why line: include only when motivation is not evident from the diff alone.
- Bullets: include only for 2+ distinct changes.
- Never commit secrets (`*.key`, `*.pem`, `credentials*`).
- Never use `--no-verify` or `--amend`; always create a new commit.

---

# Project: vertical-rush

Mobile-first vertical scrolling run game. Vite + SolidJS + Kobalte + TypeScript +
CSS Modules + Vitest + Biome, managed with pnpm.

## Commands

- `pnpm dev` / `pnpm build` / `pnpm preview`
- `pnpm test` — vitest run
- `pnpm check` — biome check + `tsc -b` (root tsconfig is references-only; plain
  `tsc --noEmit` checks nothing)
- `pnpm fix` — biome check --write

Git hooks (lefthook, auto-installed by `pnpm install`): pre-commit runs Biome on
staged files with auto-fix; pre-push runs `pnpm check` + `pnpm test`.

## Architecture

- `src/gameLogic.ts` — pure functions and shared constants (collision,
  clear condition, level/difficulty tables). No UI dependencies (`window`,
  `document`, Canvas, SolidJS). Covered by `src/gameLogic.test.ts`; change
  logic test-first.
- `src/entities.ts` — canonical entity types (`EntityDef`, `EntityInstance`,
  `FallbackShape`), the entity registry (`ENTITY_DEFS`), the fixed
  `PLAYER_SIZE`, pure spawn-row generation with an injected `rng`, the
  zone-keyed `SPAWN_TABLE`, obstacle-array helpers (`advanceObstacles`,
  `positionObstacleRow`, mover stepping), and item helpers (`advanceItems`,
  `positionCoinTrail`, `positionGem`). No UI dependencies; covered by
  `src/entities.test.ts`; change logic test-first.
- `src/sprites.ts` — the sprite-sheet manifest (`SPRITE_SHEETS`), the
  tile-region manifest (`TILE_SHEETS`), and the pure frame picker `frameAt`.
  No UI dependencies; covered by `src/sprites.test.ts`; change logic
  test-first.
- `src/render.ts` — the fixed 180×320 offscreen/display canvas pipeline
  (`computeDisplayFit`, `sizeDisplayCanvas`, `createOffscreenCanvas`,
  `blitFrame`), the draw dispatcher (`drawEntity`/`drawPlayer`/`drawFallback`),
  the background painters (`drawRoad`/`drawCurbs`/`drawCastleGate`/
  `drawZoneLandmark`) with their cached tile patterns, the per-sheet sprite
  loader (`loadSpriteSheets`), and the particle/speed-line system. Canvas/DOM
  allowed, no SolidJS.
- `src/audio.ts` — `createSfx` (Web Audio synth voices), the `SfxId`
  catalog, and the procedural BGM system (`startBgm`/`setBgmZone`/
  `setBgmDucked`/`stopBgm`).
- `src/App.tsx` — orchestration only: game loop, input, phase signals,
  `GAME_CONFIG` (view/feel/particle tunables), and HUD/overlay JSX. Collision
  checks must go through `checkCollision` (via `entities.ts`
  `advanceObstacles`) — never reimplement hit detection in the UI layer.
- Tunables live in the module that owns them: view/feel/particle values in
  `GAME_CONFIG` (`src/App.tsx`), entity data in `src/entities.ts`, difficulty
  values in `src/gameLogic.ts`. No magic numbers at use sites, ever.
- Per-frame values live in plain mutable objects (`sim`, `view`); Solid signals
  are only for low-frequency UI state (phase, level, displayed distance).

## Specifications

`spec/` is the design source of truth (start at `spec/README.md`). Any change
to gameplay rules, entity data, the rendering pipeline, or difficulty values
must update the matching spec section — including its `Status:` line — in the
same commit. When spec and code disagree and the spec section says
`implemented`, the code wins: fix the spec first. New feature work follows the
phases in `spec/07-roadmap.md`; do not implement work marked `planned` for a
later phase.

## Gotchas

- Vitest runs with `environment: "node"` set in `vite.config.ts` — without it,
  vite-plugin-solid injects jsdom (not installed) in test mode.
- `tsconfig.app.json` has `erasableSyntaxOnly` (no enums/namespaces) and
  `verbatimModuleSyntax` (type-only imports required).
- Biome lints the whole repo except `*.svg` files (template SVGs trip a11y rules).
