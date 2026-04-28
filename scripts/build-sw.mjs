#!/usr/bin/env node
// Generates public/sw.js from public/sw.template.js, performing two
// substitutions:
//   - __CACHE_VERSION__  → a deploy-unique value (#129)
//   - // @@INLINE_STRATEGIES → the exported helpers from public/sw-strategies.js,
//     with `export` keywords stripped (#135 — single source of truth shared
//     with src/lib/sw-strategies.test.ts).
//
// Runs as `prebuild` and as `predev` so the SW is always present for both
// production builds and local dev. On Vercel, VERCEL_GIT_COMMIT_SHA is set.
// Falls back to `git rev-parse` locally, and to `dev` if neither is
// available.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = resolve(__dirname, "..", "public", "sw.template.js");
const STRATEGIES_PATH = resolve(__dirname, "..", "public", "sw-strategies.js");
const OUTPUT_PATH = resolve(__dirname, "..", "public", "sw.js");
const VERSION_SENTINEL = "__CACHE_VERSION__";
const STRATEGIES_SENTINEL = "// @@INLINE_STRATEGIES";

function resolveVersion() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12);
  }
  try {
    return execSync("git rev-parse --short=12 HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

// Strip ESM `export` keywords so the helpers can be pasted into a classic SW
// (sw.js is registered with no `type: "module"` in service-worker-register.tsx).
// Deliberately minimal — the strategies file is kept plain JS specifically
// so this is the only transform needed.
function stripExports(source) {
  return source.replace(/^export\s+(async\s+)?function/gm, (_, asyncKeyword) =>
    asyncKeyword ? `${asyncKeyword}function` : "function",
  );
}

const version = resolveVersion();
const template = await readFile(TEMPLATE_PATH, "utf8");
const strategies = stripExports(await readFile(STRATEGIES_PATH, "utf8"));

if (!template.includes(STRATEGIES_SENTINEL)) {
  throw new Error(
    `public/sw.template.js is missing the ${STRATEGIES_SENTINEL} sentinel`,
  );
}

const output = template
  .replace(STRATEGIES_SENTINEL, strategies.trim())
  .replaceAll(VERSION_SENTINEL, version);
await writeFile(OUTPUT_PATH, output, "utf8");
console.log(`[build-sw] wrote public/sw.js (CACHE_VERSION=${version})`);
