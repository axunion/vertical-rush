import { Button } from "@kobalte/core/button";
import {
  createSignal,
  For,
  type JSX,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import styles from "./App.module.css";
import { createSfx } from "./audio";
import {
  BEST_SCORE_KEY,
  GAME_CONFIG,
  type GamePhase,
  ZONE_STEADY_BLEND,
} from "./config";
import { ENTITY_DEFS } from "./entities";
import { createGameController, type EffectsDisplay } from "./gameController";
import { calculateLevel, calculateScore, ZONE_TABLE } from "./gameLogic";
import {
  blitFrame,
  computeDisplayFit,
  createOffscreenCanvas,
  createSpeedLine,
  type DisplayFit,
  type FrameConfig,
  loadSpriteSheets,
  type OffscreenSurface,
  paintLetterbox,
  renderFrame,
  type SheetImages,
  sizeDisplayCanvas,
  type View,
} from "./render";
import { SPRITE_SHEETS, TILE_SHEETS } from "./sprites";
import { frameColors, frameZoneBlend } from "./zoneVisuals";

/** P11 HUD effect chips: one row per `EffectsDisplay` key, rendered when active. */
const EFFECT_CHIPS: readonly {
  key: keyof EffectsDisplay;
  icon: string;
  title: string;
}[] = [
  { key: "shield", icon: "🛡️", title: "シールド" },
  { key: "slow", icon: "⏳", title: "スロー" },
  { key: "magnet", icon: "🧲", title: "マグネット" },
];

export default function App() {
  const [phase, setPhase] = createSignal<GamePhase>("ready");
  const [level, setLevel] = createSignal(1);
  const [distance, setDistance] = createSignal(0);
  const [coins, setCoins] = createSignal(0);
  const [collectedScore, setCollectedScore] = createSignal(0);
  const [bestScore, setBestScore] = createSignal(0);
  // Custom `equals` (not the default reference check) so a fresh object
  // pushed every frame by updateAmbient still only re-renders the HUD chips
  // when a boolean actually flips.
  const [effects, setEffects] = createSignal<EffectsDisplay>(
    { shield: false, slow: false, magnet: false },
    {
      equals: (a, b) =>
        a.shield === b.shield && a.slow === b.slow && a.magnet === b.magnet,
    },
  );

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

  const controller = createGameController(view, sfx, {
    getPhase: phase,
    setPhase,
    setLevel,
    setDistance,
    getDistance: distance,
    setCoins,
    setCollectedScore,
    getCollectedScore: collectedScore,
    getBestScore: bestScore,
    setBestScore,
    setEffects,
  });
  const { sim } = controller;

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

  const start = () => {
    sfx.unlock();
    controller.resetSim();
    setLevel(1);
    setDistance(0);
    setCoins(0);
    setCollectedScore(0);
    setPhase("running");
    sfx.startBgm(ZONE_TABLE[0].id);
    sfx.startAmbient(ZONE_TABLE[0].id);
  };

  /** CORE-05: restarts unless still within the post-terminal-phase lockout window; always a no-op while running. */
  const retry = () => {
    if (sim.terminalLockTime > 0) {
      return;
    }
    start();
  };

  const handlePointerDown = (e: PointerEvent) => {
    sfx.unlock();
    if (phase() === "running") {
      e.preventDefault();
      const rect = rootEl.getBoundingClientRect();
      controller.moveLane(e.clientX - rect.left < rect.width / 2 ? -1 : 1);
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
      controller.moveLane(e.key === "ArrowLeft" ? -1 : 1);
      return;
    }
    if (p === "cleared" || p === "gameover") {
      sfx.unlock();
      retry();
    }
  };

  // Built once; render() only ever swaps `.colors`/`.zoneBlend` instead of
  // allocating a fresh FrameConfig every frame (every other field is static
  // per session).
  const frameConfig: FrameConfig = {
    targetDistance: GAME_CONFIG.targetDistance,
    speedRatio: GAME_CONFIG.speedRatio,
    playerYRatio: GAME_CONFIG.playerYRatio,
    laneCount: GAME_CONFIG.laneCount,
    shake: GAME_CONFIG.shake,
    bannerDuration: GAME_CONFIG.bannerDuration,
    font: GAME_CONFIG.font,
    colors: GAME_CONFIG.colors,
    zoneBlend: ZONE_STEADY_BLEND[ZONE_TABLE[0].id],
  };

  const render = () => {
    const zoneBlend = frameZoneBlend(
      sim.distance,
      sim.zoneFadeTime,
      sim.zoneFadeFrom,
      GAME_CONFIG.zoneCrossfadeDuration,
    );
    frameConfig.zoneBlend = zoneBlend;
    frameConfig.colors = frameColors(zoneBlend);
    renderFrame(offscreen.ctx, {
      view,
      sim,
      player: controller.playerBox(),
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
    controller.resetSim();
    // Fire-and-forget: the game is playable via fallback shapes before/without this resolving (RND-INV-1).
    loadSpriteSheets({ ...SPRITE_SHEETS, ...TILE_SHEETS }).then((loaded) => {
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
        controller.updateGame(dt);
      }
      const runningLevel = running ? calculateLevel(sim.distance) : null;
      controller.updateAmbient(dt, runningLevel);
      controller.updatePlayerAnim(dt, runningLevel);
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
          <For each={EFFECT_CHIPS.filter((chip) => effects()[chip.key])}>
            {(chip) => (
              <span class={styles.effectChip} title={chip.title}>
                {chip.icon}
              </span>
            )}
          </For>
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
