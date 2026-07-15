import type { EntityDef, EntityInstance } from "../entities";
import type { Box } from "../gameLogic";
import type { FrameRect, SpriteSheetDef } from "../sprites";
import { frameAt, SPRITE_SHEETS } from "../sprites";
import { roundBox } from "./helpers";
import { drawFallback } from "./shapes";
import type { PlayerAnimState, RenderColors, SheetImages } from "./types";

/** Resolves the sheet + current frame to draw, or null if the sheet/animation isn't available (RND-06 shared mechanism). */
function resolveSpriteFrame(
  sheetDef: SpriteSheetDef | undefined,
  sheet: HTMLImageElement | null | undefined,
  animationId: string,
  timeSec: number,
): { sheet: HTMLImageElement; frame: FrameRect } | null {
  const anim = sheetDef?.animations[animationId];
  return sheet && anim ? { sheet, frame: frameAt(anim, timeSec) } : null;
}

/** Draws the current sprite frame if `def.sprite` names a loaded sheet + animation, else the fallback shape (RND-06). */
export function drawEntity(
  c: CanvasRenderingContext2D,
  instance: EntityInstance,
  def: EntityDef,
  colors: RenderColors,
  sheets: SheetImages,
  timeSec: number,
): void {
  const resolved = def.sprite
    ? resolveSpriteFrame(
        SPRITE_SHEETS[def.sprite.sheet],
        sheets[def.sprite.sheet],
        def.sprite.animation,
        timeSec,
      )
    : null;
  if (resolved) {
    const { x, y, w, h } = roundBox(instance);
    c.drawImage(
      resolved.sheet,
      resolved.frame.x,
      resolved.frame.y,
      resolved.frame.w,
      resolved.frame.h,
      x,
      y,
      w,
      h,
    );
    return;
  }
  drawFallback(c, def.fallback, instance, colors);
}

/**
 * Draws Poco from the sprite sheet when loaded, mirroring horizontally for
 * `facing === -1` (the sheet only draws the right-facing switch lean);
 * falls back to the parameterized runner shape otherwise (RND-INV-1).
 */
export function drawPlayer(
  c: CanvasRenderingContext2D,
  box: Box,
  colors: RenderColors,
  animState: PlayerAnimState,
  animTime: number,
  animStateTime: number,
  sheet: HTMLImageElement | null,
  facing: 1 | -1,
): void {
  const resolved = resolveSpriteFrame(
    SPRITE_SHEETS.poco,
    sheet,
    animState,
    animStateTime,
  );
  if (resolved) {
    const { x, y, w, h } = roundBox(box);
    if (facing === -1) {
      c.save();
      c.translate(x + w, y);
      c.scale(-1, 1);
      c.drawImage(
        resolved.sheet,
        resolved.frame.x,
        resolved.frame.y,
        resolved.frame.w,
        resolved.frame.h,
        0,
        0,
        w,
        h,
      );
      c.restore();
    } else {
      c.drawImage(
        resolved.sheet,
        resolved.frame.x,
        resolved.frame.y,
        resolved.frame.w,
        resolved.frame.h,
        x,
        y,
        w,
        h,
      );
    }
    return;
  }
  drawFallback(c, "runner", box, colors, animTime);
}
