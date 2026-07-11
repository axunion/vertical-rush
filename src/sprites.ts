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

/** Builds a row of same-size frames on the poco.png grid (RND-04 layout: 24x32 cells). */
function pocoRow(row: number, count: number): FrameRect[] {
  return Array.from({ length: count }, (_, col) => ({
    x: col * 24,
    y: row * 32,
    w: 24,
    h: 32,
  }));
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
};

/** Pure frame picker: loops or clamps to the last frame per the animation def. */
export function frameAt(anim: AnimationDef, timeSec: number): FrameRect {
  const index = Math.floor(Math.max(0, timeSec) * anim.fps);
  const lastIndex = anim.frames.length - 1;
  return anim.loop
    ? anim.frames[index % anim.frames.length]
    : anim.frames[Math.min(index, lastIndex)];
}
