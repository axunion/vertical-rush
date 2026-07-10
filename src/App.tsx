import { Button } from "@kobalte/core/button";
import { createSignal, type JSX, onCleanup, onMount, Show } from "solid-js";
import styles from "./App.module.css";
import { createSfx } from "./audio";
import {
  advanceObstacles,
  ENTITY_DEFS,
  type EntityInstance,
  PLAYER_SIZE,
  positionObstacleRow,
  spawnRow,
} from "./entities";
import {
  type Box,
  calculateLevel,
  isGameCleared,
  SPAWN_GAP,
  spawnGapForLevel,
  TARGET_DISTANCE,
} from "./gameLogic";
import {
  advanceSpeedLines,
  blitFrame,
  computeDisplayFit,
  createOffscreenCanvas,
  createSpeedLine,
  type DisplayFit,
  emitDust,
  emitSparks,
  type OffscreenSurface,
  type Particle,
  paintLetterbox,
  renderFrame,
  type SpeedLine,
  sizeDisplayCanvas,
  updateParticles,
  type View,
} from "./render";

const GAME_CONFIG = {
  targetDistance: TARGET_DISTANCE,
  laneCount: 3,
  /** Fixed logical-pixel grid (RND-01): sim/drawing coordinates never depend on window size. */
  logical: { w: 180, h: 320, roadPad: 12 },
  /** Fraction of the view height scrolled per second at speed 1. */
  speedRatio: 0.11,
  playerYRatio: 0.78,
  laneEaseRate: 10,
  spawn: { doubleChance: 0.45 },
  particles: {
    dustMax: 70,
    dustPerSecond: 60,
    dust: {
      driftX: 25,
      fallSpeed: [45, 125],
      life: [0.35, 0.65],
      size: [1, 2.5],
    },
    spark: {
      count: 30,
      speed: [60, 250],
      lift: 30,
      life: [0.5, 0.9],
      size: [1, 2],
      gravity: 350,
    },
  },
  speedLines: {
    count: 12,
    length: [15, 60],
    speedFactor: 1.6,
    idleSpeed: 0.5,
  },
  idle: { scrollRatio: 0.06, animRate: 0.8 },
  shake: { duration: 0.45, magnitude: 7 },
  bannerDuration: 1.2,
  font: '"Avenir Next", Futura, "Trebuchet MS", sans-serif',
  colors: {
    ink: "#33272E",
    duskPurple: "#5B4A68",
    cobbleMid: "#8D7B84",
    cobbleLight: "#B5A6A8",
    parchment: "#F4E3C1",
    warmWhite: "#FFF7E6",
    rustRed: "#D95763",
    terracotta: "#C65B41",
    gold: "#F2B63D",
    woodBrown: "#8A5A3B",
    leafGreen: "#6DA34D",
    duskTeal: "#3E6B73",
  },
} as const;

type GamePhase = "ready" | "running" | "cleared" | "gameover";

export default function App() {
  const [phase, setPhase] = createSignal<GamePhase>("ready");
  const [level, setLevel] = createSignal(1);
  const [distance, setDistance] = createSignal(0);

  let rootEl!: HTMLDivElement;
  let canvasEl!: HTMLCanvasElement;
  let ctx!: CanvasRenderingContext2D;
  let rafId = 0;
  let offscreen!: OffscreenSurface;
  let displayFit!: DisplayFit;

  const sfx = createSfx();

  const view: View = {
    w: GAME_CONFIG.logical.w,
    h: GAME_CONFIG.logical.h,
    roadPad: GAME_CONFIG.logical.roadPad,
    laneWidth:
      (GAME_CONFIG.logical.w - GAME_CONFIG.logical.roadPad * 2) /
      GAME_CONFIG.laneCount,
  };

  // Static across the whole session; built once instead of per-frame.
  const dustColors = [
    GAME_CONFIG.colors.gold,
    GAME_CONFIG.colors.warmWhite,
    GAME_CONFIG.colors.terracotta,
  ] as const;

  // Per-frame mutable simulation state. Kept out of signals on purpose:
  // writing signals at 60Hz would thrash Solid's reactive graph for no benefit.
  const sim = {
    distance: 0,
    playerLane: 1,
    playerX: 0,
    animTime: 0,
    obstacles: [] as EntityInstance[],
    dust: [] as Particle[],
    sparks: [] as Particle[],
    speedLines: [] as SpeedLine[],
    nextSpawn: SPAWN_GAP.initialDelay,
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

  const playerBox = (): Box => ({
    x: sim.playerX - PLAYER_SIZE.w / 2,
    y: view.h * GAME_CONFIG.playerYRatio,
    width: PLAYER_SIZE.w,
    height: PLAYER_SIZE.h,
  });

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    displayFit = computeDisplayFit(
      rootEl.clientWidth,
      rootEl.clientHeight,
      view.w,
      view.h,
      dpr,
    );
    sizeDisplayCanvas(canvasEl, ctx, displayFit);
    paintLetterbox(ctx, displayFit, GAME_CONFIG.colors.ink);
  };

  const resetSim = () => {
    sim.distance = 0;
    sim.playerLane = Math.floor(GAME_CONFIG.laneCount / 2);
    sim.playerX = laneCenterX(sim.playerLane);
    sim.animTime = 0;
    sim.obstacles = [];
    sim.dust = [];
    sim.sparks = [];
    sim.nextSpawn = SPAWN_GAP.initialDelay;
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

  const spawnObstacleRow = () => {
    const result = spawnRow(
      GAME_CONFIG.laneCount,
      sim.safeLane,
      GAME_CONFIG.spawn.doubleChance,
      Math.random,
    );
    sim.safeLane = result.safeLane;
    sim.obstacles.push(
      ...positionObstacleRow(result.blockedLanes, laneCenterX),
    );
  };

  const crash = (player: Box) => {
    setPhase("gameover");
    sfx.gameOver();
    sim.shakeTime = GAME_CONFIG.shake.duration;
    emitSparks(
      sim.sparks,
      player,
      GAME_CONFIG.particles.spark,
      GAME_CONFIG.colors.gold,
    );
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
      spawnObstacleRow();
      sim.nextSpawn += spawnGapForLevel(info.level);
    }

    // Reaching the goal wins over a same-frame collision.
    if (isGameCleared(sim.distance, GAME_CONFIG.targetDistance)) {
      setPhase("cleared");
      sfx.clear();
      return;
    }

    const player = playerBox();
    if (advanceObstacles(sim.obstacles, scroll, view.h, player)) {
      crash(player);
      return;
    }

    sim.dustCarry +=
      GAME_CONFIG.particles.dustPerSecond * dt * (0.6 + info.level * 0.2);
    while (sim.dustCarry >= 1) {
      sim.dustCarry -= 1;
      emitDust(
        sim.dust,
        GAME_CONFIG.particles.dustMax,
        player,
        GAME_CONFIG.particles.dust,
        dustColors,
      );
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
    advanceSpeedLines(
      sim.speedLines,
      view,
      lineSpeed * pxPerUnit() * dt,
      GAME_CONFIG.speedLines.length,
    );
  };

  const render = () => {
    renderFrame(offscreen.ctx, {
      view,
      sim,
      player: playerBox(),
      level: level(),
      config: GAME_CONFIG,
      defs: ENTITY_DEFS,
    });
    blitFrame(ctx, offscreen.canvas, displayFit);
  };

  onMount(() => {
    const context = canvasEl.getContext("2d");
    if (!context) {
      console.error("Canvas 2D context unavailable; the game cannot start.");
      return;
    }
    ctx = context;
    const surface = createOffscreenCanvas(view.w, view.h);
    if (!surface) {
      console.error("Offscreen canvas unavailable; the game cannot start.");
      return;
    }
    offscreen = surface;
    sim.speedLines = Array.from({ length: GAME_CONFIG.speedLines.count }, () =>
      createSpeedLine(
        view,
        Math.random() * view.h,
        GAME_CONFIG.speedLines.length,
      ),
    );
    resize();
    resetSim();
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", handleKeyDown);
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
