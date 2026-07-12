/** SPEC-RENDER RND-04 sprite-sheet manifest: explicit frame rects, no grid-index shorthand. */
export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AnimationDef {
  frames: FrameRect[];
  fps: number;
  loop: boolean;
}

export interface SpriteSheetDef {
  id: string;
  src: string;
  animations: Record<string, AnimationDef>;
}

/** Builds a band of same-size frames at explicit x offsets on a sprite sheet grid. */
function frameBand(
  y: number,
  w: number,
  h: number,
  xOffsets: number[],
): FrameRect[] {
  return xOffsets.map((x) => ({ x, y, w, h }));
}

/** Builds a row of same-size frames on the poco.png grid (RND-04 layout: 24x32 cells). */
function pocoRow(row: number, count: number): FrameRect[] {
  return frameBand(
    row * 32,
    24,
    32,
    Array.from({ length: count }, (_, col) => col * 24),
  );
}

export const SPRITE_SHEETS: Record<string, SpriteSheetDef> = {
  poco: {
    id: "poco",
    src: "/assets/sheets/poco.png",
    animations: {
      idle: { frames: pocoRow(0, 2), fps: 4, loop: true },
      run: { frames: pocoRow(1, 4), fps: 10, loop: true },
      switch: { frames: pocoRow(2, 2), fps: 8, loop: false },
      crash: { frames: pocoRow(3, 3), fps: 12, loop: false },
      victory: { frames: pocoRow(4, 2), fps: 6, loop: true },
    },
  },
  entities: {
    id: "entities",
    src: "/assets/sheets/entities.png",
    animations: {
      "hay-cart": { frames: frameBand(0, 80, 32, [0]), fps: 1, loop: true },
      "market-crate": {
        frames: frameBand(32, 38, 24, [0]),
        fps: 1,
        loop: true,
      },
      "rolling-barrel": {
        frames: frameBand(56, 20, 20, [0, 20, 40, 60]),
        fps: 12,
        loop: true,
      },
      "stray-cat": {
        frames: frameBand(80, 16, 12, [0, 16]),
        fps: 4,
        loop: true,
      },
      "chicken-flock": {
        frames: frameBand(96, 12, 12, [0, 12]),
        fps: 8,
        loop: true,
      },
      coin: {
        frames: frameBand(112, 12, 12, [0, 12, 24, 36]),
        fps: 8,
        loop: true,
      },
      gem: { frames: frameBand(128, 12, 12, [0, 12]), fps: 4, loop: true },
    },
  },
};

/** Pure frame picker: loops or clamps to the last frame per the animation def. */
export function frameAt(anim: AnimationDef, timeSec: number): FrameRect {
  const index = Math.floor(Math.max(0, timeSec) * anim.fps);
  const lastIndex = anim.frames.length - 1;
  return anim.loop
    ? anim.frames[index % anim.frames.length]
    : anim.frames[Math.min(index, lastIndex)];
}
