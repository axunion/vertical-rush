# vertical-rush

A mobile-first vertical scrolling run game. Tap left/right to switch lanes, dodge
obstacles, and reach the goal 500m ahead.

- **Stack**: Vite / SolidJS / Kobalte / TypeScript / CSS Modules
- **Testing & quality**: Vitest / Biome / lefthook
- **Package manager**: pnpm

## Setup

```bash
pnpm install   # also installs git hooks (lefthook)
pnpm dev       # http://localhost:5173
```

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start the dev server |
| `pnpm build` | Type check + production build (`dist/`) |
| `pnpm preview` | Preview the production build |
| `pnpm test` | Run tests (Vitest) |
| `pnpm check` | Lint + format check (Biome) + type check (tsc) |
| `pnpm fix` | Auto-fix with Biome |

## Git hooks

Managed by lefthook:

- **pre-commit**: checks and auto-fixes staged files with Biome
- **pre-push**: runs `pnpm check` and `pnpm test` in parallel

## Structure

```
src/
├── gameLogic.ts       # Pure game logic functions (no UI dependencies)
├── gameLogic.test.ts  # Logic tests (TDD)
├── App.tsx            # Canvas rendering, game loop, UI (tunables in GAME_CONFIG)
└── App.module.css     # Overlay UI styles
```

Logic and UI are loosely coupled. To change game rules (e.g. collision), write a
failing test in `gameLogic.test.ts` first; for rendering or feel adjustments,
start from `GAME_CONFIG` in `App.tsx`.

Image assets (`public/assets/player.png`, `obstacle.png`) are optional. When
missing, the game falls back to shape-based Canvas rendering.
