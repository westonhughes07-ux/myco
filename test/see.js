#!/usr/bin/env node
/**
 * see.js — give the coding agent eyes. $0, local, no account, no API key.
 *
 *   node see.js <url-or-file> [--vp 1280x720] [--tall] [--full] [--out shot.png]
 *   node see.js <url-or-file> --sweep              # multi-viewport layout audit
 *   node see.js <url-or-file> --film 6 --step 8    # deterministic animation strip
 *   node see.js <url-or-file> --baseline           # write/compare golden image
 *
 * Then the agent runs Read on the emitted .png and actually sees it.
 *
 * Verified on Windows 11, Node 24.17, Playwright 1.62.1, Chromium 1234.
 */
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch').default || require('pixelmatch'); // 7.x is ESM
const path = require('path');
const fs = require('fs');

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i === -1 ? d : (argv[i + 1] ?? true); };
const has = n => argv.includes('--' + n);

const rawTarget = argv[0];
if (!rawTarget) { console.error('usage: node see.js <url-or-file> [options]'); process.exit(1); }
const target = /^https?:\/\//.test(rawTarget)
  ? rawTarget
  : 'file:///' + path.resolve(rawTarget).replace(/\\/g, '/');

// Real-GPU first, SwiftShader as fallback. Never pass --disable-gpu blindly with system Chrome.
const LAUNCH = { args: ['--use-gl=angle', '--use-angle=gl', '--enable-unsafe-swiftshader'] };

const SWEEP = [
  ['mobile', 390, 844], ['tablet', 820, 1180], ['laptop', 1280, 720],
  ['desktop', 1920, 1080], ['tall', 1440, 2560],
];

// Wait for the app to say it's ready; fall back to a short settle.
async function settle(page) {
  try { await page.waitForFunction('window.__ready || window.gameReady', null, { timeout: 8000 }); }
  catch { await page.waitForTimeout(400); }
}

async function audit(page) {
  return page.evaluate(() => {
    let maxBottom = 0;
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) maxBottom = Math.max(maxBottom, r.bottom);
    }
    return {
      contentBottom: Math.round(maxBottom),
      vh: innerHeight, vw: innerWidth,
      scrollW: document.documentElement.scrollWidth,
    };
  });
}

(async () => {
  const browser = await chromium.launch(LAUNCH);
  const errors = [];

  const newPage = async (w, h) => {
    const p = await browser.newPage({ viewport: { width: w, height: h } });
    p.on('pageerror', e => errors.push(String(e).slice(0, 120)));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)); });
    return p;
  };

  if (has('sweep')) {
    const rows = [];
    for (const [name, w, h] of SWEEP) {
      const p = await newPage(w, h);
      await p.goto(target, { waitUntil: 'load' });
      await settle(p);
      await p.screenshot({ path: 'vp-' + name + '.png' });
      const m = await audit(p);
      const dead = m.vh - m.contentBottom;
      const pct = +(100 * dead / m.vh).toFixed(1);
      const flags = [];
      if (pct > 30) flags.push('DEAD_SPACE ' + dead + 'px/' + pct + '%');
      if (m.scrollW > m.vw) flags.push('H_OVERFLOW ' + m.scrollW + '>' + m.vw);
      rows.push({ viewport: name + ' ' + w + 'x' + h, deadPct: pct, flags: flags.join(' ') || 'ok' });
      await p.close();
    }
    console.table(rows);

  } else if (has('film')) {
    const n = +flag('film', 6), step = +flag('step', 8);
    const [w, h] = String(flag('vp', '480x240')).split('x').map(Number);
    const p = await newPage(w, h);
    await p.goto(target); await settle(p);
    const shots = [];
    for (let i = 0; i < n; i++) {
      // prefers an app-exposed deterministic stepper; else just waits
      const stepped = await p.evaluate(s => (typeof window.__step === 'function' ? (window.__step(s), true) : false), step);
      if (!stepped) await p.waitForTimeout(120);
      shots.push(PNG.sync.read(await p.screenshot()));
    }
    const cols = 2, rows = Math.ceil(n / cols);
    const sheet = new PNG({ width: shots[0].width * cols, height: shots[0].height * rows });
    shots.forEach((s, i) =>
      PNG.bitblt(s, sheet, 0, 0, s.width, s.height, (i % cols) * s.width, Math.floor(i / cols) * s.height));
    fs.writeFileSync('filmstrip.png', PNG.sync.write(sheet));
    console.log('wrote filmstrip.png', sheet.width + 'x' + sheet.height, 'frames=' + n);

  } else {
    const [w, h] = String(flag('vp', has('tall') ? '1440x2560' : '1280x720')).split('x').map(Number);
    const out = String(flag('out', 'shot.png'));
    const p = await newPage(w, h);
    await p.goto(target, { waitUntil: 'load' });
    await settle(p);
    await p.screenshot({ path: out, fullPage: has('full') });
    const m = await audit(p);
    console.log('wrote', out, w + 'x' + h, '| deadBelow',
      (m.vh - m.contentBottom) + 'px', '| scrollW', m.scrollW);

    if (has('baseline')) {
      const gold = out.replace(/\.png$/, '.golden.png');
      if (!fs.existsSync(gold)) { fs.copyFileSync(out, gold); console.log('baseline created ->', gold); }
      else {
        const a = PNG.sync.read(fs.readFileSync(gold)), b = PNG.sync.read(fs.readFileSync(out));
        if (a.width !== b.width || a.height !== b.height) console.log('BASELINE SIZE MISMATCH');
        else {
          const d = new PNG({ width: a.width, height: a.height });
          const n = pixelmatch(a.data, b.data, d.data, a.width, a.height, { threshold: 0.1 });
          fs.writeFileSync('diff.png', PNG.sync.write(d));
          const pct = +(100 * n / (a.width * a.height)).toFixed(3);
          console.log(n === 0 ? 'BASELINE MATCH' : 'BASELINE DIFF ' + n + 'px (' + pct + '%) -> diff.png');
        }
      }
    }
  }

  if (errors.length) console.log('PAGE ERRORS:', [...new Set(errors)].slice(0, 5));
  await browser.close();
})();
