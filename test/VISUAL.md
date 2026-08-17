# Visual QA — mandatory before claiming any UI works

## The rule

**Do not claim a visual feature works until you have screenshotted it and looked at it.**

This is not optional process decoration. During the build session the agent had no working
screenshot path (browser pane would not composite, Chrome extension disconnected, external URLs
policy-blocked) and fell back to jsdom. jsdom caught real *logic* bugs but is **structurally
incapable** of catching visual ones — on a canvas-rendered page `document.body.innerText` is `""`.

Two real defects were found *only* by eventually looking:

1. **Unlit wire contrast was too low.** `--dead` was `#252d39` against a `#0b0e14` board — the wire
   shapes were nearly invisible. Players plan moves by reading those shapes, so this made the
   puzzle unreadable rather than moody. Raised to `#4d5a6e`.
2. **Dead space on tall viewports** (found first by a parallel Lovable build that could screenshot
   itself, then reproduced here by `--sweep`). Fixed by vertically centring the layout.

## Setup — $0, no account, no API key

```bash
npm install playwright
npx playwright install chromium
```

For anything drawing to a canvas, launch with real GPU (≈9x faster than software):

```js
chromium.launch({ args: ['--use-gl=angle','--use-angle=gl','--enable-unsafe-swiftshader'] })
```

## Gates

```bash
node test/gates.js                       # 19 logic gates (jsdom) - must be 19/19
node test/see.js index.html --sweep      # layout audit across 5 viewports - must be all 'ok'
node test/see.js index.html --out s.png  # screenshot, then LOOK at it
```

`--sweep` checks dead space and horizontal overflow at mobile / tablet / laptop / desktop / tall.
It is the gate that catches the "huge empty gap under the board" class of bug automatically.

## Known gotchas

- `page.accessibility` was **removed** in Playwright 1.62 — code using it throws.
- Playwright's default screenshot-diff threshold is lax; a real 0.42% layout regression passes at
  `maxDiffPixelRatio: 0.01`. Tighten to `0.001` or it will wave real bugs through.
- `pixelmatch` 7.x is ESM — under `require()` on Node 24 you need `.default`.
- `--disable-gpu` is safe under Playwright's bundled Chromium but breaks WebGL in the system
  Chrome CLI path. Prefer Playwright.
