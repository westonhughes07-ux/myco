/* ============================================================
   MYCO gate suite — Strand Pairs mechanic.
   1) Generator invariants, using the PAGE'S OWN flowGen source
      (extracted and evaluated, so tests can never drift from ship).
   2) Full boot + solve in jsdom via the debugSolve hook.
   ============================================================ */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
let pass = 0, fail = 0;
function ok(name, cond, note) {
  if (cond) { pass++; console.log(" PASS  " + name + (note ? "  -> " + note : "")); }
  else { fail++; console.log("*FAIL* " + name + (note ? "  -> " + note : "")); }
}

/* ---------- extract the page's generator verbatim ---------- */
function extract(name) {
  const i = html.indexOf("function " + name);
  if (i < 0) throw new Error(name + " not found");
  let d = 0, j = i, seen = false;
  for (; j < html.length; j++) {
    if (html[j] === "{") { d++; seen = true; }
    if (html[j] === "}") { d--; if (seen && d === 0) { j++; break; } }
  }
  return html.slice(i, j);
}
const src = extract("mulberry32") + "\n" + extract("hash") + "\n" +
  "var DIRS4=[[0,-1],[1,0],[0,1],[-1,0]];\n" + extract("flowGen") +
  "\n;({flowGen:flowGen})";
const { flowGen } = eval("(function(){" + src.replace(";({flowGen:flowGen})", ";return {flowGen:flowGen};") + "})()");

console.log("--- GENERATOR (page-extracted source) ---");
let allOK = true, detail = "";
for (const N of [5, 6, 7, 8, 9]) {
  for (let d = 0; d < 40; d++) {
    const g = flowGen("gate-" + N + "-" + d, N);
    const seen = new Array(N * N).fill(0);
    let minLen = 1e9, orthoOK = true;
    for (const seg of g.sol) {
      minLen = Math.min(minLen, seg.length);
      for (let i = 0; i < seg.length; i++) {
        seen[seg[i]]++;
        if (i > 0) {
          const a = seg[i - 1], b = seg[i];
          const dist = Math.abs(a % N - b % N) + Math.abs(((a / N) | 0) - ((b / N) | 0));
          if (dist !== 1) orthoOK = false;
        }
      }
    }
    const coverage = seen.every(v => v === 1);
    const pairsOK = g.pairs.every((p, k) => p[0] === g.sol[k][0] && p[1] === g.sol[k][g.sol[k].length - 1]);
    if (!(coverage && orthoOK && pairsOK && minLen >= 3 && g.K === Math.max(3, N - 1))) {
      allOK = false; detail = `N=${N} d=${d} cov=${coverage} ortho=${orthoOK} pairs=${pairsOK} minLen=${minLen} K=${g.K}`;
      break;
    }
  }
  if (!allOK) break;
}
ok("200 boards: full coverage, orthogonal segments, len>=3, K correct", allOK, detail || "5x5..9x9 x40 each");

const g1 = flowGen("relay-2026-08-20", 7), g2 = flowGen("relay-2026-08-20", 7), g3 = flowGen("relay-2026-08-21", 7);
ok("same seed -> identical board", JSON.stringify(g1.sol) === JSON.stringify(g2.sol));
ok("different seed -> different board", JSON.stringify(g1.sol) !== JSON.stringify(g3.sol));

/* ---------- boot the real page ---------- */
console.log("--- RUNTIME (jsdom) ---");
const errors = [];
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "https://example.test/",
  beforeParse(w) {
    w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));
    w.requestAnimationFrame = cb => setTimeout(cb, 16);
    w.navigator.clipboard = { writeText: t => { w.__copied = t; return Promise.resolve(); } };
    w.AudioContext = undefined; w.webkitAudioContext = undefined;
    w.Element.prototype.animate = w.Element.prototype.animate || function(){ return { onfinish: null, effect:{target:this} }; };
    w.Element.prototype.setPointerCapture = function(){};
    w.onerror = (m) => errors.push("onerror: " + m);
    const ce = w.console.error.bind(w.console);
    w.console.error = (...a) => { errors.push("console.error: " + a.join(" ")); ce(...a); };
  }
});
const w = dom.window, d = w.document;

setTimeout(() => {
  try {
    ok("board built", d.querySelectorAll("#board .c").length === 49, d.querySelectorAll("#board .c").length + " cells");
    ok("strand svg present", !!d.getElementById("strands"));
    const goal = d.getElementById("pr").textContent;
    ok("HUD shows 3-star strand goal", /\d/.test(goal), goal);
    const K = Math.max(3, 7 - 1);
    ok("goal equals K+2", parseInt(goal.replace(/[^0-9]/g, ""), 10) === K + 2, goal + " vs K=" + K);
    ok("endpoint sporelings drawn", (d.getElementById("strands").innerHTML.match(/<rect/g) || []).length >= K * 2,
       "stalks: " + (d.getElementById("strands").innerHTML.match(/<rect/g) || []).length);

    /* archive gate is date-aware */
    const at = d.querySelector('[data-mode="archive"]');
    const pno = parseInt(d.getElementById("pno").textContent, 10) || 1;
    ok("archive lock matches history", at.disabled === (pno <= 1), "puzzle " + pno + " disabled=" + at.disabled);

    /* solve via the page's own hook */
    const before = parseInt(d.getElementById("cityLit").textContent, 10) || 0;
    w.__game.debugSolve();
    setTimeout(() => {
      try {
        ok("solve fills the board", d.getElementById("lc").textContent === "49", d.getElementById("lc").textContent + "/49");
        setTimeout(() => {
          try {
            ok("win modal opens", d.getElementById("win").classList.contains("on"));
            const stars = d.querySelectorAll("#stars .star:not(.off)").length;
            ok("perfect solve = 3 stars", stars === 3, stars + " stars (moves=" + d.getElementById("wm").textContent + ")");
            ok("city wakes a sporeling", (parseInt(d.getElementById("cityLit").textContent, 10) || 0) > before,
               before + " -> " + d.getElementById("cityLit").textContent);
            const s = JSON.parse(w.localStorage.getItem("relay.v2") || "{}");
            ok("streak recorded", (s.streak || 0) >= 1, "streak=" + s.streak);
            ok("stats persisted", (s.solved || 0) >= 1 && (s.stars || 0) >= 3, JSON.stringify({solved:s.solved,stars:s.stars}));
            d.getElementById("share").click();
            setTimeout(() => {
              const copied = w.__copied || "";
              console.log("--- SHARE CARD ---\n" + copied);
              ok("share includes stars + strands", /[★☆]/.test(copied) && copied.includes("strands"));
              ok("share reveals no board data", !/[0-9]{3,}/.test(copied.replace(/https[^\s]*/, "").replace(/No\.\d+/, "")), "clean");
              ok("no JS errors", errors.length === 0, errors.slice(0, 3).join(" | ") || "clean");
              console.log("\n================  " + pass + " passed, " + fail + " failed  ================");
              process.exit(fail ? 1 : 0);
            }, 120);
          } catch (e) { console.error("stage3:", e); process.exit(1); }
        }, 700);
      } catch (e) { console.error("stage2:", e); process.exit(1); }
    }, 100);
  } catch (e) { console.error("stage1:", e); process.exit(1); }
}, 900);
