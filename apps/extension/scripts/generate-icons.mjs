// Regenerates icons/icon{16,48,128}.png from a procedural pixel function.
// Run with `npm run extension:icons` (or `node apps/extension/scripts/generate-icons.mjs`).
//
// Design: accent-coloured background with three centred white horizontal
// lines, evoking a column of article text. Matches the web app's --accent
// colour so the toolbar icon and site share a visual identity.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function makePng(size, pixel) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour with alpha
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const scanlineBytes = size * 4;
  const raw = Buffer.alloc(size * (1 + scanlineBytes));
  for (let y = 0; y < size; y++) {
    const base = y * (1 + scanlineBytes);
    raw[base] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y, size);
      const off = base + 1 + x * 4;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = a;
    }
  }
  const idat = deflateSync(raw);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const ACCENT = [180, 69, 31, 255]; // #b4451f
const WHITE = [255, 255, 255, 255];

function pixel(x, y, size) {
  const marginX = Math.round(size * 0.2);
  const lineCount = 3;
  const lineThickness = Math.max(1, Math.round(size * 0.09));
  const spacing = Math.max(1, Math.round(size * 0.09));
  const totalHeight = lineCount * lineThickness + (lineCount - 1) * spacing;
  const startY = Math.round((size - totalHeight) / 2);
  if (x >= marginX && x < size - marginX) {
    for (let i = 0; i < lineCount; i++) {
      const lineY = startY + i * (lineThickness + spacing);
      if (y >= lineY && y < lineY + lineThickness) return WHITE;
    }
  }
  return ACCENT;
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "..", "icons");
mkdirSync(outDir, { recursive: true });

for (const size of [16, 48, 128]) {
  const buf = makePng(size, pixel);
  const file = resolve(outDir, `icon${size}.png`);
  writeFileSync(file, buf);
  console.log(`wrote ${file} (${buf.length} bytes)`);
}
