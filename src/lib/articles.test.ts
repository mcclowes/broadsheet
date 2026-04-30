import { describe, expect, it } from "vitest";
import {
  articleIdForUrl,
  canonicalizeUrl,
  decodeCursor,
  encodeCursor,
  filterArticles,
  type ArticleSummary,
} from "./articles";

function make(
  id: string,
  overrides: Partial<ArticleSummary> = {},
): ArticleSummary {
  return {
    id,
    title: `Article ${id}`,
    url: `https://example.com/${id}`,
    source: "example.com",
    byline: null,
    excerpt: null,
    lang: null,
    image: null,
    wordCount: 500,
    readMinutes: 2,
    savedAt: "2026-04-10T00:00:00.000Z",
    readAt: null,
    lastReadAt: null,
    readProgress: null,
    archivedAt: null,
    tags: [],
    markdown: "",
    ...overrides,
  };
}

describe("filterArticles", () => {
  const articles: ArticleSummary[] = [
    make("a", { tags: ["tech"], source: "example.com" }),
    make("b", {
      tags: ["tech", "news"],
      source: "other.com",
      readAt: "2026-04-09T00:00:00.000Z",
    }),
    make("c", {
      tags: ["food"],
      source: "example.com",
      archivedAt: "2026-04-09T00:00:00.000Z",
    }),
    make("d", { tags: [], source: "other.com" }),
  ];

  it("defaults to inbox view (excludes archived)", () => {
    const result = filterArticles(articles, {});
    expect(result.map((a) => a.id)).toEqual(["a", "b", "d"]);
  });

  it("archive view shows only archived", () => {
    const result = filterArticles(articles, { view: "archive" });
    expect(result.map((a) => a.id)).toEqual(["c"]);
  });

  it("filters unread state within inbox", () => {
    const result = filterArticles(articles, { state: "unread" });
    expect(result.map((a) => a.id)).toEqual(["a", "d"]);
  });

  it("filters read state within inbox", () => {
    const result = filterArticles(articles, { state: "read" });
    expect(result.map((a) => a.id)).toEqual(["b"]);
  });

  it("filters by tag", () => {
    const result = filterArticles(articles, { tag: "tech" });
    expect(result.map((a) => a.id)).toEqual(["a", "b"]);
  });

  it("filters by source", () => {
    const result = filterArticles(articles, { source: "other.com" });
    expect(result.map((a) => a.id)).toEqual(["b", "d"]);
  });

  it("combines filters", () => {
    const result = filterArticles(articles, {
      tag: "tech",
      state: "unread",
      source: "example.com",
    });
    expect(result.map((a) => a.id)).toEqual(["a"]);
  });

  it("filters reading state: started but not finished", () => {
    const mixed: ArticleSummary[] = [
      make("u"), // untouched
      make("r", { lastReadAt: "2026-04-10T01:00:00.000Z", readProgress: 0.4 }),
      make("done", {
        readAt: "2026-04-10T02:00:00.000Z",
        lastReadAt: "2026-04-10T02:00:00.000Z",
        readProgress: 0.95,
      }),
    ];
    expect(
      filterArticles(mixed, { state: "reading" }).map((a) => a.id),
    ).toEqual(["r"]);
    // Strict unread excludes in-progress articles too.
    expect(filterArticles(mixed, { state: "unread" }).map((a) => a.id)).toEqual(
      ["u"],
    );
  });

  it("state 'all' returns both read and unread in inbox", () => {
    const result = filterArticles(articles, { state: "all" });
    expect(result.map((a) => a.id)).toEqual(["a", "b", "d"]);
  });

  it("returns empty array when no articles match", () => {
    const result = filterArticles(articles, { tag: "nonexistent" });
    expect(result).toEqual([]);
  });

  it("handles empty article list", () => {
    const result = filterArticles([], {});
    expect(result).toEqual([]);
  });

  it("archive view with source filter", () => {
    const result = filterArticles(articles, {
      view: "archive",
      source: "example.com",
    });
    expect(result.map((a) => a.id)).toEqual(["c"]);
  });

  it("archive view with tag filter", () => {
    const result = filterArticles(articles, {
      view: "archive",
      tag: "food",
    });
    expect(result.map((a) => a.id)).toEqual(["c"]);
  });

  it("filters by q across title/source/excerpt/byline/tags", () => {
    const corpus: ArticleSummary[] = [
      make("x", { title: "React hooks explained", tags: ["react"] }),
      make("y", {
        title: "A primer on Rust",
        excerpt: "Ownership and borrowing",
      }),
      make("z", {
        title: "Cooking",
        source: "nytimes.com",
        byline: "Sam Sifton",
      }),
    ];
    expect(filterArticles(corpus, { q: "hooks" }).map((a) => a.id)).toEqual([
      "x",
    ]);
    expect(filterArticles(corpus, { q: "ownership" }).map((a) => a.id)).toEqual(
      ["y"],
    );
    expect(filterArticles(corpus, { q: "nytimes" }).map((a) => a.id)).toEqual([
      "z",
    ]);
    expect(filterArticles(corpus, { q: "#react" }).map((a) => a.id)).toEqual([
      "x",
    ]);
  });

  it("q terms are AND-combined", () => {
    const corpus: ArticleSummary[] = [
      make("x", { title: "React hooks" }),
      make("y", { title: "React class components" }),
    ];
    expect(
      filterArticles(corpus, { q: "react hooks" }).map((a) => a.id),
    ).toEqual(["x"]);
  });
});

describe("canonicalizeUrl", () => {
  it("strips fragments", () => {
    expect(canonicalizeUrl("https://example.com/post#section")).toBe(
      "https://example.com/post",
    );
  });

  it("lowercases host and drops www", () => {
    expect(canonicalizeUrl("https://WWW.Example.COM/Path")).toBe(
      "https://example.com/Path",
    );
  });

  it("strips utm and other tracking params", () => {
    expect(
      canonicalizeUrl(
        "https://example.com/x?utm_source=t&utm_medium=e&id=42&fbclid=abc",
      ),
    ).toBe("https://example.com/x?id=42");
  });

  it("sorts remaining query params for stable output", () => {
    expect(canonicalizeUrl("https://example.com/x?b=2&a=1")).toBe(
      "https://example.com/x?a=1&b=2",
    );
  });

  it("strips trailing slash but keeps root", () => {
    expect(canonicalizeUrl("https://example.com/post/")).toBe(
      "https://example.com/post",
    );
    expect(canonicalizeUrl("https://example.com/")).toBe(
      "https://example.com/",
    );
  });

  it("drops default port", () => {
    expect(canonicalizeUrl("https://example.com:443/x")).toBe(
      "https://example.com/x",
    );
    expect(canonicalizeUrl("http://example.com:80/x")).toBe(
      "http://example.com/x",
    );
  });
});

describe("canonicalizeUrl – additional tracking params", () => {
  it.each([
    [
      "mc_eid",
      "https://example.com/x?mc_eid=abc&id=1",
      "https://example.com/x?id=1",
    ],
    ["mc_cid", "https://example.com/x?mc_cid=abc", "https://example.com/x"],
    ["_hsenc", "https://example.com/x?_hsenc=abc", "https://example.com/x"],
    ["_hsmi", "https://example.com/x?_hsmi=abc", "https://example.com/x"],
    ["icid", "https://example.com/x?icid=nav", "https://example.com/x"],
    ["ref", "https://example.com/x?ref=home", "https://example.com/x"],
    ["ref_src", "https://example.com/x?ref_src=twsrc", "https://example.com/x"],
    ["yclid", "https://example.com/x?yclid=123", "https://example.com/x"],
    ["msclkid", "https://example.com/x?msclkid=abc", "https://example.com/x"],
    ["gclid", "https://example.com/x?gclid=abc", "https://example.com/x"],
  ])("strips %s param", (_name, input, expected) => {
    expect(canonicalizeUrl(input)).toBe(expected);
  });

  it("preserves non-tracking params alongside stripped ones", () => {
    expect(
      canonicalizeUrl(
        "https://example.com/x?page=2&utm_campaign=spring&sort=date&fbclid=x",
      ),
    ).toBe("https://example.com/x?page=2&sort=date");
  });

  it("handles URLs with no query params", () => {
    expect(canonicalizeUrl("https://example.com/article")).toBe(
      "https://example.com/article",
    );
  });

  it("handles http scheme", () => {
    expect(canonicalizeUrl("http://example.com/x")).toBe(
      "http://example.com/x",
    );
  });

  it("handles non-default port", () => {
    expect(canonicalizeUrl("https://example.com:8443/x")).toBe(
      "https://example.com:8443/x",
    );
  });
});

describe("articleIdForUrl", () => {
  it("is deterministic for equivalent URLs", () => {
    const a = articleIdForUrl("https://www.example.com/post?utm_source=x#frag");
    const b = articleIdForUrl("https://example.com/post");
    expect(a).toBe(b);
  });

  it("differs for different URLs", () => {
    expect(articleIdForUrl("https://example.com/a")).not.toBe(
      articleIdForUrl("https://example.com/b"),
    );
  });

  it("returns a 32-char hex slug", () => {
    expect(articleIdForUrl("https://example.com/x")).toMatch(/^[a-f0-9]{32}$/);
  });
});

import { parseListFilters, LIST_LIMIT_MAX } from "./articles";

describe("parseListFilters", () => {
  const from = (qs: string) => parseListFilters(new URLSearchParams(qs));

  it("returns empty filters for no params", () => {
    expect(from("")).toEqual({
      view: undefined,
      state: undefined,
      tag: undefined,
      source: undefined,
      limit: undefined,
      q: undefined,
      cursor: undefined,
    });
  });

  it("parses cursor and treats empty cursor as undefined", () => {
    expect(from("cursor=abc123").cursor).toBe("abc123");
    expect(from("cursor=").cursor).toBeUndefined();
  });

  it("parses q and trims whitespace", () => {
    expect(from("q=hello+world").q).toBe("hello world");
    expect(from("q=%20%20hello%20").q).toBe("hello");
  });

  it("treats empty q as undefined", () => {
    expect(from("q=").q).toBeUndefined();
    expect(from("q=%20%20").q).toBeUndefined();
  });

  it("caps q length at LIST_QUERY_MAX", () => {
    const long = "x".repeat(500);
    expect(from(`q=${long}`).q?.length).toBe(128);
  });

  it("parses recognized view and state", () => {
    expect(from("view=archive&state=unread").view).toBe("archive");
    expect(from("view=archive&state=unread").state).toBe("unread");
  });

  it("ignores unknown view and state", () => {
    expect(from("view=junk&state=bogus").view).toBeUndefined();
    expect(from("view=junk&state=bogus").state).toBeUndefined();
  });

  it("rejects non-numeric limit", () => {
    expect(from("limit=abc").limit).toBeUndefined();
    expect(from("limit=10abc").limit).toBeUndefined();
    expect(from("limit=-5").limit).toBeUndefined();
    expect(from("limit=0").limit).toBeUndefined();
    expect(from("limit=1.5").limit).toBeUndefined();
  });

  it("clamps limit to LIST_LIMIT_MAX", () => {
    expect(from("limit=50").limit).toBe(50);
    expect(from("limit=999999999").limit).toBe(LIST_LIMIT_MAX);
  });
});

import { saveArticleRequestSchema } from "./articles";
import { MAX_USER_HTML_BYTES } from "./ingest";

describe("saveArticleRequestSchema", () => {
  it("accepts a request without html", () => {
    const r = saveArticleRequestSchema.safeParse({
      url: "https://example.com/a",
    });
    expect(r.success).toBe(true);
  });

  it("accepts html up to MAX_USER_HTML_BYTES", () => {
    const r = saveArticleRequestSchema.safeParse({
      url: "https://example.com/a",
      html: "a".repeat(MAX_USER_HTML_BYTES),
    });
    expect(r.success).toBe(true);
  });

  it("rejects html larger than MAX_USER_HTML_BYTES", () => {
    const r = saveArticleRequestSchema.safeParse({
      url: "https://example.com/a",
      html: "a".repeat(MAX_USER_HTML_BYTES + 1),
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty html string", () => {
    const r = saveArticleRequestSchema.safeParse({
      url: "https://example.com/a",
      html: "",
    });
    expect(r.success).toBe(false);
  });

  it("accepts an optional selection.text", () => {
    const r = saveArticleRequestSchema.safeParse({
      url: "https://example.com/a",
      selection: { text: "the quick brown fox" },
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty selection.text", () => {
    const r = saveArticleRequestSchema.safeParse({
      url: "https://example.com/a",
      selection: { text: "" },
    });
    expect(r.success).toBe(false);
  });

  it("rejects selection.text longer than 2000 chars", () => {
    const r = saveArticleRequestSchema.safeParse({
      url: "https://example.com/a",
      selection: { text: "a".repeat(2001) },
    });
    expect(r.success).toBe(false);
  });
});

describe("encodeCursor / decodeCursor", () => {
  it("round-trips (savedAt, id)", () => {
    const entry = {
      savedAt: "2026-04-15T12:34:56.789Z",
      id: "a".repeat(32),
    };
    const encoded = encodeCursor(entry);
    expect(decodeCursor(encoded)).toEqual(entry);
  });

  it("returns a URL-safe string (no + / = padding)", () => {
    const encoded = encodeCursor({
      savedAt: "2026-04-15T12:34:56.789Z",
      id: "f".repeat(32),
    });
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("rejects malformed cursors as null", () => {
    expect(decodeCursor("")).toBeNull();
    expect(decodeCursor("not-base64!!!")).toBeNull();
    // Valid base64url but wrong shape (no pipe).
    expect(
      decodeCursor(Buffer.from("no-pipe").toString("base64url")),
    ).toBeNull();
    // Pipe but id isn't a 32-char hex.
    expect(
      decodeCursor(
        Buffer.from("2026-04-15T00:00:00.000Z|not-a-hex-id").toString(
          "base64url",
        ),
      ),
    ).toBeNull();
    // Pipe but savedAt isn't a parseable timestamp.
    expect(
      decodeCursor(
        Buffer.from(`not-a-timestamp|${"a".repeat(32)}`).toString("base64url"),
      ),
    ).toBeNull();
  });
});
