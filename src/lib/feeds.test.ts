import { describe, expect, it } from "vitest";
import {
  extractFeedLinksFromHtml,
  isFeedContentType,
  parseFeedXml,
} from "./feeds";
import { IngestError } from "./ingest";

const rss2 = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example blog</title>
    <link>https://example.com/</link>
    <description>Everything worth reading</description>
    <item>
      <title>First post</title>
      <link>https://example.com/posts/first</link>
      <pubDate>Mon, 06 Apr 2026 10:00:00 GMT</pubDate>
      <description>A &lt;em&gt;brief&lt;/em&gt; excerpt of the first post.</description>
    </item>
    <item>
      <title>Second post</title>
      <link>https://example.com/posts/second</link>
      <pubDate>Wed, 08 Apr 2026 14:30:00 GMT</pubDate>
      <description>Second excerpt.</description>
    </item>
  </channel>
</rss>`;

const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom blog</title>
  <link rel="alternate" href="https://atom.example/" />
  <link rel="self" href="https://atom.example/feed.xml" />
  <entry>
    <title>Atom post</title>
    <link rel="alternate" href="https://atom.example/posts/hello" />
    <published>2026-04-07T12:00:00Z</published>
    <summary>Atom summary text.</summary>
  </entry>
</feed>`;

describe("parseFeedXml", () => {
  it("parses RSS 2.0 items in document order", () => {
    const feed = parseFeedXml(rss2, "https://example.com/feed");
    expect(feed.title).toBe("Example blog");
    expect(feed.siteUrl).toBe("https://example.com/");
    expect(feed.items).toHaveLength(2);
    expect(feed.items[0]).toMatchObject({
      title: "First post",
      url: "https://example.com/posts/first",
      publishedAt: "2026-04-06T10:00:00.000Z",
    });
    expect(feed.items[0].excerpt).toBe("A brief excerpt of the first post.");
    expect(feed.items[1].publishedAt).toBe("2026-04-08T14:30:00.000Z");
  });

  it("parses Atom entries and resolves alternate links", () => {
    const feed = parseFeedXml(atom, "https://atom.example/feed.xml");
    expect(feed.title).toBe("Atom blog");
    expect(feed.siteUrl).toBe("https://atom.example/");
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]).toMatchObject({
      title: "Atom post",
      url: "https://atom.example/posts/hello",
      publishedAt: "2026-04-07T12:00:00.000Z",
      excerpt: "Atom summary text.",
    });
  });

  it("resolves relative item links against the feed URL", () => {
    const relative = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <title>Relative</title>
          <link>/</link>
          <item>
            <title>Relative post</title>
            <link>/articles/42</link>
          </item>
        </channel>
      </rss>`;
    const feed = parseFeedXml(relative, "https://rel.example/feed.xml");
    expect(feed.siteUrl).toBe("https://rel.example/");
    expect(feed.items[0].url).toBe("https://rel.example/articles/42");
  });

  it("skips entries without a resolvable link", () => {
    const broken = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <title>Broken</title>
          <item><title>No link here</title></item>
          <item><title>Has link</title><link>https://ok.example/x</link></item>
        </channel>
      </rss>`;
    const feed = parseFeedXml(broken, "https://ok.example/feed");
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0].url).toBe("https://ok.example/x");
  });

  it("throws IngestError for an unknown root element", () => {
    const junk = `<?xml version="1.0"?><not-a-feed><foo/></not-a-feed>`;
    expect(() => parseFeedXml(junk, "https://x.example")).toThrow(IngestError);
  });

  it("throws IngestError for an empty body", () => {
    expect(() => parseFeedXml("", "https://x.example")).toThrow(IngestError);
  });

  it("truncates very long excerpts", () => {
    const long = "word ".repeat(200);
    const xml = `<?xml version="1.0"?>
      <rss version="2.0"><channel><title>T</title><link>https://x.example</link>
      <item><title>L</title><link>https://x.example/a</link><description>${long}</description></item>
      </channel></rss>`;
    const feed = parseFeedXml(xml, "https://x.example/feed");
    const excerpt = feed.items[0].excerpt;
    expect(excerpt).not.toBeNull();
    expect(excerpt!.length).toBeLessThanOrEqual(280);
    expect(excerpt!.endsWith("…")).toBe(true);
  });
});

describe("extractFeedLinksFromHtml", () => {
  it("returns absolute feed URLs from <link rel='alternate'>", () => {
    const html = `<!doctype html><html><head>
      <link rel="alternate" type="application/rss+xml" href="/feed.xml" />
      <link rel="alternate" type="application/atom+xml" href="https://other.example/atom" />
      <link rel="alternate" type="text/html" href="/nope" />
      </head><body></body></html>`;
    const links = extractFeedLinksFromHtml(html, "https://site.example/blog");
    expect(links).toEqual([
      "https://other.example/atom",
      "https://site.example/feed.xml",
    ]);
  });

  it("returns an empty array when there are no feed links", () => {
    const html = `<html><head></head><body></body></html>`;
    expect(extractFeedLinksFromHtml(html, "https://x.example")).toEqual([]);
  });
});

describe("isFeedContentType", () => {
  it("accepts RSS, Atom, XML, and JSON feed types", () => {
    expect(isFeedContentType("application/rss+xml")).toBe(true);
    expect(isFeedContentType("application/atom+xml; charset=utf-8")).toBe(true);
    expect(isFeedContentType("application/xml")).toBe(true);
    expect(isFeedContentType("text/xml")).toBe(true);
    expect(isFeedContentType("application/feed+json")).toBe(true);
  });

  it("rejects html and other types", () => {
    expect(isFeedContentType(null)).toBe(false);
    expect(isFeedContentType("text/html")).toBe(false);
    expect(isFeedContentType("application/pdf")).toBe(false);
  });
});
