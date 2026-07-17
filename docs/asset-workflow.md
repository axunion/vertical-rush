# AI Image Asset Workflow

How to create and replace this game's pixel art using generative AI. This is a
long-lived guide: it describes the contract the art must satisfy and the
workflow that reliably produces usable sprites. Exact frame sizes and sheet
layouts are **not** duplicated here — `src/sprites.ts` is the single source of
truth; read the rects there.

## Asset contract

Three sheets under `public/assets/sheets/`:

| Sheet | Content |
|---|---|
| `poco.png` | Player animations (idle/run/switch/crash/victory), 24×32 grid |
| `entities.png` | One band per entity (obstacles + items), sizes vary per rect |
| `town.png` | Background tile/landmark regions (roads, curbs, gates, banners) |

Rules that make iteration safe and constrain the art:

- **Layout is defined solely by `SPRITE_SHEETS` / `TILE_SHEETS` in
  `src/sprites.ts`.** A frame drawn at the wrong size or offset bleeds into
  neighboring frames at runtime — sizes must match the rects exactly.
- **The game is fully playable with zero PNGs present** (`RND-INV-1`): a
  missing or broken sheet silently falls back to procedural shapes. You can
  drop in a work-in-progress sheet at any time without breaking the game.
- **Player key color:** the player's dominant color must stay rust-red
  `#D95763` (`GAME_CONFIG.colors.rustRed`). The `verify` skill locates the
  player by scanning canvas pixels for this color (±40 per channel). Changing
  the player's look means updating the constant in
  `.claude/skills/verify/SKILL.md` in the same change.
- **Palette:** stay within the game palette (`GAME_CONFIG.colors` in
  `src/config.ts`) so generated art doesn't clash with the procedural
  backgrounds it sits on. Near-matches are fine; the palette is a target, not
  a validator.

## Core principle: AI generates subjects, never sheets

Image models cannot produce "multiple frames at exact pixel offsets on one
canvas". Never ask for a packed sheet. Instead:

1. **Generate one subject (or one animation frame) per image**, large, on a
   transparent background.
2. **Reduce it to the target frame size** taken from `src/sprites.ts`.
3. **Compose frames into the sheet** at the manifest rects (any pixel editor
   today; a manifest-driven pack script is a backlog idea — see
   `docs/backlog.md`).
4. Drop the sheet into `public/assets/sheets/` and run the verification
   triplet: `pnpm test`, `pnpm check`, the `verify` skill.

## Getting usable pixels at tiny sizes

Target frames are 12–80 px. A naive "generate at 512px, downscale to 12px"
almost never survives the reduction. Three routes that work, in order of
preference:

1. **Pixel-art-native generators** (e.g. Retro Diffusion, PixelLab): generate
   at or near the target resolution directly, with real 1:1 pixels.
2. **Agent transcription**: generate a reference image with a general model,
   then have a coding agent transcribe it into a pixel array / tiny PNG at the
   exact frame size. The current three sheets were authored this way, so this
   route is proven in this repo.
3. **Manual rework**: use the AI output as a reference and redraw in a pixel
   editor (Aseprite etc.).

Additional know-how:

- **Animation frames**: lock the base frame first, then produce the other
  frames as edits of it (img2img / edit mode: "same character, right leg
  forward"). Frame counts here are small (2–4), so this stays cheap.
- **Transparency**: explicitly request a transparent background, and verify
  the file actually has alpha — models sometimes paint a fake checkerboard.
- **Perspective**: match the existing sheets — a slight three-quarter
  top-down view; the player is seen from behind (running up-screen).

## Style guide preamble

Keep prompts consistent by pasting a fixed preamble before every
subject-specific instruction, along these lines:

> Pixel art, flat colors, hard pixel edges, no anti-aliasing, no outline
> gradients, transparent background. Slight three-quarter top-down view.
> Cozy European old-town color mood; use this palette: <paste the hex values
> from `GAME_CONFIG.colors` in `src/config.ts`>. For the player character,
> the dominant color must be rust-red #D95763.

## Replacement checklist

1. Frame/region sizes match the rects in `src/sprites.ts` exactly.
2. Player art keeps `#D95763` dominant — or the `verify` skill constant is
   updated in the same commit.
3. PNG has real alpha; no baked-in background.
4. `pnpm test` and `pnpm check` pass, and the `verify` skill passes both
   deterministic scenarios with the new sheets in place.
