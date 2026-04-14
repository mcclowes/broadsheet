// Cuts a Chrome Web Store release: bumps manifest.json, packages the zip,
// commits + tags the bump, and opens the Developer Dashboard + zip location.
//
// Usage:
//   npm run extension:release -- patch     # 1.2.3 -> 1.2.4
//   npm run extension:release -- minor     # 1.2.3 -> 1.3.0
//   npm run extension:release -- major     # 1.2.3 -> 2.0.0
//   npm run extension:release -- 1.4.2     # explicit version
//
// Flags:
//   --no-commit   bump + package only, don't git commit/tag
//   --no-open     don't open the dashboard / reveal the zip

import { execFileSync, execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const extDir = resolve(here, "..");
const repoRoot = resolve(extDir, "..", "..");
const manifestPath = resolve(extDir, "manifest.json");

const STORE_DASHBOARD_URL = "https://chrome.google.com/webstore/devconsole";

const args = process.argv.slice(2);
const bump = args.find((a) => !a.startsWith("--"));
const noCommit = args.includes("--no-commit");
const noOpen = args.includes("--no-open");

if (!bump) {
  console.error(
    "usage: npm run extension:release -- <patch|minor|major|x.y.z> [--no-commit] [--no-open]",
  );
  process.exit(1);
}

const gitStatus = execSync("git status --porcelain", { cwd: repoRoot })
  .toString()
  .trim();
if (gitStatus && !noCommit) {
  console.error(
    "working tree is dirty — commit or stash first, or pass --no-commit",
  );
  console.error(gitStatus);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const current = manifest.version;
if (!/^\d+\.\d+\.\d+$/.test(current)) {
  console.error(`current manifest.json version is invalid: ${current}`);
  process.exit(1);
}

function nextVersion(cur, kind) {
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  const [maj, min, pat] = cur.split(".").map(Number);
  if (kind === "patch") return `${maj}.${min}.${pat + 1}`;
  if (kind === "minor") return `${maj}.${min + 1}.0`;
  if (kind === "major") return `${maj + 1}.0.0`;
  throw new Error(`unknown bump: ${kind}`);
}

const next = nextVersion(current, bump);
if (next === current) {
  console.error(`version unchanged (${current})`);
  process.exit(1);
}

console.log(`bumping ${current} -> ${next}`);
manifest.version = next;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

execFileSync("node", [resolve(here, "package.mjs")], {
  cwd: repoRoot,
  stdio: "inherit",
});

const chromeZipPath = resolve(
  extDir,
  "dist",
  `broadsheet-extension-chrome-${next}.zip`,
);
const firefoxZipPath = resolve(
  extDir,
  "dist",
  `broadsheet-extension-firefox-${next}.zip`,
);
const safariStageDir = resolve(
  extDir,
  "dist",
  `broadsheet-extension-safari-${next}`,
);

if (!noCommit) {
  execFileSync("git", ["add", manifestPath], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  execFileSync("git", ["commit", "-m", `chore(extension): release v${next}`], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  execFileSync("git", ["tag", `extension-v${next}`], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  console.log(`committed and tagged extension-v${next} (not pushed)`);
}

console.log(`\n✓ packaged:`);
console.log(`    chrome:  ${chromeZipPath}`);
console.log(`    firefox: ${firefoxZipPath}`);
console.log(
  `    safari:  ${safariStageDir}/ (feed to xcrun safari-web-extension-converter)`,
);
console.log("\nNext steps:");
console.log(`  1. Upload the Chrome zip to the Chrome Web Store dashboard`);
console.log(`  2. Upload the Firefox zip to addons.mozilla.org`);
console.log(
  `  3. On macOS, wrap the Safari bundle (see apps/extension/README.md)`,
);
console.log(`  4. Submit each for review`);
if (!noCommit) {
  console.log(`  5. git push && git push origin extension-v${next}`);
}

if (!noOpen && process.platform === "darwin") {
  execFileSync("open", ["-R", chromeZipPath]);
  execFileSync("open", [STORE_DASHBOARD_URL]);
}
