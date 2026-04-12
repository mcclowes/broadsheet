import { describe, expect, it } from "vitest";
import {
  parsePocketExport,
  parseInstapaperExport,
  parseOmnivoreExport,
  detectFormat,
  parseImportFile,
} from "./import";

// ---------------------------------------------------------------------------
// Pocket HTML parser
// ---------------------------------------------------------------------------

describe("parsePocketExport", () => {
  it("parses unread and archived sections", () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<title>Pocket Export</title>
<h1>Unread</h1>
<ul>
  <li><a href="https://example.com/a" time_added="1700000000" tags="tech,ai">First article</a></li>
  <li><a href="https://example.com/b" time_added="1700100000" tags="">Second article</a></li>
</ul>
<h1>Read Archive</h1>
<ul>
  <li><a href="https://example.com/c" time_added="1699000000" tags="science">Archived one</a></li>
</ul>`;

    const result = parsePocketExport(html);
    expect(result.format).toBe("pocket");
    expect(result.items).toHaveLength(3);

    const [a, b, c] = result.items;

    expect(a.url).toBe("https://example.com/a");
    expect(a.title).toBe("First article");
    expect(a.tags).toEqual(["tech", "ai"]);
    expect(a.isRead).toBe(false);
    expect(a.isArchived).toBe(false);
    expect(a.savedAt).toBe(new Date(1700000000 * 1000).toISOString());

    expect(b.tags).toEqual([]);

    expect(c.url).toBe("https://example.com/c");
    expect(c.isRead).toBe(true);
    expect(c.isArchived).toBe(true);
    expect(c.tags).toEqual(["science"]);
  });

  it("uses fallback title when text content is empty", () => {
    const html = `<h1>Unread</h1><ul><li><a href="https://example.com/x" time_added="1700000000" tags=""></a></li></ul>`;
    const result = parsePocketExport(html);
    expect(result.items[0].title).toBe("https://example.com/x");
  });

  it("skips entries without valid URLs", () => {
    const html = `<h1>Unread</h1><ul>
      <li><a href="not-a-url" time_added="1700000000" tags="">Bad</a></li>
      <li><a time_added="1700000000" tags="">No href</a></li>
      <li><a href="https://ok.com" time_added="1700000000" tags="">Good</a></li>
    </ul>`;
    const result = parsePocketExport(html);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].url).toBe("https://ok.com");
  });

  it("returns empty items for empty file", () => {
    const result = parsePocketExport("");
    expect(result.items).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Instapaper CSV parser
// ---------------------------------------------------------------------------

describe("parseInstapaperExport", () => {
  it("parses standard Instapaper CSV", () => {
    const csv = `URL,Title,Selection,Folder,Timestamp
https://example.com/a,My Article,,Unread,1700000000
https://example.com/b,"Title, with comma",Some highlight,Archive,1700100000
https://example.com/c,Starred One,,Starred,1699000000`;

    const result = parseInstapaperExport(csv);
    expect(result.format).toBe("instapaper");
    expect(result.items).toHaveLength(3);

    const [a, b, c] = result.items;

    expect(a.url).toBe("https://example.com/a");
    expect(a.title).toBe("My Article");
    expect(a.tags).toEqual([]);
    expect(a.isRead).toBe(false);
    expect(a.isArchived).toBe(false);

    expect(b.title).toBe("Title, with comma");
    expect(b.isArchived).toBe(true);
    expect(b.isRead).toBe(true);

    expect(c.tags).toEqual(["starred"]);
  });

  it("handles millisecond timestamps", () => {
    const csv = `URL,Title,Selection,Folder,Timestamp
https://example.com/a,Title,,Unread,1700000000000`;

    const result = parseInstapaperExport(csv);
    // Should detect ms and convert correctly
    const expectedDate = new Date(1700000000000).toISOString();
    expect(result.items[0].savedAt).toBe(expectedDate);
  });

  it("maps custom folders to tags", () => {
    const csv = `URL,Title,Selection,Folder,Timestamp
https://example.com/a,Title,,Research Papers,1700000000`;

    const result = parseInstapaperExport(csv);
    expect(result.items[0].tags).toEqual(["research-papers"]);
  });

  it("skips invalid URLs", () => {
    const csv = `URL,Title,Selection,Folder,Timestamp
not-a-url,Bad,,Unread,1700000000
https://good.com,Good,,Unread,1700000000`;

    const result = parseInstapaperExport(csv);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].url).toBe("https://good.com");
  });

  it("returns empty for CSV with only headers", () => {
    const csv = `URL,Title,Selection,Folder,Timestamp`;
    const result = parseInstapaperExport(csv);
    expect(result.items).toHaveLength(0);
  });

  it("returns empty for CSV without URL column", () => {
    const csv = `Name,Value\nfoo,bar`;
    const result = parseInstapaperExport(csv);
    expect(result.items).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Omnivore JSON parser
// ---------------------------------------------------------------------------

describe("parseOmnivoreExport", () => {
  it("parses standard Omnivore JSON array", () => {
    const json = JSON.stringify([
      {
        url: "https://example.com/a",
        title: "First",
        labels: [{ name: "Tech", color: "#07D2D1" }],
        savedAt: "2024-01-15T10:30:00.000Z",
        isArchived: false,
        readAt: null,
      },
      {
        url: "https://example.com/b",
        title: "Second",
        labels: [],
        savedAt: "2024-01-16T08:00:00.000Z",
        isArchived: true,
        readAt: "2024-01-17T00:00:00.000Z",
      },
    ]);

    const result = parseOmnivoreExport(json);
    expect(result.format).toBe("omnivore");
    expect(result.items).toHaveLength(2);

    const [a, b] = result.items;

    expect(a.url).toBe("https://example.com/a");
    expect(a.title).toBe("First");
    expect(a.tags).toEqual(["tech"]);
    expect(a.isRead).toBe(false);
    expect(a.isArchived).toBe(false);
    expect(a.savedAt).toBe("2024-01-15T10:30:00.000Z");

    expect(b.isArchived).toBe(true);
    expect(b.isRead).toBe(true);
  });

  it("handles missing optional fields", () => {
    const json = JSON.stringify([{ url: "https://example.com/minimal" }]);

    const result = parseOmnivoreExport(json);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("https://example.com/minimal");
    expect(result.items[0].tags).toEqual([]);
    expect(result.items[0].isArchived).toBe(false);
  });

  it("uses originalUrl as fallback", () => {
    const json = JSON.stringify([
      { originalUrl: "https://example.com/orig", title: "Orig" },
    ]);

    const result = parseOmnivoreExport(json);
    expect(result.items[0].url).toBe("https://example.com/orig");
  });

  it("skips entries without valid URLs", () => {
    const json = JSON.stringify([
      { title: "No URL" },
      { url: "not-a-url", title: "Bad" },
      { url: "https://good.com", title: "Good" },
    ]);

    const result = parseOmnivoreExport(json);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].url).toBe("https://good.com");
  });

  it("returns empty for invalid JSON", () => {
    const result = parseOmnivoreExport("not json at all");
    expect(result.items).toHaveLength(0);
  });

  it("returns empty for non-array JSON", () => {
    const result = parseOmnivoreExport('{"key": "value"}');
    expect(result.items).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

describe("detectFormat", () => {
  it("detects Pocket by NETSCAPE-Bookmark header", () => {
    expect(detectFormat("<!DOCTYPE NETSCAPE-Bookmark-file-1>")).toBe("pocket");
  });

  it("detects Pocket by time_added attribute", () => {
    expect(detectFormat('<a href="x" time_added="123">')).toBe("pocket");
  });

  it("detects Instapaper by CSV header", () => {
    expect(detectFormat("URL,Title,Selection,Folder,Timestamp\n")).toBe(
      "instapaper",
    );
  });

  it("detects Omnivore by JSON array start", () => {
    expect(detectFormat('[{"url":"https://x.com"}]')).toBe("omnivore");
  });

  it("uses filename extension as hint", () => {
    expect(detectFormat("some content", "export.csv")).toBe("instapaper");
    expect(detectFormat("some content", "export.json")).toBe("omnivore");
  });

  it("returns null for unrecognized content", () => {
    expect(detectFormat("random plain text")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseImportFile (integration)
// ---------------------------------------------------------------------------

describe("parseImportFile", () => {
  it("auto-detects and parses Pocket HTML", () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<h1>Unread</h1>
<ul><li><a href="https://example.com/x" time_added="1700000000" tags="a">Title</a></li></ul>`;

    const result = parseImportFile(html);
    expect(result).not.toBeNull();
    expect(result!.format).toBe("pocket");
    expect(result!.items).toHaveLength(1);
  });

  it("auto-detects and parses Instapaper CSV", () => {
    const csv = `URL,Title,Selection,Folder,Timestamp
https://example.com/a,Title,,Unread,1700000000`;

    const result = parseImportFile(csv, "instapaper-export.csv");
    expect(result).not.toBeNull();
    expect(result!.format).toBe("instapaper");
    expect(result!.items).toHaveLength(1);
  });

  it("returns null for unrecognized format", () => {
    expect(parseImportFile("just some random text")).toBeNull();
  });
});
