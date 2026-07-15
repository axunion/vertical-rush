import { ZONE_TABLE } from "../gameLogic";
import { drawEntity, drawPlayer } from "./entities-draw";
import { zoneDisplayName } from "./helpers";
import { drawCastleGate, drawZoneLandmark, ZONE_LANDMARKS } from "./landmarks";
import { drawParticles, drawSpeedLines } from "./particles";
import { drawCurbs, drawLaneLines, drawRoad } from "./road";
import type { RenderColors, RenderFrameArgs, View } from "./types";

export function drawBanner(
  c: CanvasRenderingContext2D,
  view: View,
  level: number,
  bannerTime: number,
  bannerDuration: number,
  colors: RenderColors,
  font: string,
): void {
  if (bannerTime <= 0) {
    return;
  }
  const zone = ZONE_TABLE.find((z) => z.level === level);
  const title = zone
    ? `ZONE ${level} — ${zoneDisplayName(zone.id)}`
    : `ZONE ${level}`;
  const t = bannerTime / bannerDuration;
  c.globalAlpha = Math.min(1, t * 2.5);
  c.textAlign = "center";
  const titleY = view.h * 0.3 - (1 - t) * 12;
  const subY = view.h * 0.3 + view.w * 0.055;
  c.font = `italic 900 ${Math.round(view.w * 0.05)}px ${font}`;
  c.fillStyle = colors.ink;
  c.fillText(title, view.w / 2 + 1, titleY + 1);
  c.fillStyle = colors.gold;
  c.fillText(title, view.w / 2, titleY);
  c.font = `700 ${Math.round(view.w * 0.045)}px ${font}`;
  c.fillStyle = colors.ink;
  c.fillText("SPEED UP!", view.w / 2 + 1, subY + 1);
  c.fillStyle = colors.gold;
  c.fillText("SPEED UP!", view.w / 2, subY);
  c.globalAlpha = 1;
  c.textAlign = "start";
}

/** Draws one full frame onto the fixed logical canvas, in pipeline order (road -> entities -> fx -> banner). */
export function renderFrame(
  c: CanvasRenderingContext2D,
  { view, sim, player, level, config, defs, sheets }: RenderFrameArgs,
): void {
  const remainingGoalPx =
    (config.targetDistance - sim.distance) * (view.h * config.speedRatio);
  c.save();
  if (sim.shakeTime > 0) {
    const k = (sim.shakeTime / config.shake.duration) * config.shake.magnitude;
    c.translate((Math.random() - 0.5) * 2 * k, (Math.random() - 0.5) * 2 * k);
  }
  c.fillStyle = config.colors.duskPurple;
  c.fillRect(-4, -4, view.w + 8, view.h + 8);
  const townSheet = sheets.town ?? null;
  drawRoad(c, view, sim.bgOffset, config.colors, townSheet, config.zoneBlend);
  drawCurbs(c, view, sim.bgOffset, config.colors, townSheet, config.zoneBlend);
  drawLaneLines(c, view, config.laneCount, sim.bgOffset, config.colors);
  drawSpeedLines(c, sim.speedLines, config.colors);
  for (const landmark of ZONE_LANDMARKS) {
    const remainingLandmarkPx =
      (landmark.atDistance - sim.distance) * (view.h * config.speedRatio);
    drawZoneLandmark(
      c,
      view,
      remainingLandmarkPx,
      config.playerYRatio,
      landmark.kind,
      config.colors,
      townSheet,
    );
  }
  drawCastleGate(
    c,
    view,
    remainingGoalPx,
    config.playerYRatio,
    config.colors,
    townSheet,
  );
  for (const obs of sim.obstacles) {
    drawEntity(c, obs, defs[obs.defId], config.colors, sheets, sim.animTime);
  }
  for (const item of sim.items) {
    drawEntity(c, item, defs[item.defId], config.colors, sheets, sim.animTime);
  }
  drawParticles(c, sim.dust);
  drawParticles(c, sim.itemBurst);
  drawPlayer(
    c,
    player,
    config.colors,
    sim.playerAnimState,
    sim.animTime,
    sim.playerAnimStateTime,
    sheets.poco ?? null,
    sim.playerFacing,
  );
  drawParticles(c, sim.sparks);
  drawBanner(
    c,
    view,
    level,
    sim.bannerTime,
    config.bannerDuration,
    config.colors,
    config.font,
  );
  c.restore();
}
