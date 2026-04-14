// Packages the extension into per-browser zips under dist/:
//
//   dist/broadsheet-extension-chrome-<version>.zip
//   dist/broadsheet-extension-firefox-<version>.zip
//   dist/broadsheet-extension-safari-<version>/          (unzipped source tree)
//
// Run with `npm run extension:package [-- --target=chrome|firefox|safari|all]`.
// Default target is `all`. The version is read from manifest.json; bump there
// before tagging a release.
//
// Per-browser manifests are produced by deep-merging `manifest.<target>.json`
// onto the base `manifest.json`. A null in the override removes the key (used
// to strip `service_worker` from the Firefox background block).
//
// Chrome and Firefox produce zips ready for upload to the Chrome Web Store /
// AMO. Safari produces an unzipped source tree intended to be fed into
// `xcrun safari-web-extension-converter` on a macOS machine with Xcode — see
// README for the full flow.
//
// Shells out to `zip` (present on macOS, Linux, and Git Bash / WSL on
// Windows) to keep the repo free of build-only node dependencies.

import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const extDir = resolve(here, "..");
const distDir = resolve(extDir, "dist");

// Files that ship in a build. Manifests are handled separately — the target
// manifest is generated from base + override.
const SHIPPED = [
  "background.js",
  "popup.html",
  "popup.js",
  "options.html",
  "options.js",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
];

const TARGETS = ["chrome", "firefox", "safari"];

function parseArgs(argv) {
  let target = "all";
  for (const arg of argv) {
    if (arg.startsWith("--target=")) {
      target = arg.slice("--target=".length);
    }
  }
  if (target !== "all" && !TARGETS.includes(target)) {
    console.error(
      `unknown --target=${target}. Valid: ${[...TARGETS, "all"].join(", ")}`,
    );
    process.exit(1);
  }
  return target === "all" ? TARGETS : [target];
}

function deepMerge(base, override) {
  if (override === null) return null;
  if (typeof override !== "object" || Array.isArray(override)) return override;
  const out = Array.isArray(base) ? [...base] : { ...(base ?? {}) };
  for (const [key, value] of Object.entries(override)) {
    if (key.startsWith("_")) continue; // strip `_comment` etc.
    if (value === null) {
      delete out[key];
      continue;
    }
    if (
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof out[key] === "object" &&
      out[key] !== null &&
      !Array.isArray(out[key])
    ) {
      out[key] = deepMerge(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function buildManifest(base, target) {
  const overridePath = resolve(extDir, `manifest.${target}.json`);
  if (!existsSync(overridePath)) return base;
  const override = JSON.parse(readFileSync(overridePath, "utf8"));
  return deepMerge(base, override);
}

function stageFiles(stageDir) {
  for (const rel of SHIPPED) {
    const src = resolve(extDir, rel);
    if (!existsSync(src)) {
      console.error(`missing required file: ${rel}`);
      process.exit(1);
    }
    const dest = resolve(stageDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest);
  }
}

function packageTarget(target, baseManifest, version) {
  const manifest = buildManifest(baseManifest, target);
  const stageName = `broadsheet-extension-${target}-${version}`;
  const stageDir = resolve(distDir, stageName);
  rmSync(stageDir, { recursive: true, force: true });
  mkdirSync(stageDir, { recursive: true });

  stageFiles(stageDir);
  writeFileSync(
    resolve(stageDir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );

  if (target === "safari") {
    console.log(`staged ${stageDir} (feed to safari-web-extension-converter)`);
    return;
  }

  const zipPath = resolve(distDir, `${stageName}.zip`);
  rmSync(zipPath, { force: true });
  execFileSync("zip", ["-q", "-r", zipPath, "manifest.json", ...SHIPPED], {
    cwd: stageDir,
    stdio: "inherit",
  });
  // Once zipped, the staging tree is no longer needed.
  rmSync(stageDir, { recursive: true, force: true });
  console.log(`packaged ${zipPath}`);
}

const targets = parseArgs(process.argv.slice(2));

const baseManifest = JSON.parse(
  readFileSync(resolve(extDir, "manifest.json"), "utf8"),
);
const version = baseManifest.version;
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(
    `manifest.json version must be semver major.minor.patch, got ${version}`,
  );
  process.exit(1);
}

mkdirSync(distDir, { recursive: true });

for (const target of targets) {
  packageTarget(target, baseManifest, version);
}
