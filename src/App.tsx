import { Button } from "@kobalte/core/button";
import { createSignal, type JSX, onCleanup, onMount, Show } from "solid-js";
import styles from "./App.module.css";
import {
  type Box,
  calculateLevel,
  checkCollision,
  isGameCleared,
  TARGET_DISTANCE,
} from "./gameLogic";

const GAME_CONFIG = {
  targetDistance: TARGET_DISTANCE,
  laneCount: 3,
  assets: {
    player: "/assets/player.png",
    obstacle: "/assets/obstacle.png",
  },
  /** Fraction of the view height scrolled per second at speed 1. */
  speedRatio: 0.11,
  /** Playfield width / height. */
  viewAspect: 9 / 16,
  roadPaddingRatio: 0.07,
  playerWidthRatio: 0.5,
  playerAspect: 1.2,
  playerYRatio: 0.78,
  playerGlowBlur: 18,
  obstacleWidthRatio: 0.74,
  obstacleAspect: 0.62,
  laneEaseRate: 10,
  spawn: {
    initialDelay: 6,
    baseGap: 8,
    gapPerLevel: 1.2,
    minGap: 5.5,
    doubleChance: 0.45,
  },
  particles: {
    dustMax: 70,
    dustPerSecond: 60,
    dust: {
      driftX: 50,
      fallSpeed: [90, 250],
      life: [0.35, 0.65],
      size: [2, 5],
    },
    sparkCount: 30,
    spark: {
      speed: [120, 500],
      lift: 60,
      life: [0.5, 0.9],
      size: [1.5, 4],
      gravity: 700,
    },
  },
  speedLines: {
    count: 12,
    length: [30, 120],
    speedFactor: 1.6,
    idleSpeed: 0.5,
  },
  idle: { scrollRatio: 0.06, animRate: 0.8 },
  shake: { duration: 0.45, magnitude: 14 },
  bannerDuration: 1.2,
  font: '"Avenir Next", Futura, "Trebuchet MS", sans-serif',
  colors: {
    roadTop: "#0a0c1e",
    roadBottom: "#181b36",
    laneLine: "rgba(45, 226, 255, 0.35)",
    curb: "#ff5d3a",
    curbAlt: "#e8e4d8",
    player: "#ff7a29",
    playerTrim: "#ffd166",
    playerFace: "#ffe9c9",
    obstacle: "#ffb020",
    obstacleStripe: "#221a38",
    dust: ["#ffd166", "#ff9f43", "#7defff"],
    spark: "#ffe066",
    goal: "#2de2ff",
    speedLine: "rgba(140, 235, 255, 0.22)",
    checker: ["#f4f7ff", "#10132b"],
    highlight: "rgba(255, 255, 255, 0.25)",
    shadow: "rgba(0, 0, 0, 0.35)",
  },
} as const;

type GamePhase = "ready" | "running" | "cleared" | "gameover";

type Obstacle = Box & { lane: number };

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface SpeedLine {
  x: number;
  y: number;
  length: number;
}

const randRange = ([min, max]: readonly [number, number]) =>
  min + Math.random() * (max - min);

/** Web Audio sound effects generated in code; no external files needed. */
function createSfx() {
  let audio: AudioContext | null = null;

  const tone = (
    freq: number,
    duration: number,
    type: OscillatorType,
    opts: { to?: number; at?: number; volume?: number } = {},
  ) => {
    if (!audio) {
      return;
    }
    const t0 = audio.currentTime + (opts.at ?? 0);
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.to !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + duration);
    }
    gain.gain.setValueAtTime(opts.volume ?? 0.07, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(audio.destination);
    osc.start(t0);
    osc.stop(t0 + duration);
  };

  return {
    /** Create/resume the context; must be called from a user gesture. */
    unlock() {
      if (!audio) {
        audio = new AudioContext();
      }
      if (audio.state === "suspended") {
        void audio.resume();
      }
    },
    dash() {
      tone(240, 0.12, "square", { to: 90, volume: 0.05 });
    },
    levelUp() {
      tone(523.25, 0.12, "square");
      tone(659.25, 0.12, "square", { at: 0.09 });
      tone(783.99, 0.22, "square", { at: 0.18 });
    },
    clear() {
      tone(523.25, 0.5, "triangle");
      tone(659.25, 0.5, "triangle", { at: 0.12 });
      tone(783.99, 0.5, "triangle", { at: 0.24 });
      tone(1046.5, 0.8, "triangle", { at: 0.36, volume: 0.09 });
    },
    gameOver() {
      tone(320, 0.7, "sawtooth", { to: 55, volume: 0.09 });
    },
    dispose() {
      if (audio && audio.state !== "closed") {
        void audio.close();
      }
      audio = null;
    },
  };
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

export default function App() {
  const [phase, setPhase] = createSignal<GamePhase>("ready");
  const [level, setLevel] = createSignal(1);
  const [distance, setDistance] = createSignal(0);

  let rootEl!: HTMLDivElement;
  let canvasEl!: HTMLCanvasElement;
  let ctx!: CanvasRenderingContext2D;
  let rafId = 0;
  let roadGradient: CanvasGradient | null = null;
  let glowSprite: {
    canvas: HTMLCanvasElement;
    w: number;
    h: number;
    pad: number;
  } | null = null;

  const sfx = createSfx();

  const images: Record<"player" | "obstacle", HTMLImageElement | null> = {
    player: null,
    obstacle: null,
  };

  const view = { w: 360, h: 640, roadPad: 24, laneWidth: 104 };

  // Per-frame mutable simulation state. Kept out of signals on purpose:
  // writing signals at 60Hz would thrash Solid's reactive graph for no benefit.
  const sim = {
    distance: 0,
    playerLane: 1,
    playerX: 0,
    animTime: 0,
    obstacles: [] as Obstacle[],
    dust: [] as Particle[],
    sparks: [] as Particle[],
    speedLines: [] as SpeedLine[],
    nextSpawn: GAME_CONFIG.spawn.initialDelay,
    safeLane: 1,
    shakeTime: 0,
    bgOffset: 0,
    prevLevel: 1,
    bannerTime: 0,
    dustCarry: 0,
  };

  const laneCenterX = (lane: number) =>
    view.roadPad + view.laneWidth * (lane + 0.5);

  const pxPerUnit = () => view.h * GAME_CONFIG.speedRatio;

  const playerBox = (): Box => {
    const width = view.laneWidth * GAME_CONFIG.playerWidthRatio;
    const height = width * GAME_CONFIG.playerAspect;
    return {
      x: sim.playerX - width / 2,
      y: view.h * GAME_CONFIG.playerYRatio,
      width,
      height,
    };
  };

  const newSpeedLine = (y: number): SpeedLine => ({
    x: view.roadPad + Math.random() * (view.w - view.roadPad * 2),
    y,
    length: randRange(GAME_CONFIG.speedLines.length),
  });

  // Canvas shadowBlur is too slow to pay per frame on mobile, so the glowing
  // player body is pre-rendered once per resize and stamped with drawImage.
  const renderGlowSprite = () => {
    const width = view.laneWidth * GAME_CONFIG.playerWidthRatio;
    const height = width * GAME_CONFIG.playerAspect;
    const pad = GAME_CONFIG.playerGlowBlur * 1.6;
    const w = width + pad * 2;
    const h = height + pad * 2;
    const dpr = window.devicePixelRatio || 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(w * dpr);
    canvas.height = Math.ceil(h * dpr);
    const c = canvas.getContext("2d");
    if (!c) {
      glowSprite = null;
      return;
    }
    c.scale(dpr, dpr);
    c.shadowColor = GAME_CONFIG.colors.player;
    c.shadowBlur = GAME_CONFIG.playerGlowBlur;
    c.fillStyle = GAME_CONFIG.colors.player;
    c.beginPath();
    c.roundRect(
      pad + width * 0.14,
      pad + height * 0.2,
      width * 0.72,
      height * 0.58,
      width * 0.3,
    );
    c.fill();
    glowSprite = { canvas, w, h, pad };
  };

  const resize = () => {
    const maxW = rootEl.clientWidth;
    const maxH = rootEl.clientHeight;
    const prevH = view.h;
    let w = maxW;
    let h = maxW / GAME_CONFIG.viewAspect;
    if (h > maxH) {
      h = maxH;
      w = maxH * GAME_CONFIG.viewAspect;
    }
    view.w = Math.round(w);
    view.h = Math.round(h);
    view.roadPad = view.w * GAME_CONFIG.roadPaddingRatio;
    view.laneWidth = (view.w - view.roadPad * 2) / GAME_CONFIG.laneCount;
    const dpr = window.devicePixelRatio || 1;
    canvasEl.style.width = `${view.w}px`;
    canvasEl.style.height = `${view.h}px`;
    canvasEl.width = Math.round(view.w * dpr);
    canvasEl.height = Math.round(view.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    roadGradient = ctx.createLinearGradient(0, 0, 0, view.h);
    roadGradient.addColorStop(0, GAME_CONFIG.colors.roadTop);
    roadGradient.addColorStop(1, GAME_CONFIG.colors.roadBottom);
    // Remap live entities to the new geometry so drawing and checkCollision
    // stay aligned after a rotation or window resize.
    const width = view.laneWidth * GAME_CONFIG.obstacleWidthRatio;
    const height = width * GAME_CONFIG.obstacleAspect;
    for (const obs of sim.obstacles) {
      obs.x = laneCenterX(obs.lane) - width / 2;
      obs.y = (obs.y / prevH) * view.h;
      obs.width = width;
      obs.height = height;
    }
    sim.playerX = laneCenterX(sim.playerLane);
    sim.speedLines = [];
    for (let i = 0; i < GAME_CONFIG.speedLines.count; i++) {
      sim.speedLines.push(newSpeedLine(Math.random() * view.h));
    }
    renderGlowSprite();
  };

  const resetSim = () => {
    sim.distance = 0;
    sim.playerLane = Math.floor(GAME_CONFIG.laneCount / 2);
    sim.playerX = laneCenterX(sim.playerLane);
    sim.animTime = 0;
    sim.obstacles = [];
    sim.dust = [];
    sim.sparks = [];
    sim.nextSpawn = GAME_CONFIG.spawn.initialDelay;
    sim.safeLane = sim.playerLane;
    sim.shakeTime = 0;
    sim.prevLevel = 1;
    sim.bannerTime = 0;
    sim.dustCarry = 0;
  };

  const start = () => {
    sfx.unlock();
    resetSim();
    setLevel(1);
    setDistance(0);
    setPhase("running");
  };

  const moveLane = (dir: -1 | 1) => {
    const next = Math.min(
      GAME_CONFIG.laneCount - 1,
      Math.max(0, sim.playerLane + dir),
    );
    if (next !== sim.playerLane) {
      sim.playerLane = next;
      sfx.dash();
    }
  };

  const handlePointerDown = (e: PointerEvent) => {
    sfx.unlock();
    if (phase() !== "running") {
      return;
    }
    e.preventDefault();
    const rect = rootEl.getBoundingClientRect();
    moveLane(e.clientX - rect.left < rect.width / 2 ? -1 : 1);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") {
      return;
    }
    sfx.unlock();
    if (phase() === "running") {
      moveLane(e.key === "ArrowLeft" ? -1 : 1);
    }
  };

  const spawnRow = () => {
    const step = Math.floor(Math.random() * 3) - 1;
    sim.safeLane = Math.min(
      GAME_CONFIG.laneCount - 1,
      Math.max(0, sim.safeLane + step),
    );
    const openLanes: number[] = [];
    for (let lane = 0; lane < GAME_CONFIG.laneCount; lane++) {
      if (lane !== sim.safeLane) {
        openLanes.push(lane);
      }
    }
    const width = view.laneWidth * GAME_CONFIG.obstacleWidthRatio;
    const height = width * GAME_CONFIG.obstacleAspect;
    const blockAll =
      openLanes.length > 1 && Math.random() < GAME_CONFIG.spawn.doubleChance;
    const lanes = blockAll
      ? openLanes
      : [openLanes[Math.floor(Math.random() * openLanes.length)]];
    for (const lane of lanes) {
      sim.obstacles.push({
        lane,
        x: laneCenterX(lane) - width / 2,
        y: -height,
        width,
        height,
      });
    }
  };

  const emitDust = (player: Box) => {
    if (sim.dust.length >= GAME_CONFIG.particles.dustMax) {
      sim.dust.shift();
    }
    const colors = GAME_CONFIG.colors.dust;
    const dust = GAME_CONFIG.particles.dust;
    sim.dust.push({
      x:
        player.x +
        player.width / 2 +
        (Math.random() - 0.5) * player.width * 0.6,
      y: player.y + player.height,
      vx: (Math.random() - 0.5) * dust.driftX,
      vy: randRange(dust.fallSpeed),
      life: randRange(dust.life),
      maxLife: dust.life[1],
      size: randRange(dust.size),
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  };

  const crash = (player: Box) => {
    setPhase("gameover");
    sfx.gameOver();
    sim.shakeTime = GAME_CONFIG.shake.duration;
    const cx = player.x + player.width / 2;
    const cy = player.y + player.height / 2;
    const spark = GAME_CONFIG.particles.spark;
    for (let i = 0; i < GAME_CONFIG.particles.sparkCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = randRange(spark.speed);
      const maxLife = randRange(spark.life);
      sim.sparks.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - spark.lift,
        life: maxLife,
        maxLife,
        size: randRange(spark.size),
        color: GAME_CONFIG.colors.spark,
      });
    }
  };

  const updateGame = (dt: number) => {
    const info = calculateLevel(sim.distance);
    sim.distance = Math.min(
      sim.distance + info.speed * dt,
      GAME_CONFIG.targetDistance,
    );
    const scroll = info.speed * pxPerUnit() * dt;
    sim.bgOffset += scroll;
    sim.animTime += dt * (0.75 + info.level * 0.25);

    if (info.level !== sim.prevLevel) {
      sim.prevLevel = info.level;
      setLevel(info.level);
      sim.bannerTime = GAME_CONFIG.bannerDuration;
      sfx.levelUp();
    }

    setDistance(Math.floor(sim.distance));

    sim.playerX +=
      (laneCenterX(sim.playerLane) - sim.playerX) *
      (1 - Math.exp(-GAME_CONFIG.laneEaseRate * dt));

    while (sim.distance >= sim.nextSpawn) {
      spawnRow();
      sim.nextSpawn += Math.max(
        GAME_CONFIG.spawn.minGap,
        GAME_CONFIG.spawn.baseGap -
          (info.level - 1) * GAME_CONFIG.spawn.gapPerLevel,
      );
    }

    // Reaching the goal wins over a same-frame collision.
    if (isGameCleared(sim.distance, GAME_CONFIG.targetDistance)) {
      setPhase("cleared");
      sfx.clear();
      return;
    }

    const player = playerBox();
    for (let i = sim.obstacles.length - 1; i >= 0; i--) {
      const obs = sim.obstacles[i];
      obs.y += scroll;
      if (obs.y > view.h) {
        sim.obstacles.splice(i, 1);
        continue;
      }
      if (checkCollision(player, obs)) {
        crash(player);
        return;
      }
    }

    sim.dustCarry +=
      GAME_CONFIG.particles.dustPerSecond * dt * (0.6 + info.level * 0.2);
    while (sim.dustCarry >= 1) {
      sim.dustCarry -= 1;
      emitDust(player);
    }
  };

  const updateParticles = (list: Particle[], dt: number, gravity = 0) => {
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
  };

  const updateAmbient = (dt: number) => {
    const running = phase() === "running";
    if (!running) {
      sim.bgOffset += view.h * GAME_CONFIG.idle.scrollRatio * dt;
      if (phase() === "ready") {
        sim.animTime += dt * GAME_CONFIG.idle.animRate;
      }
    }
    updateParticles(sim.dust, dt);
    updateParticles(sim.sparks, dt, GAME_CONFIG.particles.spark.gravity);
    sim.shakeTime = Math.max(0, sim.shakeTime - dt);
    sim.bannerTime = Math.max(0, sim.bannerTime - dt);
    const lineSpeed = running
      ? calculateLevel(sim.distance).speed * GAME_CONFIG.speedLines.speedFactor
      : GAME_CONFIG.speedLines.idleSpeed;
    for (let i = 0; i < sim.speedLines.length; i++) {
      const line = sim.speedLines[i];
      line.y += lineSpeed * pxPerUnit() * dt;
      if (line.y - line.length > view.h) {
        sim.speedLines[i] = newSpeedLine(-Math.random() * view.h * 0.3);
      }
    }
  };

  const drawCurbs = (c: CanvasRenderingContext2D) => {
    const stripe = 34;
    const curbW = Math.max(6, view.roadPad * 0.4);
    const offset = sim.bgOffset % (stripe * 2);
    for (let pass = 0; pass < 2; pass++) {
      c.fillStyle =
        pass === 0 ? GAME_CONFIG.colors.curb : GAME_CONFIG.colors.curbAlt;
      const start = offset - stripe * 2 + pass * stripe;
      for (let y = start; y < view.h + stripe; y += stripe * 2) {
        c.fillRect(view.roadPad - curbW, y, curbW, stripe);
        c.fillRect(view.w - view.roadPad, y, curbW, stripe);
      }
    }
  };

  const drawLaneLines = (c: CanvasRenderingContext2D) => {
    c.strokeStyle = GAME_CONFIG.colors.laneLine;
    c.lineWidth = 3;
    c.setLineDash([16, 30]);
    c.lineDashOffset = -sim.bgOffset;
    for (let i = 1; i < GAME_CONFIG.laneCount; i++) {
      const x = view.roadPad + view.laneWidth * i;
      c.beginPath();
      c.moveTo(x, -10);
      c.lineTo(x, view.h + 10);
      c.stroke();
    }
    c.setLineDash([]);
  };

  const drawSpeedLines = (c: CanvasRenderingContext2D) => {
    c.strokeStyle = GAME_CONFIG.colors.speedLine;
    c.lineWidth = 2;
    for (const line of sim.speedLines) {
      c.beginPath();
      c.moveTo(line.x, line.y - line.length);
      c.lineTo(line.x, line.y);
      c.stroke();
    }
  };

  const drawGoalLine = (c: CanvasRenderingContext2D) => {
    const remaining = (GAME_CONFIG.targetDistance - sim.distance) * pxPerUnit();
    const y = view.h * GAME_CONFIG.playerYRatio - remaining;
    if (y < -40 || y > view.h + 40) {
      return;
    }
    const cell = 14;
    const [checkerA, checkerB] = GAME_CONFIG.colors.checker;
    for (let row = 0; row < 2; row++) {
      for (let x = view.roadPad; x < view.w - view.roadPad; x += cell) {
        c.fillStyle =
          (Math.floor(x / cell) + row) % 2 === 0 ? checkerA : checkerB;
        c.fillRect(x, y + row * cell, cell, cell);
      }
    }
  };

  const drawObstacles = (c: CanvasRenderingContext2D) => {
    const img = images.obstacle;
    for (const obs of sim.obstacles) {
      if (img) {
        c.drawImage(img, obs.x, obs.y, obs.width, obs.height);
        continue;
      }
      c.fillStyle = GAME_CONFIG.colors.obstacle;
      c.beginPath();
      c.roundRect(obs.x, obs.y, obs.width, obs.height, 8);
      c.fill();
      c.save();
      c.clip();
      c.strokeStyle = GAME_CONFIG.colors.obstacleStripe;
      c.lineWidth = 8;
      for (let sx = -obs.height; sx < obs.width; sx += 22) {
        c.beginPath();
        c.moveTo(obs.x + sx, obs.y + obs.height + 4);
        c.lineTo(obs.x + sx + obs.height + 8, obs.y - 4);
        c.stroke();
      }
      c.restore();
      c.fillStyle = GAME_CONFIG.colors.highlight;
      c.fillRect(obs.x + 5, obs.y + 2, obs.width - 10, 3);
    }
  };

  const drawPlayer = (c: CanvasRenderingContext2D) => {
    const p = playerBox();
    const cx = p.x + p.width / 2;
    c.fillStyle = GAME_CONFIG.colors.shadow;
    c.beginPath();
    c.ellipse(
      cx,
      p.y + p.height + 4,
      p.width * 0.45,
      p.width * 0.14,
      0,
      0,
      Math.PI * 2,
    );
    c.fill();
    const img = images.player;
    if (img) {
      c.drawImage(
        img,
        p.x,
        p.y + Math.sin(sim.animTime * 16) * 2,
        p.width,
        p.height,
      );
      return;
    }
    const legPhase = Math.sin(sim.animTime * 16) * p.height * 0.09;
    c.fillStyle = GAME_CONFIG.colors.playerTrim;
    c.beginPath();
    c.ellipse(
      cx - p.width * 0.22,
      p.y + p.height * 0.88 + legPhase,
      p.width * 0.13,
      p.height * 0.09,
      0,
      0,
      Math.PI * 2,
    );
    c.ellipse(
      cx + p.width * 0.22,
      p.y + p.height * 0.88 - legPhase,
      p.width * 0.13,
      p.height * 0.09,
      0,
      0,
      Math.PI * 2,
    );
    c.fill();
    if (glowSprite) {
      c.drawImage(
        glowSprite.canvas,
        p.x - glowSprite.pad,
        p.y - glowSprite.pad,
        glowSprite.w,
        glowSprite.h,
      );
    } else {
      c.fillStyle = GAME_CONFIG.colors.player;
      c.beginPath();
      c.roundRect(
        p.x + p.width * 0.14,
        p.y + p.height * 0.2,
        p.width * 0.72,
        p.height * 0.58,
        p.width * 0.3,
      );
      c.fill();
    }
    c.fillStyle = GAME_CONFIG.colors.playerFace;
    c.beginPath();
    c.arc(cx, p.y + p.height * 0.16, p.width * 0.2, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = GAME_CONFIG.colors.obstacleStripe;
    c.fillRect(
      cx - p.width * 0.16,
      p.y + p.height * 0.1,
      p.width * 0.32,
      p.height * 0.06,
    );
  };

  const drawParticles = (c: CanvasRenderingContext2D, list: Particle[]) => {
    c.globalCompositeOperation = "lighter";
    for (const p of list) {
      c.globalAlpha = Math.max(0, p.life / p.maxLife);
      c.fillStyle = p.color;
      c.beginPath();
      c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
  };

  const drawBanner = (c: CanvasRenderingContext2D) => {
    if (sim.bannerTime <= 0) {
      return;
    }
    const t = sim.bannerTime / GAME_CONFIG.bannerDuration;
    c.globalAlpha = Math.min(1, t * 2.5);
    c.fillStyle = GAME_CONFIG.colors.goal;
    c.shadowColor = GAME_CONFIG.colors.goal;
    c.shadowBlur = 22;
    c.font = `italic 900 ${Math.round(view.w * 0.09)}px ${GAME_CONFIG.font}`;
    c.textAlign = "center";
    c.fillText(`LEVEL ${level()}`, view.w / 2, view.h * 0.3 - (1 - t) * 24);
    c.font = `700 ${Math.round(view.w * 0.045)}px ${GAME_CONFIG.font}`;
    c.fillText("SPEED UP!", view.w / 2, view.h * 0.3 + view.w * 0.055);
    c.shadowBlur = 0;
    c.globalAlpha = 1;
    c.textAlign = "start";
  };

  const render = () => {
    const c = ctx;
    c.save();
    if (sim.shakeTime > 0) {
      const k =
        (sim.shakeTime / GAME_CONFIG.shake.duration) *
        GAME_CONFIG.shake.magnitude;
      c.translate((Math.random() - 0.5) * 2 * k, (Math.random() - 0.5) * 2 * k);
    }
    c.fillStyle = roadGradient ?? GAME_CONFIG.colors.roadTop;
    c.fillRect(-20, -20, view.w + 40, view.h + 40);
    drawCurbs(c);
    drawLaneLines(c);
    drawSpeedLines(c);
    drawGoalLine(c);
    drawObstacles(c);
    drawParticles(c, sim.dust);
    drawPlayer(c);
    drawParticles(c, sim.sparks);
    drawBanner(c);
    c.restore();
  };

  onMount(() => {
    const context = canvasEl.getContext("2d");
    if (!context) {
      console.error("Canvas 2D context unavailable; the game cannot start.");
      return;
    }
    ctx = context;
    resize();
    resetSim();
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", handleKeyDown);
    void loadImage(GAME_CONFIG.assets.player).then((img) => {
      images.player = img;
    });
    void loadImage(GAME_CONFIG.assets.obstacle).then((img) => {
      images.obstacle = img;
    });
    let last = performance.now();
    const frame = (ts: number) => {
      const dt = Math.min((ts - last) / 1000, 0.05);
      last = ts;
      if (phase() === "running") {
        updateGame(dt);
      }
      updateAmbient(dt);
      render();
      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
  });

  onCleanup(() => {
    cancelAnimationFrame(rafId);
    window.removeEventListener("resize", resize);
    window.removeEventListener("keydown", handleKeyDown);
    sfx.dispose();
  });

  const overlay = (
    title: JSX.Element,
    titleClass: string,
    caption: JSX.Element,
    buttonLabel: string,
  ) => (
    <div class={styles.overlay}>
      <h1 class={`${styles.title} ${titleClass}`}>{title}</h1>
      <p class={styles.caption}>{caption}</p>
      <Button class={styles.button} onClick={start}>
        {buttonLabel}
      </Button>
    </div>
  );

  return (
    <div class={styles.root} ref={rootEl} onPointerDown={handlePointerDown}>
      <div class={styles.frame}>
        <canvas class={styles.canvas} ref={canvasEl} />
        <div class={styles.hud}>
          <span class={styles.distance}>{distance()}m</span>
          <div class={styles.track}>
            <div
              class={styles.trackFill}
              style={{
                width: `${(distance() / GAME_CONFIG.targetDistance) * 100}%`,
              }}
            />
          </div>
          <span class={styles.levelChip}>LV.{level()}</span>
        </div>
        <Show when={phase() === "ready"}>
          {overlay(
            <>
              Vertical
              <br />
              Rush
            </>,
            "",
            <>
              画面の左右をタップしてレーン移動
              <br />
              {GAME_CONFIG.targetDistance}m 先のゴールを目指せ！
            </>,
            "START",
          )}
        </Show>
        <Show when={phase() === "cleared"}>
          {overlay(
            "Goal!",
            styles.titleClear,
            `${GAME_CONFIG.targetDistance}m 完走！ お見事！`,
            "もう一度走る",
          )}
        </Show>
        <Show when={phase() === "gameover"}>
          {overlay(
            "Game Over",
            styles.titleOver,
            `${distance()}m 地点でクラッシュ…`,
            "リトライ",
          )}
        </Show>
      </div>
    </div>
  );
}
