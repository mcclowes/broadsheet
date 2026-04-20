// Rasterises public/icons/icon-maskable.svg to a 512x512 PNG for the PWA
// manifest's maskable icon slot. Re-run when the source SVG changes:
//
//   node scripts/build-maskable-icon.mjs
//
// Android adaptive-icon launchers crop the outer 20% of a maskable icon,
// so the source SVG must be full-bleed (no rounded corners) with the mark
// constrained to the inner 80% safe-zone circle.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../public/icons/icon-maskable.svg");
const out = resolve(
  here,
  "../public/icons/android-chrome-512x512-maskable.png",
);

const svg = readFileSync(src);
const png = await sharp(svg)
  .resize(512, 512)
  .png({ compressionLevel: 9 })
  .toBuffer();
writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
