import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.BROADSHEET_FOLIO_ADAPTER = "memory";
});

vi.mock("./feeds", async () => {
  const actual = await vi.importActual<typeof import("./feeds")>("./feeds");
  return {
    ...actual,
    discoverFeed: vi.fn(),
    fetchFeed: vi.fn(),
  };
});

import { discoverFeed, fetchFeed } from "./feeds";
import {
  addSource,
  clearFeedCache,
  fetchSourceItems,
  fetchUnifiedFeed,
  getSource,
  listSources,
  removeSource,
  sourceIdForFeedUrl,
} from "./sources";

const discoverFeedMock = vi.mocked(discoverFeed);
const fetchFeedMock = vi.mocked(fetchFeed);

const USER = "user_test_alice";
const OTHER = "user_test_bob";

function makeFeed(
  feedUrl: string,
  title: string,
  siteUrl: string | null,
  items: {
    title: string;
    url: string;
    publishedAt: string | null;
    excerpt?: string | null;
  }[],
) {
  return {
    feedUrl,
    feed: {
      title,
      siteUrl,
      items: items.map((i) => ({
        title: i.title,
        url: i.url,
        publishedAt: i.publishedAt,
        excerpt: i.excerpt ?? null,
      })),
    },
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  clearFeedCache();
  // Wipe per-test state. The memory adapter's volume list is stable across
  // tests within a single process, so we delete whatever is there.
  for (const user of [USER, OTHER]) {
    const existing = await listSources(user);
    for (const s of existing) await removeSource(user, s.id);
  }
});

describe("sourceIdForFeedUrl", () => {
  it("is deterministic for equivalent URLs", () => {
    const a = sourceIdForFeedUrl("https://www.example.com/feed?utm_source=x");
    const b = sourceIdForFeedUrl("https://example.com/feed");
    expect(a).toBe(b);
  });

  it("returns a 32-char hex slug", () => {
    expect(sourceIdForFeedUrl("https://example.com/feed")).toMatch(
      /^[a-f0-9]{32}$/,
    );
  });
});

describe("addSource", () => {
  it("discovers and stores a new source", async () => {
    discoverFeedMock.mockResolvedValueOnce(
      makeFeed(
        "https://example.com/feed.xml",
        "Example blog",
        "https://example.com/",
        [
          {
            title: "Hello",
            url: "https://example.com/a",
            publishedAt: "2026-04-10T00:00:00.000Z",
          },
        ],
      ),
    );

    const { source, alreadyExisted } = await addSource(
      USER,
      "https://example.com",
    );

    expect(alreadyExisted).toBe(false);
    expect(source.title).toBe("Example blog");
    expect(source.feedUrl).toBe("https://example.com/feed.xml");
    expect(source.siteUrl).toBe("https://example.com/");
    expect(source.id).toMatch(/^[a-f0-9]{32}$/);

    const listed = await listSources(USER);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(source.id);
  });

  it("is idempotent when the same feed is added twice", async () => {
    discoverFeedMock.mockResolvedValue(
      makeFeed(
        "https://example.com/feed.xml",
        "Example blog",
        "https://example.com/",
        [],
      ),
    );

    const first = await addSource(USER, "https://example.com");
    const second = await addSource(USER, "https://example.com/blog");

    expect(second.alreadyExisted).toBe(true);
    expect(second.source.id).toBe(first.source.id);
    const listed = await listSources(USER);
    expect(listed).toHaveLength(1);
  });

  it("isolates sources per user", async () => {
    discoverFeedMock.mockResolvedValue(
      makeFeed("https://a.example/feed", "A", "https://a.example/", []),
    );

    await addSource(USER, "https://a.example");

    discoverFeedMock.mockResolvedValue(
      makeFeed("https://b.example/feed", "B", "https://b.example/", []),
    );
    await addSource(OTHER, "https://b.example");

    expect(await listSources(USER)).toHaveLength(1);
    expect(await listSources(OTHER)).toHaveLength(1);
    expect((await listSources(USER))[0].title).toBe("A");
    expect((await listSources(OTHER))[0].title).toBe("B");
  });

  it("falls back to hostname when feed title is empty", async () => {
    discoverFeedMock.mockResolvedValue(
      makeFeed("https://bare.example/rss", "", "https://bare.example/", []),
    );
    const { source } = await addSource(USER, "https://bare.example");
    expect(source.title).toBe("bare.example");
  });
});

describe("removeSource", () => {
  it("removes an existing source and returns true", async () => {
    discoverFeedMock.mockResolvedValue(
      makeFeed("https://x.example/feed", "X", "https://x.example/", []),
    );
    const { source } = await addSource(USER, "https://x.example");
    const removed = await removeSource(USER, source.id);
    expect(removed).toBe(true);
    expect(await getSource(USER, source.id)).toBeNull();
  });

  it("returns false for a missing source", async () => {
    expect(await removeSource(USER, "a".repeat(32))).toBe(false);
  });
});

describe("fetchSourceItems", () => {
  it("caches fetched items and serves them on the next call", async () => {
    discoverFeedMock.mockResolvedValue(
      makeFeed(
        "https://cache.example/feed",
        "Cache",
        "https://cache.example/",
        [],
      ),
    );
    const { source } = await addSource(USER, "https://cache.example");

    fetchFeedMock.mockResolvedValueOnce({
      feed: {
        title: "Cache",
        siteUrl: "https://cache.example/",
        items: [
          {
            title: "Post one",
            url: "https://cache.example/1",
            publishedAt: "2026-04-10T12:00:00.000Z",
            excerpt: null,
          },
        ],
      },
      finalUrl: "https://cache.example/feed",
    });

    const first = await fetchSourceItems(USER, source);
    expect(first.fromCache).toBe(false);
    expect(first.items).toHaveLength(1);

    const second = await fetchSourceItems(USER, source);
    expect(second.fromCache).toBe(true);
    expect(fetchFeedMock).toHaveBeenCalledTimes(1);
  });

  it("sorts items newest-first by publishedAt", async () => {
    discoverFeedMock.mockResolvedValue(
      makeFeed("https://s.example/feed", "S", "https://s.example/", []),
    );
    const { source } = await addSource(USER, "https://s.example");

    fetchFeedMock.mockResolvedValueOnce({
      feed: {
        title: "S",
        siteUrl: "https://s.example/",
        items: [
          {
            title: "Old",
            url: "https://s.example/old",
            publishedAt: "2026-01-01T00:00:00.000Z",
            excerpt: null,
          },
          {
            title: "New",
            url: "https://s.example/new",
            publishedAt: "2026-04-10T00:00:00.000Z",
            excerpt: null,
          },
        ],
      },
      finalUrl: "https://s.example/feed",
    });

    const { items } = await fetchSourceItems(USER, source);
    expect(items.map((i) => i.title)).toEqual(["New", "Old"]);
  });

  it("reports errors without throwing", async () => {
    discoverFeedMock.mockResolvedValue(
      makeFeed("https://err.example/feed", "E", "https://err.example/", []),
    );
    const { source } = await addSource(USER, "https://err.example");

    fetchFeedMock.mockRejectedValueOnce(new Error("boom"));

    const result = await fetchSourceItems(USER, source);
    expect(result.items).toEqual([]);
    expect(result.error).toBe("Could not fetch this feed");
  });
});

describe("fetchUnifiedFeed", () => {
  it("interleaves items across sources by publishedAt", async () => {
    discoverFeedMock.mockResolvedValueOnce(
      makeFeed("https://a.example/feed", "A", "https://a.example/", []),
    );
    const { source: a } = await addSource(USER, "https://a.example");

    discoverFeedMock.mockResolvedValueOnce(
      makeFeed("https://b.example/feed", "B", "https://b.example/", []),
    );
    const { source: b } = await addSource(USER, "https://b.example");

    fetchFeedMock.mockImplementation(async (feedUrl: string) => {
      if (feedUrl.includes("a.example")) {
        return {
          feed: {
            title: "A",
            siteUrl: "https://a.example/",
            items: [
              {
                title: "A2",
                url: "https://a.example/2",
                publishedAt: "2026-04-10T10:00:00.000Z",
                excerpt: null,
              },
              {
                title: "A1",
                url: "https://a.example/1",
                publishedAt: "2026-04-08T10:00:00.000Z",
                excerpt: null,
              },
            ],
          },
          finalUrl: feedUrl,
        };
      }
      return {
        feed: {
          title: "B",
          siteUrl: "https://b.example/",
          items: [
            {
              title: "B1",
              url: "https://b.example/1",
              publishedAt: "2026-04-09T10:00:00.000Z",
              excerpt: null,
            },
          ],
        },
        finalUrl: feedUrl,
      };
    });

    const { items, errors } = await fetchUnifiedFeed(USER);
    expect(errors).toEqual([]);
    expect(items.map((i) => i.title)).toEqual(["A2", "B1", "A1"]);
    expect(items[0].sourceId).toBe(a.id);
    expect(items[1].sourceId).toBe(b.id);
  });

  it("collects errors from failing sources", async () => {
    discoverFeedMock.mockResolvedValueOnce(
      makeFeed("https://ok.example/feed", "OK", "https://ok.example/", []),
    );
    await addSource(USER, "https://ok.example");

    discoverFeedMock.mockResolvedValueOnce(
      makeFeed("https://bad.example/feed", "Bad", "https://bad.example/", []),
    );
    await addSource(USER, "https://bad.example");

    fetchFeedMock.mockImplementation(async (feedUrl: string) => {
      if (feedUrl.includes("ok.example")) {
        return {
          feed: {
            title: "OK",
            siteUrl: "https://ok.example/",
            items: [
              {
                title: "Fine",
                url: "https://ok.example/fine",
                publishedAt: "2026-04-10T00:00:00.000Z",
                excerpt: null,
              },
            ],
          },
          finalUrl: feedUrl,
        };
      }
      throw new Error("upstream 500");
    });

    const { items, errors } = await fetchUnifiedFeed(USER);
    expect(items.map((i) => i.title)).toEqual(["Fine"]);
    expect(errors).toHaveLength(1);
    expect(errors[0].sourceTitle).toBe("Bad");
  });
});
