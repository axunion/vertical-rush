# vertical-rush

A mobile-first vertical scrolling run game. Tap left/right to switch lanes, dodge
obstacles, and reach the goal 240m ahead.

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
├── gameLogic.ts       # Pure game rules & difficulty tables (node-tested)
├── entities.ts        # Entity registry & spawn/advance helpers (node-tested)
├── sprites.ts         # Sprite/tile sheet manifests & frame picker (node-tested)
├── render/            # Canvas pipeline (fixed 180×320 offscreen → display)
├── audio.ts           # Procedural SFX / BGM / ambient (Web Audio)
├── config.ts          # GAME_CONFIG tunables, palettes, game phases
├── zoneVisuals.ts     # Pure zone crossfade helpers
├── gameController.ts  # Per-frame simulation (Solid-free, injected hooks)
└── App.tsx            # Game loop, input, HUD/overlay JSX
```

Logic and UI are loosely coupled. To change game rules (e.g. collision), write a
failing test in `gameLogic.test.ts` or `entities.test.ts` first; for rendering
or feel adjustments, start from `GAME_CONFIG` in `src/config.ts`.

Long-lived workflow guides (AI image asset workflow, backlog) live in
[`docs/`](docs/).

Image assets (`public/assets/sheets/*.png`) are optional. When missing, the
game falls back to procedural Canvas rendering.
