#!/usr/bin/env node
// Generates public/sw.js from public/sw.template.js, substituting the
// CACHE_VERSION sentinel with a deploy-unique value so each release gets
// its own cache bucket and prior caches are purged on activate (#129).
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
const OUTPUT_PATH = resolve(__dirname, "..", "public", "sw.js");
const SENTINEL = "__CACHE_VERSION__";

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

const version = resolveVersion();
const template = await readFile(TEMPLATE_PATH, "utf8");
const output = template.replaceAll(SENTINEL, version);
await writeFile(OUTPUT_PATH, output, "utf8");
console.log(`[build-sw] wrote public/sw.js (CACHE_VERSION=${version})`);
