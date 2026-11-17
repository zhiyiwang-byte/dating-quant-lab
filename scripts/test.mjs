#!/usr/bin/env node
/**
 * Zero-dependency smoke & regression tests for Dating Quant Lab.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import moduleApi from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const publicHtml = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
const bunTs = fs.readFileSync(path.join(ROOT, "bun_server.ts"), "utf8");

// 1. Byte-for-byte sync checks
assert.equal(publicHtml, indexHtml, "public/index.html must match index.html");
const m = bunTs.match(/const HTML_PAGE = (`[\s\S]*?`);\n\nBun\.serve\(\{/);
assert.ok(m, "HTML_PAGE literal must exist in bun_server.ts");
const decodedBunHtml = new Function(`return ${m[1]};`)();
assert.equal(decodedBunHtml, indexHtml, "bun_server.ts HTML_PAGE must match index.html");

// 2. TypeScript syntax check for bun_server.ts
const stripped = moduleApi.stripTypeScriptTypes
  ? moduleApi.stripTypeScriptTypes(bunTs)
  : bunTs;
new Function(stripped.replace(/^import .*$/gm, ""));

// 3. Extract inline <script> from index.html and run DOM-stubbed functional tests
const scriptMatch = indexHtml.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
assert.ok(scriptMatch, "Inline <script> block must exist in index.html");
const scriptBody = scriptMatch[1];

// Syntax check inline JS
new Function(scriptBody);

function createMockDOM() {
  const elements = new Map();
  const vetoCheckboxes = Array.from({ length: 4 }, () => ({ checked: false }));

  function getEl(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        textContent: "",
        innerHTML: "",
        value: "",
        className: "",
        checked: id === "toggle-dynamic",
        classList: {
          add() {},
          remove() {},
        },
        select() {},
        focus() {},
        querySelector() {
          return null;
        },
        dataset: {},
      });
    }
    return elements.get(id);
  }

  const document = {
    activeElement: null,
    getElementById: getEl,
    querySelectorAll(selector) {
      if (selector === ".veto-check") return vetoCheckboxes;
      return [];
    },
  };

  const store = new Map();
  const localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
  };

  const window = {
    location: {
      href: "https://dating-quant-web-production.up.railway.app/",
      hash: "",
    },
  };

  const navigator = {
    clipboard: {
      writeText: async () => {},
    },
  };

  return { document, localStorage, window, navigator, fetch: async () => ({ ok: false }), setTimeout: () => 0 };
}

function bootApp(initialHash = "") {
  const env = createMockDOM();
  env.window.location.hash = initialHash;
  const wrapped = `
    return (function(document, localStorage, window, navigator, fetch, setTimeout) {
      ${scriptBody}
      return {
        DIMENSIONS,
        quantAnswers,
        scoreTouched,
        scoreSource,
        userAbVotes,
        cohortStats,
        computeQuantScore,
        filledCount,
        isRoleComplete,
        answerQuant,
        resetCurrentTarget,
        setEditTarget,
        applyPresetProfile,
        computeUtility,
        choosePairwise,
        copyShareUrl,
        loadStateFromHash,
        buildSanitizedPayload,
        renderDashboard,
        recalculateAll,
        getWindow: () => window,
        getDoc: () => document
      };
    });
  `;
  const factory = new Function(wrapped)();
  return factory(env.document, env.localStorage, env.window, env.navigator, env.fetch, env.setTimeout);
}

// Test A: Initial state starts at 0/8 for both roles (no premature score leak)
{
  const app = bootApp();
  assert.equal(app.filledCount("self"), 0);
  assert.equal(app.filledCount("cand"), 0);
  assert.equal(app.isRoleComplete("self"), false);
  assert.equal(app.isRoleComplete("cand"), false);
  assert.equal(app.getDoc().getElementById("self-score-display").textContent, "—");
  assert.equal(app.getDoc().getElementById("cand-score-display").textContent, "—");
  assert.equal(app.getDoc().getElementById("delta-z-badge").textContent, "ΔZ = —");
}

// Test B: Objective questionnaire scoring computes weighted 0.5-rounded score and allows clearing back to 0
{
  const app = bootApp();
  // net_worth q0 (w=0.7) -> opt 3 (score 6), q1 (w=0.3) -> opt 1 (score 7.5)
  // weighted avg = 0.7*6 + 0.3*7.5 = 4.2 + 2.25 = 6.45 -> nearest 0.5 is 6.5
  app.answerQuant("net_worth", 0, "3");
  app.answerQuant("net_worth", 1, "1");
  const qRes = app.computeQuantScore("net_worth", "cand");
  assert.equal(qRes.score, 6.5);
  assert.equal(qRes.answered, 2);
  assert.equal(app.filledCount("cand"), 1);
  assert.equal(app.DIMENSIONS[0].candScore, 6.5);

  // Clear both dropdowns -> filledCount drops back to 0
  app.answerQuant("net_worth", 0, "");
  app.answerQuant("net_worth", 1, "");
  assert.equal(app.filledCount("cand"), 0);
  assert.equal(app.scoreTouched.cand.net_worth, undefined);
}

// Test C: Completion unlocks verdict & share URL hash reproduces full state cleanly
{
  const app = bootApp();
  app.setEditTarget("cand");
  app.applyPresetProfile("beijing_house");
  app.setEditTarget("self");
  app.applyPresetProfile("hexagon");
  assert.equal(app.isRoleComplete("cand"), true);
  assert.equal(app.isRoleComplete("self"), true);
  assert.notEqual(app.getDoc().getElementById("delta-z-badge").textContent, "ΔZ = —");

  app.copyShareUrl();
  const sharedHash = app.getWindow().location.hash;
  assert.ok(sharedHash.startsWith("#state="));

  const restored = bootApp(sharedHash);
  assert.equal(restored.isRoleComplete("cand"), true);
  assert.equal(restored.isRoleComplete("self"), true);
  assert.equal(
    restored.getDoc().getElementById("delta-z-badge").textContent,
    app.getDoc().getElementById("delta-z-badge").textContent
  );

  // Legacy share link compatibility ({w, s, c} without st)
  const legacyHash = "#state=" + encodeURIComponent(JSON.stringify({
    w: [14, 15, 10, 14, 12, 15, 10, 10],
    s: [7, 7, 7, 7, 7, 7, 7, 7],
    c: [6, 6, 6, 6, 6, 6, 6, 6],
  }));
  const legacyApp = bootApp(legacyHash);
  assert.equal(legacyApp.isRoleComplete("self"), true);
  assert.equal(legacyApp.isRoleComplete("cand"), true);
  assert.equal(legacyApp.scoreSource.cand.net_worth, "hash");
}

// Test D: Tie votes in ab_Choice_stats render accurate A / tie / B split instead of dumping tie into B
{
  const app = bootApp();
  app.cohortStats.ab_Choice_stats["0"] = { A: 2, B: 2, tie: 4 };
  app.renderDashboard();
  const abHtml = app.getDoc().getElementById("dashboard-ab-bars").innerHTML;
  assert.ok(abHtml.includes("选A 25% · 平局 50% · 选B 25%"), `Unexpected AB tie summary: ${abHtml}`);
}

console.log("All smoke and regression tests passed.");
