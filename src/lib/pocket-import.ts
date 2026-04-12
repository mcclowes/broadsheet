import { z } from "zod";

export interface PocketItem {
  url: string;
  title: string;
  savedAt: string;
  tags: string[];
  archived: boolean;
}

export interface PocketAnnotationHighlight {
  text: string;
  createdAt: string;
}

export interface PocketAnnotation {
  url: string;
  title: string;
  highlights: PocketAnnotationHighlight[];
}

export interface ParsedPocketExport {
  items: PocketItem[];
  annotations: PocketAnnotation[];
}

// RFC 4180-ish CSV parser. Handles quoted fields, escaped quotes (""), CRLF.
function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""));
}

function pocketTimeToIso(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return new Date().toISOString();
  // Pocket CSV `time_added` is unix seconds.
  return new Date(n * 1000).toISOString();
}

function splitTags(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split("|")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function parsePocketCsv(csv: string): PocketItem[] {
  const rows = parseCsv(csv);
  if (rows.length === 0) return [];
  const [header, ...dataRows] = rows;
  const idx = {
    title: header.indexOf("title"),
    url: header.indexOf("url"),
    time: header.indexOf("time_added"),
    tags: header.indexOf("tags"),
    status: header.indexOf("status"),
  };
  if (idx.url < 0) {
    throw new Error("Pocket CSV is missing a 'url' column");
  }
  const items: PocketItem[] = [];
  for (const row of dataRows) {
    const url = (row[idx.url] ?? "").trim();
    if (!url || !isValidHttpUrl(url)) continue;
    const title = (idx.title >= 0 ? row[idx.title] : "")?.trim() ?? "";
    const time = idx.time >= 0 ? row[idx.time] : "";
    const tags = splitTags(idx.tags >= 0 ? (row[idx.tags] ?? "") : "");
    const status = (idx.status >= 0 ? row[idx.status] : "")?.trim() ?? "";
    items.push({
      url,
      title: title || url,
      savedAt: pocketTimeToIso(time ?? ""),
      tags,
      archived: status === "archive",
    });
  }
  return items;
}

const pocketAnnotationSchema = z.object({
  url: z.string(),
  title: z.string().optional().default(""),
  highlights: z
    .array(
      z.object({
        quote: z.string(),
        created_at: z.union([z.number(), z.string()]).optional(),
      }),
    )
    .default([]),
});

export function parsePocketAnnotations(json: string): PocketAnnotation[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    // Swallow the native parser message — it can include positional context
    // that isn't useful to the user and might expose internals if surfaced
    // through an error handler that passes `err.message` back to the client.
    throw new Error("Pocket annotations JSON is not valid JSON");
  }
  if (!Array.isArray(raw)) {
    throw new Error("Pocket annotations JSON must be an array");
  }
  const out: PocketAnnotation[] = [];
  for (const entry of raw) {
    const parsed = pocketAnnotationSchema.safeParse(entry);
    if (!parsed.success) continue;
    if (!isValidHttpUrl(parsed.data.url)) continue;
    const highlights: PocketAnnotationHighlight[] = [];
    for (const h of parsed.data.highlights) {
      const text = (h.quote ?? "").trim();
      if (!text) continue;
      const createdAt =
        typeof h.created_at === "number"
          ? pocketTimeToIso(String(h.created_at))
          : typeof h.created_at === "string" && h.created_at.length > 0
            ? h.created_at
            : new Date().toISOString();
      highlights.push({ text, createdAt });
    }
    if (highlights.length === 0) continue;
    out.push({
      url: parsed.data.url,
      title: parsed.data.title,
      highlights,
    });
  }
  return out;
}

export function parsePocketExport(input: {
  csv: string;
  annotations?: string;
}): ParsedPocketExport {
  return {
    items: parsePocketCsv(input.csv),
    annotations: input.annotations
      ? parsePocketAnnotations(input.annotations)
      : [],
  };
}
