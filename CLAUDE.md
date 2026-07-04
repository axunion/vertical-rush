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

- `src/gameLogic.ts` — pure functions and shared constants. No UI dependencies
  (`window`, `document`, Canvas, SolidJS). Covered by `src/gameLogic.test.ts`;
  change logic test-first.
- `src/App.tsx` — Canvas rendering, game loop, input, sound (Web Audio), and
  overlay UI. All tunables live in the `GAME_CONFIG` object at the top; no magic
  numbers elsewhere. Collision checks must go through `checkCollision` — never
  reimplement hit detection in the UI layer.
- Per-frame values live in plain mutable objects (`sim`, `view`); Solid signals
  are only for low-frequency UI state (phase, level, displayed distance).

## Gotchas

- Vitest runs with `environment: "node"` set in `vite.config.ts` — without it,
  vite-plugin-solid injects jsdom (not installed) in test mode.
- `tsconfig.app.json` has `erasableSyntaxOnly` (no enums/namespaces) and
  `verbatimModuleSyntax` (type-only imports required).
- Biome lints the whole repo except `*.svg` files (template SVGs trip a11y rules).
