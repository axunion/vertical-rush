---
name: verify
description: Verify vertical-rush (SolidJS canvas run game) end-to-end in a real browser. Use after changing game logic, rendering, or UI to confirm the game starts, moves lanes, crashes, and clears.
---

# Verify vertical-rush

## Launch

```bash
pnpm dev --port 5199 --strictPort   # background; ready when curl returns 200
```

## Drive (no Playwright installed; use system Chrome + puppeteer-core)

Install `puppeteer-core` in a scratch dir and launch
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` headless with a
390x844 `isMobile` viewport.

Key techniques that work:

- **Deterministic scenarios** via `page.evaluateOnNewDocument("Math.random = () => X")`:
  - `X = 0.4` → safe lane stays center → an idle player **clears** at 240m (~24s).
  - `X = 0.9` → obstacle lands on the player's lane → **crash** within ~5s.
- **Player lane position**: locate the player by scanning canvas pixels for the
  rust-red key color `#D95763` (tolerance ±40; must track
  `GAME_CONFIG.colors.rustRed` in `src/config.ts`). Since
  P2, the game draws to a fixed 180×320 offscreen buffer that's integer-scaled
  and letterboxed onto the display canvas — the canvas element can
  have real top/bottom letterbox bars, so the scan row must be derived from
  the canvas's own backing-store size (`canvas.width`/`canvas.height` already
  **are** the device-pixel size the app sized the canvas to — no need to
  re-derive it from `getBoundingClientRect()` × `devicePixelRatio`):

  ```js
  const k = Math.max(1, Math.floor(Math.min(canvas.width / 180, canvas.height / 320)));
  const dy = Math.floor((canvas.height - 320 * k) / 2);
  // 320*0.78 = player's fixed logical top (playerYRatio); +16 = half its 32px height.
  const row = dy + Math.round((320 * 0.78 + 16) * k);
  ```

  Then `getImageData(0, row, canvas.width, 1)` and scan for `#D95763`
  (tolerance ±40 per channel). At the mandated 390×844 viewport (dpr 1) this
  works out to roughly canvas.width=390, canvas.height=693, k=2, dy≈26,
  row≈557 — sanity-check against the actual numbers if the scan comes up
  empty.
- **Overlay detection**: match `document.body.innerText` case-insensitively —
  titles are CSS `text-transform: uppercase`, so innerText is "GAME OVER", not "Game Over".
- Taps: `page.mouse.click(60, 500)` = left lane step, `(330, 500)` = right.
- Start/retry buttons are the only `<button>` elements; `page.$$("button")[0]`.

## Gotchas

- Missing `/assets/*.png` returns **200 text/html** (Vite SPA fallback), not 404 —
  the image `onerror` fallback still engages; don't assert on request failures.
- Level thresholds: LV.2 past 50m (~7s), LV.3 past 150m (~17s), clear at 240m (~24s).

## Instant retry lockout

After driving a run to `cleared` or `gameover` (either scenario above), verify
the 0.4s retry lockout (`GAME_CONFIG.retryLockout`):

1. Immediately after the terminal phase is reached, click the retry/start
   button (`page.$$("button")[0]`) or tap the play area.
2. Assert the terminal overlay is still showing (`document.body.innerText`
   still contains "GAME OVER" or "GOAL!") — the tap during the lockout window
   must **not** restart the run.
3. Wait ~450ms (past the 0.4s lockout).
4. Click/tap again and assert the overlay is gone and the HUD distance reads
   `0m` — the run has restarted straight into `running` (never back through
   the `ready` screen).
