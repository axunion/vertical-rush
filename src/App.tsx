import { Button } from "@kobalte/core/button";
import { createSignal, type JSX, onCleanup, onMount, Show } from "solid-js";
import styles from "./App.module.css";
import { createSfx } from "./audio";
import {
  advanceObstacles,
  ENTITY_DEFS,
  type Obstacle,
  positionObstacleRow,
  remapObstacles,
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
  buildViewport,
  emitDust,
  emitSparks,
  type GlowSprite,
  loadImages,
  type Particle,
  renderFrame,
  type SpeedLine,
  updateParticles,
  type View,
} from "./render";

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
  playerYRatio: 0.78,
  playerGlowBlur: 18,
  laneEaseRate: 10,
  spawn: { doubleChance: 0.45 },
  particles: {
    dustMax: 70,
    dustPerSecond: 60,
    dust: {
      driftX: 50,
      fallSpeed: [90, 250],
      life: [0.35, 0.65],
      size: [2, 5],
    },
    spark: {
      count: 30,
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

export default function App() {
  const [phase, setPhase] = createSignal<GamePhase>("ready");
  const [level, setLevel] = createSignal(1);
  const [distance, setDistance] = createSignal(0);

  let rootEl!: HTMLDivElement;
  let canvasEl!: HTMLCanvasElement;
  let ctx!: CanvasRenderingContext2D;
  let rafId = 0;
  let roadGradient: CanvasGradient | null = null;
  let glowSprite: GlowSprite | null = null;

  const sfx = createSfx();

  const images: Record<"player" | "obstacle", HTMLImageElement | null> = {
    player: null,
    obstacle: null,
  };

  const view: View = { w: 360, h: 640, roadPad: 24, laneWidth: 104 };

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

  const playerBox = (): Box => {
    const width = view.laneWidth * ENTITY_DEFS.player.widthRatio;
    const height = width * ENTITY_DEFS.player.aspect;
    return {
      x: sim.playerX - width / 2,
      y: view.h * GAME_CONFIG.playerYRatio,
      width,
      height,
    };
  };

  const resize = () => {
    const prevH = view.h;
    const viewport = buildViewport(
      canvasEl,
      ctx,
      rootEl.clientWidth,
      rootEl.clientHeight,
      GAME_CONFIG,
      ENTITY_DEFS.player,
    );
    Object.assign(view, viewport.view);
    roadGradient = viewport.roadGradient;
    glowSprite = viewport.glowSprite;
    sim.speedLines = viewport.speedLines;
    remapObstacles(sim.obstacles, view.laneWidth, laneCenterX, prevH, view.h);
    sim.playerX = laneCenterX(sim.playerLane);
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
      ...positionObstacleRow(result.blockedLanes, view.laneWidth, laneCenterX),
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
      GAME_CONFIG.colors.spark,
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
        GAME_CONFIG.colors.dust,
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
    renderFrame(ctx, {
      view,
      roadGradient,
      sim,
      images,
      glowSprite,
      player: playerBox(),
      level: level(),
      config: GAME_CONFIG,
    });
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
    void loadImages(GAME_CONFIG.assets).then((loaded) => {
      images.player = loaded.player;
      images.obstacle = loaded.obstacle;
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
