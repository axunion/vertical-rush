import type { createSfx } from "./audio";
import type { GamePhase } from "./config";
import { BEST_SCORE_KEY, GAME_CONFIG } from "./config";
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
  ZONE_TABLE,
  zoneRangeAt,
} from "./gameLogic";
// Imports the node-safe submodules directly, not the "./render" barrel: the
// barrel re-exports DOM-only files with a module-level `new DOMMatrix()`,
// which throws under Vitest's node environment.
import {
  advanceSpeedLines,
  emitDust,
  emitSparks,
  updateParticles,
} from "./render/particles";
import type {
  Particle,
  PlayerAnimState,
  SpeedLine,
  View,
} from "./render/types";

export interface GameControllerHooks {
  getPhase: () => GamePhase;
  setPhase: (phase: GamePhase) => void;
  setLevel: (level: number) => void;
  setDistance: (distance: number) => void;
  getDistance: () => number;
  setCoins: (updater: (n: number) => number) => void;
  setCollectedScore: (updater: (n: number) => number) => void;
  getCollectedScore: () => number;
  getBestScore: () => number;
  setBestScore: (score: number) => void;
}

// Static across the whole session; built once instead of per-frame.
const DUST_COLORS = [
  GAME_CONFIG.colors.gold,
  GAME_CONFIG.colors.warmWhite,
  GAME_CONFIG.colors.terracotta,
] as const;

/** Shared level->animation-speed curve for both the fallback sin-bob and the sprite run cycle. */
const animSpeedFactor = (level: number) => 0.75 + level * 0.25;

/**
 * Owns the per-frame simulation state (`sim`) and every update/spawn/collision
 * step, Solid-free (`sfx` and the phase/score signal accessors are injected
 * as explicit parameters, not imported).
 */
export function createGameController(
  view: View,
  sfx: ReturnType<typeof createSfx>,
  hooks: GameControllerHooks,
) {
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

  const playerBox = (): Box => ({
    x: sim.playerX - PLAYER_SIZE.w / 2,
    y: view.h * GAME_CONFIG.playerYRatio,
    width: PLAYER_SIZE.w,
    height: PLAYER_SIZE.h,
  });

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

  /** CORE-06: updates the persisted best score if this run's final score beats it. */
  const finishRun = () => {
    const score = calculateScore(
      hooks.getDistance(),
      hooks.getCollectedScore(),
    );
    if (score <= hooks.getBestScore()) {
      return;
    }
    hooks.setBestScore(score);
    try {
      localStorage.setItem(BEST_SCORE_KEY, String(score));
    } catch {
      // localStorage unavailable (private mode); best score just won't persist.
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
    hooks.setCoins((n) => n + coinsCollected);
    hooks.setCollectedScore((s) => s + scoreCollected);
  };

  const crash = (player: Box) => {
    hooks.setPhase("gameover");
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
      hooks.setLevel(info.level);
      sim.bannerTime = GAME_CONFIG.bannerDuration;
      sfx.levelUp();
      const toZone = ZONE_TABLE.find((z) => z.level === info.level);
      if (toZone) {
        sfx.setBgmZone(toZone.id);
      }
    }

    hooks.setDistance(Math.floor(sim.distance));

    sim.playerX +=
      (laneCenterX(sim.playerLane) - sim.playerX) *
      (1 - Math.exp(-GAME_CONFIG.laneEaseRate * dt));

    while (sim.distance >= sim.nextSpawn) {
      spawnObstacleRow();
      sim.nextSpawn += spawnGapForZone(sim.distance);
    }

    // Reaching the goal wins over a same-frame collision.
    if (isGameCleared(sim.distance, GAME_CONFIG.targetDistance)) {
      hooks.setPhase("cleared");
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
        DUST_COLORS,
      );
    }
  };

  const updateAmbient = (dt: number, runningLevel: LevelInfo | null) => {
    const running = runningLevel !== null;
    if (!running) {
      sim.bgOffset += view.h * GAME_CONFIG.idle.scrollRatio * dt;
      if (hooks.getPhase() === "ready") {
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
    if (hooks.getPhase() === "gameover") {
      return "crash";
    }
    if (hooks.getPhase() === "cleared") {
      return "victory";
    }
    if (sim.switchHoldTime > 0) {
      return "switch";
    }
    return hooks.getPhase() === "running" ? "run" : "idle";
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

  return {
    sim,
    playerBox,
    resetSim,
    moveLane,
    updateGame,
    updateAmbient,
    updatePlayerAnim,
  };
}
