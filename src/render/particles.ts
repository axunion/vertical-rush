import type { Box } from "../gameLogic";
import { withAlpha } from "./helpers";
import type {
  DustConfig,
  Particle,
  RenderColors,
  SparkConfig,
  SpeedLine,
  View,
} from "./types";

const randRange = ([min, max]: readonly [number, number]) =>
  min + Math.random() * (max - min);

export function createSpeedLine(
  view: View,
  y: number,
  lengthRange: readonly [number, number],
): SpeedLine {
  return {
    x: view.roadPad + Math.random() * (view.w - view.roadPad * 2),
    y,
    length: randRange(lengthRange),
  };
}

/** Advances speed lines and respawns any that scrolled past the bottom. */
export function advanceSpeedLines(
  lines: SpeedLine[],
  view: View,
  pxDelta: number,
  lengthRange: readonly [number, number],
): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    line.y += pxDelta;
    if (line.y - line.length > view.h) {
      lines[i] = createSpeedLine(
        view,
        -Math.random() * view.h * 0.3,
        lengthRange,
      );
    }
  }
}

export function updateParticles(
  list: Particle[],
  dt: number,
  gravity = 0,
): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.life -= dt;
    if (p.life <= 0) {
      list.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += gravity * dt;
  }
}

export function emitDust(
  list: Particle[],
  maxCount: number,
  player: Box,
  config: DustConfig,
  colors: readonly string[],
): void {
  if (list.length >= maxCount) {
    list.shift();
  }
  list.push({
    x: player.x + player.width / 2 + (Math.random() - 0.5) * player.width * 0.6,
    y: player.y + player.height,
    vx: (Math.random() - 0.5) * config.driftX,
    vy: randRange(config.fallSpeed),
    life: randRange(config.life),
    maxLife: config.life[1],
    size: randRange(config.size),
    color: colors[Math.floor(Math.random() * colors.length)],
  });
}

export function emitSparks(
  list: Particle[],
  player: Box,
  config: SparkConfig,
  color: string,
): void {
  const cx = player.x + player.width / 2;
  const cy = player.y + player.height / 2;
  for (let i = 0; i < config.count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = randRange(config.speed);
    const maxLife = randRange(config.life);
    list.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - config.lift,
      life: maxLife,
      maxLife,
      size: randRange(config.size),
      color,
    });
  }
}

export function drawSpeedLines(
  c: CanvasRenderingContext2D,
  lines: readonly SpeedLine[],
  colors: RenderColors,
): void {
  c.strokeStyle = withAlpha(colors.ink, 0.2);
  c.lineWidth = 1;
  c.beginPath();
  for (const line of lines) {
    c.moveTo(line.x, line.y - line.length);
    c.lineTo(line.x, line.y);
  }
  c.stroke();
}

export function drawParticles(
  c: CanvasRenderingContext2D,
  list: readonly Particle[],
): void {
  for (const p of list) {
    c.globalAlpha = Math.max(0, p.life / p.maxLife);
    c.fillStyle = p.color;
    const s = p.size;
    c.fillRect(p.x - s / 2, p.y - s / 2, s, s);
  }
  c.globalAlpha = 1;
}
