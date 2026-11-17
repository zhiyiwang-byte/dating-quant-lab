#!/usr/bin/env node
/**
 * Sync `index.html` (single source of truth) into:
 *   1. `public/index.html`
 *   2. `HTML_PAGE` embedded template literal inside `bun_server.ts`
 *
 * Usage:
 *   node scripts/sync.mjs          # sync targets
 *   node scripts/sync.mjs --check  # verify byte-for-byte consistency (exit 1 if drifted)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_HTML = path.join(ROOT, "index.html");
const PUBLIC_HTML = path.join(ROOT, "public", "index.html");
const BUN_SERVER = path.join(ROOT, "bun_server.ts");

const HTML_MARKER_START = "const HTML_PAGE = `";
const HTML_MARKER_END = "`;\n\nBun.serve({";

function escapeForTemplateLiteral(text) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

function buildUpdatedBunServer(currentTs, htmlContent) {
  const startIdx = currentTs.indexOf(HTML_MARKER_START);
  if (startIdx === -1) {
    throw new Error(`Could not find start marker "${HTML_MARKER_START}" in bun_server.ts`);
  }
  const endIdx = currentTs.indexOf(HTML_MARKER_END, startIdx);
  if (endIdx === -1) {
    throw new Error(`Could not find end marker "${HTML_MARKER_END.trim()}" in bun_server.ts`);
  }
  const escaped = escapeForTemplateLiteral(htmlContent);
  return (
    currentTs.slice(0, startIdx + HTML_MARKER_START.length) +
    escaped +
    currentTs.slice(endIdx)
  );
}

function extractBunHtml(currentTs) {
  const startIdx = currentTs.indexOf(HTML_MARKER_START);
  const endIdx = currentTs.indexOf(HTML_MARKER_END, startIdx);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error("Could not extract HTML_PAGE template literal from bun_server.ts");
  }
  const literal = currentTs.slice(startIdx + "const HTML_PAGE = ".length, endIdx + 1);
  return new Function(`return ${literal};`)();
}

const checkOnly = process.argv.includes("--check");
const sourceHtml = fs.readFileSync(SOURCE_HTML, "utf8");
const publicHtmlExists = fs.existsSync(PUBLIC_HTML);
const currentPublicHtml = publicHtmlExists ? fs.readFileSync(PUBLIC_HTML, "utf8") : "";
const currentBunTs = fs.readFileSync(BUN_SERVER, "utf8");

if (checkOnly) {
  const mismatches = [];
  if (currentPublicHtml !== sourceHtml) {
    mismatches.push("public/index.html differs from index.html");
  }
  try {
    const bunHtml = extractBunHtml(currentBunTs);
    if (bunHtml !== sourceHtml) {
      mismatches.push("bun_server.ts HTML_PAGE differs from index.html");
    }
  } catch (err) {
    mismatches.push(String(err));
  }
  if (mismatches.length > 0) {
    console.error("Sync check failed:\n- " + mismatches.join("\n- "));
    process.exit(1);
  }
  console.log("OK: index.html, public/index.html, and bun_server.ts are byte-for-byte in sync.");
  process.exit(0);
}

fs.mkdirSync(path.dirname(PUBLIC_HTML), { recursive: true });
fs.writeFileSync(PUBLIC_HTML, sourceHtml, "utf8");

const updatedBunTs = buildUpdatedBunServer(currentBunTs, sourceHtml);
fs.writeFileSync(BUN_SERVER, updatedBunTs, "utf8");

// Verify round-trip decoding
if (extractBunHtml(updatedBunTs) !== sourceHtml) {
  throw new Error("Round-trip verification failed for bun_server.ts HTML_PAGE");
}
console.log("Synced index.html -> public/index.html and bun_server.ts successfully.");
