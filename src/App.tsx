import { Button } from "@kobalte/core/button";
import { createSignal, type JSX, onCleanup, onMount, Show } from "solid-js";
import styles from "./App.module.css";
import { createSfx } from "./audio";
import {
  advanceItems,
  advanceObstacles,
  type CollectedItem,
  ENTITY_DEFS,
  type EntityInstance,
  PLAYER_SIZE,
  positionCoinTrail,
  positionGem,
  positionObstacleRow,
  rollsCoinTrail,
  SPAWN_TABLE,
  shouldSpawnGem,
  spawnRow,
} from "./entities";
import {
  type Box,
  calculateLevel,
  calculateScore,
  isGameCleared,
  type LevelInfo,
  SPAWN_GAP,
  spawnGapForZone,
  TARGET_DISTANCE,
  ZONE_TABLE,
  zoneRangeAt,
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
  type FrameConfig,
  lerpHexColor,
  loadSpriteSheets,
  type OffscreenSurface,
  type Particle,
  type PlayerAnimState,
  paintLetterbox,
  type RenderColors,
  renderFrame,
  type SheetImages,
  type SpeedLine,
  sizeDisplayCanvas,
  updateParticles,
  type View,
} from "./render";
import { SPRITE_SHEETS } from "./sprites";

const GAME_CONFIG = {
  targetDistance: TARGET_DISTANCE,
  laneCount: 3,
  /** Fixed logical-pixel grid (RND-01): sim/drawing coordinates never depend on window size. */
  logical: { w: 180, h: 320, roadPad: 12 },
  /** Fraction of the view height scrolled per second at speed 1. */
  speedRatio: 0.11,
  playerYRatio: 0.78,
  laneEaseRate: 10,
  /** How long the "switch" sprite animation plays after a lane change before reverting to "run". */
  playerSwitchDuration: 0.22,
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
    itemBurst: {
      count: 10,
      speed: [30, 90],
      lift: 15,
      life: [0.25, 0.4],
      size: [1, 2],
      gravity: 0,
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
  bannerDuration: 0.8,
  /** SPEC-CORE zone transitions: road/sky crossfade duration on a zone change. */
  zoneCrossfadeDuration: 1.2,
  /** CORE-05: input lockout after entering a terminal phase, absorbing trailing panic taps from the crash. */
  retryLockout: 0.4,
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

/** SPEC-CORE zone transitions / CORE-03 palette shift: road+sky colors per zone, crossfaded over `zoneCrossfadeDuration` on a zone change. Replaces the single flat road entries in `GAME_CONFIG.colors` for these three keys. */
const ZONE_PALETTES: Record<
  string,
  Pick<RenderColors, "cobbleMid" | "cobbleLight" | "duskPurple">
> = {
  "old-town": {
    // golden afternoon — matches GAME_CONFIG.colors' base values.
    cobbleMid: "#8D7B84",
    cobbleLight: "#B5A6A8",
    duskPurple: "#5B4A68",
  },
  "market-street": {
    // saturated: warmer curb (awning/lantern glow).
    cobbleMid: "#967D6E",
    cobbleLight: "#C4A16B",
    duskPurple: "#4A3A52",
  },
  "castle-road": {
    // dusk: cooler road, deeper sky, torch-glow accents.
    cobbleMid: "#6E6478",
    cobbleLight: "#9088A6",
    duskPurple: "#332B4A",
  },
};

/** Each zone's fully-merged steady-state colors, precomputed once so a mid-run frame outside a crossfade never re-spreads `GAME_CONFIG.colors` (60x/sec). */
const ZONE_STEADY_COLORS: Record<string, RenderColors> = Object.fromEntries(
  Object.entries(ZONE_PALETTES).map(([zoneId, palette]) => [
    zoneId,
    { ...GAME_CONFIG.colors, ...palette },
  ]),
);

type GamePhase = "ready" | "running" | "cleared" | "gameover";

/** CORE-06: localStorage key for the persisted best score. */
const BEST_SCORE_KEY = "vertical-rush.best";

export default function App() {
  const [phase, setPhase] = createSignal<GamePhase>("ready");
  const [level, setLevel] = createSignal(1);
  const [distance, setDistance] = createSignal(0);
  const [coins, setCoins] = createSignal(0);
  const [collectedScore, setCollectedScore] = createSignal(0);
  const [bestScore, setBestScore] = createSignal(0);

  let rootEl!: HTMLDivElement;
  let canvasEl!: HTMLCanvasElement;
  let ctx!: CanvasRenderingContext2D;
  let rafId = 0;
  let offscreen!: OffscreenSurface;
  let displayFit!: DisplayFit;
  // Populated once loadSpriteSheets resolves; drawPlayer/drawEntity fall back to
  // primitive shapes for any id still missing here (RND-INV-1).
  let sheets: SheetImages = {};

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
    items: [] as EntityInstance[],
    dust: [] as Particle[],
    itemBurst: [] as Particle[],
    sparks: [] as Particle[],
    speedLines: [] as SpeedLine[],
    nextSpawn: SPAWN_GAP.initialDelay,
    safeLane: 1,
    gemZonesSeen: new Set<string>(),
    shakeTime: 0,
    bgOffset: 0,
    prevLevel: 1,
    bannerTime: 0,
    /** CORE-05: seconds remaining before a tap/keypress may restart the run, set on entering cleared/gameover. */
    terminalLockTime: 0,
    /** SPEC-CORE zone transitions: the zone crossfading FROM, and seconds remaining in that crossfade. */
    zoneFadeFrom: ZONE_TABLE[0].id,
    zoneFadeTime: 0,
    /** AUD-03: whether the BGM is currently ducked for a showing zone banner. */
    bgmDucked: false,
    dustCarry: 0,
    playerAnimState: "idle" as PlayerAnimState,
    playerAnimStateTime: 0,
    playerFacing: 1 as 1 | -1,
    switchHoldTime: 0,
  };

  const laneCenterX = (lane: number) =>
    view.roadPad + view.laneWidth * (lane + 0.5);

  const pxPerUnit = () => view.h * GAME_CONFIG.speedRatio;

  /** Shared level->animation-speed curve for both the fallback sin-bob and the sprite run cycle. */
  const animSpeedFactor = (level: number) => 0.75 + level * 0.25;

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
    sim.items = [];
    sim.dust = [];
    sim.itemBurst = [];
    sim.sparks = [];
    sim.nextSpawn = SPAWN_GAP.initialDelay;
    sim.safeLane = sim.playerLane;
    sim.gemZonesSeen.clear();
    sim.shakeTime = 0;
    sim.prevLevel = 1;
    sim.bannerTime = 0;
    sim.terminalLockTime = 0;
    sim.zoneFadeFrom = ZONE_TABLE[0].id;
    sim.zoneFadeTime = 0;
    sim.bgmDucked = false;
    sim.dustCarry = 0;
    sim.playerAnimState = "idle";
    sim.playerAnimStateTime = 0;
    sim.playerFacing = 1;
    sim.switchHoldTime = 0;
  };

  const start = () => {
    sfx.unlock();
    resetSim();
    setLevel(1);
    setDistance(0);
    setCoins(0);
    setCollectedScore(0);
    setPhase("running");
    sfx.startBgm(ZONE_TABLE[0].id);
  };

  /** CORE-05: restarts unless still within the post-terminal-phase lockout window; always a no-op while running. */
  const retry = () => {
    if (sim.terminalLockTime > 0) {
      return;
    }
    start();
  };

  /** CORE-06: updates the persisted best score if this run's final score beats it. */
  const finishRun = () => {
    const score = calculateScore(distance(), collectedScore());
    if (score <= bestScore()) {
      return;
    }
    setBestScore(score);
    try {
      localStorage.setItem(BEST_SCORE_KEY, String(score));
    } catch {
      // localStorage unavailable (private mode); best score just won't persist.
    }
  };

  const moveLane = (dir: -1 | 1) => {
    const next = Math.min(
      GAME_CONFIG.laneCount - 1,
      Math.max(0, sim.playerLane + dir),
    );
    if (next !== sim.playerLane) {
      sim.playerLane = next;
      sim.playerFacing = dir;
      sim.switchHoldTime = GAME_CONFIG.playerSwitchDuration;
      sfx.dash();
    }
  };

  const handlePointerDown = (e: PointerEvent) => {
    sfx.unlock();
    if (phase() === "running") {
      e.preventDefault();
      const rect = rootEl.getBoundingClientRect();
      moveLane(e.clientX - rect.left < rect.width / 2 ? -1 : 1);
      return;
    }
    retry();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const p = phase();
    if (p === "running") {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") {
        return;
      }
      sfx.unlock();
      moveLane(e.key === "ArrowLeft" ? -1 : 1);
      return;
    }
    if (p === "cleared" || p === "gameover") {
      sfx.unlock();
      retry();
    }
  };

  const spawnObstacleRow = () => {
    const { zone, start, end } = zoneRangeAt(sim.distance);
    const zoneSpawn = SPAWN_TABLE[zone.id];
    const result = spawnRow(
      GAME_CONFIG.laneCount,
      sim.safeLane,
      GAME_CONFIG.spawn.doubleChance,
      Math.random,
    );
    sim.safeLane = result.safeLane;
    sim.obstacles.push(
      ...positionObstacleRow(
        zone.id,
        result.blockedLanes,
        sim.safeLane,
        GAME_CONFIG.laneCount,
        laneCenterX,
        pxPerUnit(),
        Math.random,
      ),
    );
    if (rollsCoinTrail(zoneSpawn.itemChance, Math.random)) {
      sim.items.push(
        ...positionCoinTrail(sim.safeLane, laneCenterX, pxPerUnit()),
      );
    }
    if (
      shouldSpawnGem(zone.id, sim.distance, (start + end) / 2, sim.gemZonesSeen)
    ) {
      sim.gemZonesSeen.add(zone.id);
      sim.items.push(positionGem(sim.safeLane, laneCenterX));
    }
  };

  const collectItems = (items: CollectedItem[], at: Box) => {
    let coinsCollected = 0;
    let scoreCollected = 0;
    for (const item of items) {
      sfx[item.sfx]();
      emitSparks(
        sim.itemBurst,
        at,
        GAME_CONFIG.particles.itemBurst,
        item.defId === ENTITY_DEFS.gem.id
          ? GAME_CONFIG.colors.duskTeal
          : GAME_CONFIG.colors.gold,
      );
      if (item.defId === ENTITY_DEFS.coin.id) {
        coinsCollected++;
      }
      scoreCollected += item.score;
    }
    setCoins((n) => n + coinsCollected);
    setCollectedScore((s) => s + scoreCollected);
  };

  const crash = (player: Box) => {
    setPhase("gameover");
    sim.terminalLockTime = GAME_CONFIG.retryLockout;
    finishRun();
    sfx.gameOver();
    sfx.stopBgm();
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
    sim.animTime += dt * animSpeedFactor(info.level);

    if (info.level !== sim.prevLevel) {
      sim.zoneFadeFrom =
        ZONE_TABLE.find((z) => z.level === sim.prevLevel)?.id ??
        sim.zoneFadeFrom;
      sim.zoneFadeTime = GAME_CONFIG.zoneCrossfadeDuration;
      sim.prevLevel = info.level;
      setLevel(info.level);
      sim.bannerTime = GAME_CONFIG.bannerDuration;
      sfx.levelUp();
      const toZone = ZONE_TABLE.find((z) => z.level === info.level);
      if (toZone) {
        sfx.setBgmZone(toZone.id);
      }
    }

    setDistance(Math.floor(sim.distance));

    sim.playerX +=
      (laneCenterX(sim.playerLane) - sim.playerX) *
      (1 - Math.exp(-GAME_CONFIG.laneEaseRate * dt));

    while (sim.distance >= sim.nextSpawn) {
      spawnObstacleRow();
      sim.nextSpawn += spawnGapForZone(sim.distance);
    }

    // Reaching the goal wins over a same-frame collision.
    if (isGameCleared(sim.distance, GAME_CONFIG.targetDistance)) {
      setPhase("cleared");
      sim.terminalLockTime = GAME_CONFIG.retryLockout;
      finishRun();
      sfx.clear();
      sfx.stopBgm();
      return;
    }

    const player = playerBox();
    if (advanceObstacles(sim.obstacles, scroll, view.h, player, dt)) {
      crash(player);
      return;
    }

    const collected = advanceItems(sim.items, scroll, view.h, player);
    if (collected.length > 0) {
      collectItems(collected, player);
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

  const updateAmbient = (dt: number, runningLevel: LevelInfo | null) => {
    const running = runningLevel !== null;
    if (!running) {
      sim.bgOffset += view.h * GAME_CONFIG.idle.scrollRatio * dt;
      if (phase() === "ready") {
        sim.animTime += dt * GAME_CONFIG.idle.animRate;
      }
    }
    updateParticles(sim.dust, dt);
    updateParticles(sim.itemBurst, dt, GAME_CONFIG.particles.itemBurst.gravity);
    updateParticles(sim.sparks, dt, GAME_CONFIG.particles.spark.gravity);
    sim.shakeTime = Math.max(0, sim.shakeTime - dt);
    sim.bannerTime = Math.max(0, sim.bannerTime - dt);
    sim.zoneFadeTime = Math.max(0, sim.zoneFadeTime - dt);
    sim.terminalLockTime = Math.max(0, sim.terminalLockTime - dt);
    const bannerShowing = sim.bannerTime > 0;
    if (bannerShowing !== sim.bgmDucked) {
      sim.bgmDucked = bannerShowing;
      sfx.setBgmDucked(bannerShowing);
    }
    const lineSpeed = running
      ? runningLevel.speed * GAME_CONFIG.speedLines.speedFactor
      : GAME_CONFIG.speedLines.idleSpeed;
    advanceSpeedLines(
      sim.speedLines,
      view,
      lineSpeed * pxPerUnit() * dt,
      GAME_CONFIG.speedLines.length,
    );
  };

  /** Picks Poco's sprite animation state from game phase + a post-lane-change hold window. */
  const desiredPlayerAnimState = (): PlayerAnimState => {
    if (phase() === "gameover") {
      return "crash";
    }
    if (phase() === "cleared") {
      return "victory";
    }
    if (sim.switchHoldTime > 0) {
      return "switch";
    }
    return phase() === "running" ? "run" : "idle";
  };

  /** Resets the state-local frame timer whenever the state changes, so one-shot animations (switch/crash) replay from frame 0. */
  const updatePlayerAnim = (dt: number, runningLevel: LevelInfo | null) => {
    sim.switchHoldTime = Math.max(0, sim.switchHoldTime - dt);
    const next = desiredPlayerAnimState();
    // "run" speeds up with the zone (SPEC-WORLD Poco animation table), matching the fallback sin-bob's curve.
    const animDt =
      next === "run" && runningLevel
        ? dt * animSpeedFactor(runningLevel.level)
        : dt;
    if (next !== sim.playerAnimState) {
      sim.playerAnimState = next;
      sim.playerAnimStateTime = 0;
    } else {
      sim.playerAnimStateTime += animDt;
    }
  };

  /** SPEC-CORE zone transitions: the current zone's road/sky colors, crossfaded from `sim.zoneFadeFrom` over `zoneCrossfadeDuration`. Only builds a fresh object during the ~2s crossfade window; steady state returns the precomputed `ZONE_STEADY_COLORS` entry. */
  const frameColors = (): RenderColors => {
    const toZoneId = zoneRangeAt(sim.distance).zone.id;
    if (sim.zoneFadeTime <= 0) {
      return ZONE_STEADY_COLORS[toZoneId];
    }
    const t = 1 - sim.zoneFadeTime / GAME_CONFIG.zoneCrossfadeDuration;
    const from = ZONE_PALETTES[sim.zoneFadeFrom];
    const to = ZONE_PALETTES[toZoneId];
    return {
      ...GAME_CONFIG.colors,
      cobbleMid: lerpHexColor(from.cobbleMid, to.cobbleMid, t),
      cobbleLight: lerpHexColor(from.cobbleLight, to.cobbleLight, t),
      duskPurple: lerpHexColor(from.duskPurple, to.duskPurple, t),
    };
  };

  // Built once; render() only ever swaps `.colors` instead of allocating a
  // fresh FrameConfig every frame (every other field is static per session).
  const frameConfig: FrameConfig = {
    targetDistance: GAME_CONFIG.targetDistance,
    speedRatio: GAME_CONFIG.speedRatio,
    playerYRatio: GAME_CONFIG.playerYRatio,
    laneCount: GAME_CONFIG.laneCount,
    shake: GAME_CONFIG.shake,
    bannerDuration: GAME_CONFIG.bannerDuration,
    font: GAME_CONFIG.font,
    colors: GAME_CONFIG.colors,
  };

  const render = () => {
    frameConfig.colors = frameColors();
    renderFrame(offscreen.ctx, {
      view,
      sim,
      player: playerBox(),
      level: level(),
      config: frameConfig,
      defs: ENTITY_DEFS,
      sheets,
    });
    blitFrame(ctx, offscreen.canvas, displayFit);
  };

  onMount(() => {
    try {
      const saved = Number(localStorage.getItem(BEST_SCORE_KEY));
      if (Number.isFinite(saved) && saved > 0) {
        setBestScore(saved);
      }
    } catch {
      // localStorage unavailable (private mode); best score defaults to 0.
    }
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
    // Fire-and-forget: the game is playable via fallback shapes before/without this resolving (RND-INV-1).
    loadSpriteSheets(SPRITE_SHEETS).then((loaded) => {
      sheets = loaded;
    });
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", handleKeyDown);
    let last = performance.now();
    const frame = (ts: number) => {
      const dt = Math.min((ts - last) / 1000, 0.05);
      last = ts;
      const running = phase() === "running";
      if (running) {
        updateGame(dt);
      }
      const runningLevel = running ? calculateLevel(sim.distance) : null;
      updateAmbient(dt, runningLevel);
      updatePlayerAnim(dt, runningLevel);
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

  /** Shared coins/score/best line for the cleared/gameover result overlays (CORE-04, CORE-06). */
  const scoreLine = () => (
    <>
      コイン {coins()}枚 / スコア {calculateScore(distance(), collectedScore())}
      <br />
      ベスト {bestScore()}
    </>
  );

  const overlay = (
    title: JSX.Element,
    titleClass: string,
    caption: JSX.Element,
    buttonLabel: string,
  ) => (
    <div class={styles.overlay}>
      <h1 class={`${styles.title} ${titleClass}`}>{title}</h1>
      <p class={styles.caption}>{caption}</p>
      <Button class={styles.button} onClick={retry}>
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
          <span class={styles.coinCount}>🪙{coins()}</span>
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
            <>
              {GAME_CONFIG.targetDistance}m 完走！ お見事！
              <br />
              {scoreLine()}
              <br />
              タップでもう一度
            </>,
            "もう一度走る",
          )}
        </Show>
        <Show when={phase() === "gameover"}>
          {overlay(
            "Game Over",
            styles.titleOver,
            <>
              {distance()}m 地点でクラッシュ…
              <br />
              {scoreLine()}
              <br />
              タップでリトライ
            </>,
            "リトライ",
          )}
        </Show>
      </div>
    </div>
  );
}
