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
  - `X = 0.4` → safe lane stays center → an idle player **clears** at 500m (~65s).
  - `X = 0.9` → obstacle lands on the player's lane → **crash** within ~5s.
- **Player lane position**: read the game canvas with `getImageData` and scan the
  row at `cssH * 0.78 + playerHeight/2` for the body color `#ff7a29` (tolerance ±40).
- **Overlay detection**: match `document.body.innerText` case-insensitively —
  titles are CSS `text-transform: uppercase`, so innerText is "GAME OVER", not "Game Over".
- Taps: `page.mouse.click(60, 500)` = left lane step, `(330, 500)` = right.
- Start/retry buttons are the only `<button>` elements; `page.$$("button")[0]`.

## Gotchas

- Missing `/assets/*.png` returns **200 text/html** (Vite SPA fallback), not 404 —
  the image `onerror` fallback still engages; don't assert on request failures.
- Level thresholds: LV.2 past 100m (~20s), LV.3 past 300m (~45s), clear at 500m (~65s).
