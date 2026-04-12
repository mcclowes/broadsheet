import { JSDOM } from "jsdom";

/**
 * Common shape for an article parsed from any import format.
 * Fields map to ArticleFrontmatter but don't require ingest.
 */
export interface ImportedItem {
  url: string;
  title: string;
  tags: string[];
  savedAt: string; // ISO 8601
  isRead: boolean;
  isArchived: boolean;
}

export type ImportFormat = "pocket" | "instapaper" | "omnivore";

export interface ImportResult {
  format: ImportFormat;
  items: ImportedItem[];
}

// ---------------------------------------------------------------------------
// Pocket — HTML bookmark export
// ---------------------------------------------------------------------------

export function parsePocketExport(html: string): ImportResult {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const items: ImportedItem[] = [];

  let currentSection: "unread" | "archive" = "unread";

  // Pocket uses <h1> headings to delimit "Unread" and "Read Archive" sections,
  // with <ul><li><a> items under each.
  const nodes = doc.querySelectorAll("h1, li > a");
  for (const node of nodes) {
    if (node.tagName === "H1") {
      const text = node.textContent?.toLowerCase() ?? "";
      currentSection = text.includes("archive") ? "archive" : "unread";
      continue;
    }

    // It's an <a> tag inside an <li>
    const anchor = node as HTMLAnchorElement;
    const href = anchor.getAttribute("href");
    if (!href) continue;

    try {
      // Validate it's a real URL
      new URL(href);
    } catch {
      continue;
    }

    const title = anchor.textContent?.trim() || href;
    const timeAdded = anchor.getAttribute("time_added");
    const tagsAttr = anchor.getAttribute("tags");

    const savedAt = timeAdded
      ? new Date(Number(timeAdded) * 1000).toISOString()
      : new Date().toISOString();

    const tags =
      tagsAttr && tagsAttr.trim()
        ? tagsAttr
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

    items.push({
      url: href,
      title,
      tags,
      savedAt,
      isRead: currentSection === "archive",
      isArchived: currentSection === "archive",
    });
  }

  return { format: "pocket", items };
}

// ---------------------------------------------------------------------------
// Instapaper — CSV export
// ---------------------------------------------------------------------------

/**
 * Minimal RFC 4180 CSV parser. Handles quoted fields with embedded commas,
 * newlines, and escaped double-quotes.
 */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let i = 0;

  while (i < text.length) {
    const row: string[] = [];

    while (i < text.length) {
      let field = "";

      if (text[i] === '"') {
        // Quoted field
        i++; // skip opening quote
        while (i < text.length) {
          if (text[i] === '"') {
            if (i + 1 < text.length && text[i + 1] === '"') {
              field += '"';
              i += 2;
            } else {
              i++; // skip closing quote
              break;
            }
          } else {
            field += text[i];
            i++;
          }
        }
      } else {
        // Unquoted field
        while (
          i < text.length &&
          text[i] !== "," &&
          text[i] !== "\r" &&
          text[i] !== "\n"
        ) {
          field += text[i];
          i++;
        }
      }

      row.push(field);

      if (i < text.length && text[i] === ",") {
        i++; // skip comma, continue to next field
      } else {
        break; // end of row
      }
    }

    // Skip line terminators
    if (i < text.length && text[i] === "\r") i++;
    if (i < text.length && text[i] === "\n") i++;

    // Skip empty trailing rows
    if (row.length === 1 && row[0] === "" && i >= text.length) break;

    rows.push(row);
  }

  return rows;
}

function detectInstapaperTimestamp(value: string): Date {
  const n = Number(value);
  if (isNaN(n) || n === 0) return new Date();
  // If > 10 billion, assume milliseconds; otherwise seconds
  return n > 10_000_000_000 ? new Date(n) : new Date(n * 1000);
}

export function parseInstapaperExport(csv: string): ImportResult {
  const rows = parseCsvRows(csv);
  if (rows.length < 2) return { format: "instapaper", items: [] };

  // First row is headers: URL,Title,Selection,Folder,Timestamp
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const urlIdx = header.indexOf("url");
  const titleIdx = header.indexOf("title");
  const folderIdx = header.indexOf("folder");
  const timestampIdx = header.indexOf("timestamp");

  if (urlIdx === -1) return { format: "instapaper", items: [] };

  const items: ImportedItem[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const url = row[urlIdx]?.trim();
    if (!url) continue;

    try {
      new URL(url);
    } catch {
      continue;
    }

    const title = (titleIdx >= 0 ? row[titleIdx]?.trim() : "") || url;
    const folder = (folderIdx >= 0 ? row[folderIdx]?.trim() : "") || "";
    const timestamp = timestampIdx >= 0 ? row[timestampIdx]?.trim() : "";

    const savedAt = timestamp
      ? detectInstapaperTimestamp(timestamp).toISOString()
      : new Date().toISOString();

    const folderLower = folder.toLowerCase();
    const isArchived = folderLower === "archive";
    const isRead = isArchived;

    // Map custom Instapaper folders to tags (skip built-in folders)
    const tags: string[] = [];
    if (
      folder &&
      folderLower !== "unread" &&
      folderLower !== "archive" &&
      folderLower !== "starred"
    ) {
      tags.push(folder.toLowerCase().replace(/\s+/g, "-"));
    }
    if (folderLower === "starred") {
      tags.push("starred");
    }

    items.push({ url, title, tags, savedAt, isRead, isArchived });
  }

  return { format: "instapaper", items };
}

// ---------------------------------------------------------------------------
// Omnivore — JSON export
// ---------------------------------------------------------------------------

interface OmnivoreLabel {
  name: string;
}

interface OmnivoreItem {
  url?: string;
  originalUrl?: string;
  title?: string;
  labels?: OmnivoreLabel[];
  savedAt?: string;
  isArchived?: boolean;
  readAt?: string | null;
  state?: string;
}

export function parseOmnivoreExport(json: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { format: "omnivore", items: [] };
  }

  // Omnivore exports as a top-level array, or sometimes nested
  let articles: OmnivoreItem[];
  if (Array.isArray(data)) {
    articles = data;
  } else if (typeof data === "object" && data !== null && "data" in data) {
    // Handle GraphQL-style export wrapper
    const inner = data as Record<string, unknown>;
    const edges = (inner.data as Record<string, unknown>)?.search as Record<
      string,
      unknown
    >;
    articles = ((edges?.edges as Array<Record<string, unknown>>) ?? []).map(
      (e) => e.node as OmnivoreItem,
    );
  } else {
    return { format: "omnivore", items: [] };
  }

  const items: ImportedItem[] = [];

  for (const a of articles) {
    const url = a.url || a.originalUrl;
    if (!url) continue;

    try {
      new URL(url);
    } catch {
      continue;
    }

    const title = a.title?.trim() || url;
    const tags = (a.labels ?? [])
      .map((l) => l.name.toLowerCase().replace(/\s+/g, "-"))
      .filter(Boolean);

    const savedAt = a.savedAt ?? new Date().toISOString();
    const isArchived = a.isArchived === true;
    const isRead = a.readAt != null || isArchived;

    items.push({ url, title, tags, savedAt, isRead, isArchived });
  }

  return { format: "omnivore", items };
}

// ---------------------------------------------------------------------------
// Auto-detect format from file content
// ---------------------------------------------------------------------------

export function detectFormat(
  content: string,
  filename?: string,
): ImportFormat | null {
  const lower = filename?.toLowerCase() ?? "";

  // File extension hints
  if (lower.endsWith(".csv")) return "instapaper";
  if (lower.endsWith(".json")) return "omnivore";

  // Content sniffing
  const trimmed = content.trimStart();

  // JSON array or object
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) return "omnivore";

  // CSV with Instapaper header
  if (trimmed.startsWith("URL,")) return "instapaper";

  // HTML with Pocket markers
  if (
    trimmed.includes("NETSCAPE-Bookmark-file") ||
    trimmed.includes("Pocket Export") ||
    trimmed.includes("time_added")
  ) {
    return "pocket";
  }

  // Generic HTML with bookmark-like structure
  if (trimmed.includes("<") && trimmed.includes("href=")) return "pocket";

  return null;
}

export function parseImportFile(
  content: string,
  filename?: string,
): ImportResult | null {
  const format = detectFormat(content, filename);
  if (!format) return null;

  switch (format) {
    case "pocket":
      return parsePocketExport(content);
    case "instapaper":
      return parseInstapaperExport(content);
    case "omnivore":
      return parseOmnivoreExport(content);
  }
}
