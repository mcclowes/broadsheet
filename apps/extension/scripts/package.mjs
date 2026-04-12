// Packages the Chrome extension into dist/broadsheet-extension-<version>.zip,
// ready for upload to the Chrome Web Store.
//
// Run with `npm run extension:package`. The version is read from
// manifest.json; bump there before tagging a release.
//
// Shells out to `zip` (present on macOS, Linux, and Git Bash / WSL on
// Windows) to keep the repo free of build-only node dependencies.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const extDir = resolve(here, "..");
const distDir = resolve(extDir, "dist");

// Files that ship to the Web Store. Everything else (README, scripts,
// dist/, etc.) is excluded.
const SHIPPED = [
  "manifest.json",
  "background.js",
  "popup.html",
  "popup.js",
  "options.html",
  "options.js",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
];

for (const rel of SHIPPED) {
  if (!existsSync(resolve(extDir, rel))) {
    console.error(`missing required file: ${rel}`);
    process.exit(1);
  }
}

const manifest = JSON.parse(
  readFileSync(resolve(extDir, "manifest.json"), "utf8"),
);
const version = manifest.version;
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(
    `manifest.json version must be semver major.minor.patch, got ${version}`,
  );
  process.exit(1);
}

mkdirSync(distDir, { recursive: true });
const zipName = `broadsheet-extension-${version}.zip`;
const zipPath = resolve(distDir, zipName);
rmSync(zipPath, { force: true });

execFileSync("zip", ["-q", "-r", `dist/${zipName}`, ...SHIPPED], {
  cwd: extDir,
  stdio: "inherit",
});

console.log(`packaged ${zipPath}`);
