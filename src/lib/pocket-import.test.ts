import { describe, expect, it } from "vitest";
import {
  parsePocketAnnotations,
  parsePocketCsv,
  parsePocketExport,
} from "./pocket-import";

describe("parsePocketCsv", () => {
  it("parses basic rows", () => {
    const csv = [
      "title,url,time_added,tags,status",
      "Hello,https://example.com/a,1710000000,,unread",
      "World,https://example.com/b,1720000000,tech|ideas,archive",
    ].join("\n");
    const items = parsePocketCsv(csv);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      url: "https://example.com/a",
      title: "Hello",
      savedAt: new Date(1710000000 * 1000).toISOString(),
      tags: [],
      archived: false,
    });
    expect(items[1].tags).toEqual(["tech", "ideas"]);
    expect(items[1].archived).toBe(true);
  });

  it("handles quoted fields containing commas", () => {
    const csv = [
      "title,url,time_added,tags,status",
      '"Hello, world",https://example.com/a,1710000000,,unread',
    ].join("\n");
    const items = parsePocketCsv(csv);
    expect(items[0].title).toBe("Hello, world");
  });

  it("handles escaped quotes", () => {
    const csv = [
      "title,url,time_added,tags,status",
      '"She said ""hi""",https://example.com/a,1710000000,,unread',
    ].join("\n");
    const items = parsePocketCsv(csv);
    expect(items[0].title).toBe('She said "hi"');
  });

  it("skips rows with invalid URLs", () => {
    const csv = [
      "title,url,time_added,tags,status",
      "Bad,notaurl,1710000000,,unread",
      "Good,https://example.com/a,1710000000,,unread",
      "Ftp,ftp://example.com,1710000000,,unread",
    ].join("\n");
    const items = parsePocketCsv(csv);
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe("https://example.com/a");
  });

  it("falls back to url when title is empty", () => {
    const csv = [
      "title,url,time_added,tags,status",
      ",https://example.com/a,1710000000,,unread",
    ].join("\n");
    const items = parsePocketCsv(csv);
    expect(items[0].title).toBe("https://example.com/a");
  });

  it("throws when url column is missing", () => {
    const csv = ["title,time_added,status", "Hello,1710000000,unread"].join(
      "\n",
    );
    expect(() => parsePocketCsv(csv)).toThrow(/url/);
  });
});

describe("parsePocketAnnotations", () => {
  it("parses highlights and converts timestamps", () => {
    const json = JSON.stringify([
      {
        url: "https://example.com/a",
        title: "A",
        highlights: [
          { quote: "one", created_at: 1710000000 },
          { quote: "two", created_at: 1720000000 },
        ],
      },
    ]);
    const out = parsePocketAnnotations(json);
    expect(out).toHaveLength(1);
    expect(out[0].highlights[0]).toEqual({
      text: "one",
      createdAt: new Date(1710000000 * 1000).toISOString(),
    });
  });

  it("skips entries with no valid highlights", () => {
    const json = JSON.stringify([
      { url: "https://example.com/a", highlights: [{ quote: "" }] },
      { url: "https://example.com/b", highlights: [{ quote: "ok" }] },
    ]);
    const out = parsePocketAnnotations(json);
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe("https://example.com/b");
  });

  it("skips entries with invalid url", () => {
    const json = JSON.stringify([
      { url: "notaurl", highlights: [{ quote: "ok" }] },
    ]);
    expect(parsePocketAnnotations(json)).toHaveLength(0);
  });
});

describe("parsePocketExport", () => {
  it("combines csv and annotations", () => {
    const csv = [
      "title,url,time_added,tags,status",
      "A,https://example.com/a,1710000000,,unread",
    ].join("\n");
    const annotations = JSON.stringify([
      { url: "https://example.com/a", highlights: [{ quote: "hi" }] },
    ]);
    const out = parsePocketExport({ csv, annotations });
    expect(out.items).toHaveLength(1);
    expect(out.annotations).toHaveLength(1);
  });
});
