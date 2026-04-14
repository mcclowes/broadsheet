import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.BROADSHEET_FOLIO_ADAPTER = "memory";
});

import {
  saveArticle,
  saveArticleWithOutcome,
  listArticles,
  getArticle,
  markRead,
  patchArticle,
  setArchived,
  setTags,
} from "./articles";
import { authedUserId, type AuthedUserId } from "./auth-types";
import type { ParsedArticle } from "./ingest";
import { getFolio, volumeNameForUser } from "./folio";

const USER = authedUserId("user_test_crud_alice");
const OTHER = authedUserId("user_test_crud_bob");

function makeParsed(overrides: Partial<ParsedArticle> = {}): ParsedArticle {
  return {
    title: "Test Article",
    byline: "Jane Writer",
    excerpt: "A short excerpt.",
    siteName: "Example",
    lang: "en",
    image: "https://cdn.example.com/hero.jpg",
    markdown: "This is the **body** of the article with enough words.",
    wordCount: 10,
    ...overrides,
  };
}

async function clearVolume(userId: AuthedUserId): Promise<void> {
  const volume = getFolio().volume(volumeNameForUser(userId));
  const pages = await volume.list();
  for (const p of pages) {
    await volume.delete(p.slug);
  }
}

beforeEach(async () => {
  await clearVolume(USER);
  await clearVolume(OTHER);
});

describe("saveArticle", () => {
  it("saves and returns an article summary", async () => {
    const summary = await saveArticle(
      USER,
      "https://example.com/article-1",
      makeParsed(),
    );
    expect(summary.id).toMatch(/^[a-f0-9]{32}$/);
    expect(summary.title).toBe("Test Article");
    expect(summary.url).toBe("https://example.com/article-1");
    expect(summary.byline).toBe("Jane Writer");
    expect(summary.excerpt).toBe("A short excerpt.");
    expect(summary.image).toBe("https://cdn.example.com/hero.jpg");
    expect(summary.readAt).toBeNull();
    expect(summary.archivedAt).toBeNull();
    expect(summary.savedAt).toBeTruthy();
  });

  it("saveArticleWithOutcome reports created=true on first save, false on duplicate", async () => {
    const first = await saveArticleWithOutcome(
      USER,
      "https://example.com/outcome",
      makeParsed({ title: "First" }),
    );
    expect(first.created).toBe(true);
    const second = await saveArticleWithOutcome(
      USER,
      "https://example.com/outcome",
      makeParsed({ title: "Second" }),
    );
    expect(second.created).toBe(false);
    expect(second.article.id).toBe(first.article.id);
    expect(second.article.title).toBe("First");
  });

  it("is idempotent — returns existing article on duplicate URL", async () => {
    const first = await saveArticle(
      USER,
      "https://example.com/dup",
      makeParsed({ title: "First" }),
    );
    const second = await saveArticle(
      USER,
      "https://example.com/dup",
      makeParsed({ title: "Second" }),
    );
    expect(second.id).toBe(first.id);
    expect(second.title).toBe("First");
  });

  it("canonicalizes URL before saving", async () => {
    const a = await saveArticle(
      USER,
      "https://WWW.Example.COM/post?utm_source=x#frag",
      makeParsed(),
    );
    const b = await saveArticle(USER, "https://example.com/post", makeParsed());
    expect(a.id).toBe(b.id);
  });

  it("derives source from domain when siteName is null", async () => {
    const summary = await saveArticle(
      USER,
      "https://blog.example.com/post",
      makeParsed({ siteName: null }),
    );
    expect(summary.source).toBe("blog.example.com");
  });

  it("auto-generates tags from content", async () => {
    const summary = await saveArticle(
      USER,
      "https://example.com/tagged",
      makeParsed({
        title: "JavaScript Framework Review",
        markdown:
          "JavaScript JavaScript JavaScript JavaScript JavaScript JavaScript JavaScript JavaScript JavaScript JavaScript",
      }),
    );
    expect(summary.tags.length).toBeGreaterThan(0);
  });

  it("isolates articles between users", async () => {
    await saveArticle(
      USER,
      "https://example.com/isolated",
      makeParsed({ title: "Alice's article" }),
    );
    const bobList = await listArticles(OTHER);
    expect(bobList).toHaveLength(0);
  });

  it("handles concurrent saves of the same URL via dedup", async () => {
    const [a, b] = await Promise.all([
      saveArticle(
        USER,
        "https://example.com/concurrent",
        makeParsed({ title: "First" }),
      ),
      saveArticle(
        USER,
        "https://example.com/concurrent",
        makeParsed({ title: "Second" }),
      ),
    ]);
    // Both should resolve to the same article ID
    expect(a.id).toBe(b.id);
    // Only one article should exist
    const list = await listArticles(USER);
    expect(list.filter((art) => art.id === a.id)).toHaveLength(1);
  });
});

describe("getArticle", () => {
  it("returns null for malformed article id", async () => {
    const article = await getArticle(USER, "not-a-valid-hex-id");
    expect(article).toBeNull();
  });
});

describe("listArticles", () => {
  it("lists all saved articles", async () => {
    await saveArticle(
      USER,
      "https://example.com/a",
      makeParsed({ title: "A" }),
    );
    await saveArticle(
      USER,
      "https://example.com/b",
      makeParsed({ title: "B" }),
    );
    const list = await listArticles(USER);
    expect(list).toHaveLength(2);
    const titles = list.map((a) => a.title).sort();
    expect(titles).toEqual(["A", "B"]);
  });

  it("sorts by savedAt descending", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      await saveArticle(
        USER,
        "https://example.com/older",
        makeParsed({ title: "Older" }),
      );
      vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
      await saveArticle(
        USER,
        "https://example.com/newer",
        makeParsed({ title: "Newer" }),
      );
      const list = await listArticles(USER);
      expect(list).toHaveLength(2);
      expect(list[0].title).toBe("Newer");
      expect(list[1].title).toBe("Older");
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns empty array for a user with no articles", async () => {
    const list = await listArticles(USER);
    expect(list).toEqual([]);
  });

  it("applies filters when listing", async () => {
    await saveArticle(
      USER,
      "https://example.com/read-me",
      makeParsed({ title: "Read Me" }),
    );
    const list = await listArticles(USER);
    expect(list).toHaveLength(1);

    // Mark as archived and re-list with inbox view
    await setArchived(USER, list[0].id, true);
    const inbox = await listArticles(USER, { view: "inbox" });
    expect(inbox).toHaveLength(0);

    const archive = await listArticles(USER, { view: "archive" });
    expect(archive).toHaveLength(1);
  });
});

describe("getArticle", () => {
  it("returns full article with markdown body", async () => {
    const summary = await saveArticle(
      USER,
      "https://example.com/full",
      makeParsed({ markdown: "Full **body** content here." }),
    );
    const article = await getArticle(USER, summary.id);
    expect(article).not.toBeNull();
    expect(article!.id).toBe(summary.id);
    expect(article!.body.trim()).toBe("Full **body** content here.");
    expect(article!.title).toBe("Test Article");
  });

  it("stores markdown as canonical body", async () => {
    const summary = await saveArticle(
      USER,
      "https://example.com/md-preserved",
      makeParsed({ markdown: "# Hello\n\nSome **bold** text." }),
    );
    const article = await getArticle(USER, summary.id);
    expect(article).not.toBeNull();
    expect(article!.body.trim()).toBe("# Hello\n\nSome **bold** text.");
  });

  it("returns null for nonexistent article", async () => {
    const article = await getArticle(USER, "nonexistent-id");
    expect(article).toBeNull();
  });

  it("does not return another user's article", async () => {
    const summary = await saveArticle(
      USER,
      "https://example.com/private",
      makeParsed(),
    );
    const article = await getArticle(OTHER, summary.id);
    expect(article).toBeNull();
  });
});

describe("markRead", () => {
  it("marks an article as read", async () => {
    const summary = await saveArticle(
      USER,
      "https://example.com/mark-read",
      makeParsed(),
    );
    expect(summary.readAt).toBeNull();

    await markRead(USER, summary.id, true);
    const article = await getArticle(USER, summary.id);
    expect(article!.readAt).toBeTruthy();
    expect(new Date(article!.readAt!).getTime()).not.toBeNaN();
  });

  it("marks an article as unread", async () => {
    const summary = await saveArticle(
      USER,
      "https://example.com/unread",
      makeParsed(),
    );
    await markRead(USER, summary.id, true);
    await markRead(USER, summary.id, false);

    const article = await getArticle(USER, summary.id);
    expect(article!.readAt).toBeNull();
  });

  it("handles concurrent markRead calls without throwing", async () => {
    const summary = await saveArticle(
      USER,
      "https://example.com/concurrent-read",
      makeParsed(),
    );

    await Promise.all([
      markRead(USER, summary.id, true),
      markRead(USER, summary.id, true),
      markRead(USER, summary.id, true),
    ]);

    const article = await getArticle(USER, summary.id);
    expect(article!.readAt).toBeTruthy();
  });

  it("appears in filtered list after marking read", async () => {
    const summary = await saveArticle(
      USER,
      "https://example.com/filter-read",
      makeParsed(),
    );
    await markRead(USER, summary.id, true);

    const readList = await listArticles(USER, { state: "read" });
    expect(readList).toHaveLength(1);
    expect(readList[0].id).toBe(summary.id);

    const unreadList = await listArticles(USER, { state: "unread" });
    expect(unreadList).toHaveLength(0);
  });
});

describe("patchArticle progress", () => {
  it("records progress and marks article as in-progress (not read)", async () => {
    const summary = await saveArticle(
      USER,
      "https://example.com/progress-partial",
      makeParsed(),
    );
    await patchArticle(USER, summary.id, { progress: 0.4 });
    const article = await getArticle(USER, summary.id);
    expect(article!.readProgress).toBe(0.4);
    expect(article!.lastReadAt).toBeTruthy();
    expect(article!.readAt).toBeNull();

    const reading = await listArticles(USER, { state: "reading" });
    expect(reading.map((a) => a.id)).toContain(summary.id);
    const unread = await listArticles(USER, { state: "unread" });
    expect(unread.map((a) => a.id)).not.toContain(summary.id);
  });

  it("auto-completes when progress crosses threshold", async () => {
    const summary = await saveArticle(
      USER,
      "https://example.com/progress-complete",
      makeParsed(),
    );
    await patchArticle(USER, summary.id, { progress: 0.95 });
    const article = await getArticle(USER, summary.id);
    expect(article!.readAt).toBeTruthy();
    expect(article!.readProgress).toBe(0.95);
  });

  it("does not overwrite original readAt on re-read to end", async () => {
    const summary = await saveArticle(
      USER,
      "https://example.com/progress-rescroll",
      makeParsed(),
    );
    await patchArticle(USER, summary.id, { progress: 0.95 });
    const first = await getArticle(USER, summary.id);
    const firstReadAt = first!.readAt!;

    await new Promise((r) => setTimeout(r, 5));
    await patchArticle(USER, summary.id, { progress: 1 });
    const second = await getArticle(USER, summary.id);
    expect(second!.readAt).toBe(firstReadAt);
  });

  it("explicit mark unread clears progress", async () => {
    const summary = await saveArticle(
      USER,
      "https://example.com/progress-reset",
      makeParsed(),
    );
    await patchArticle(USER, summary.id, { progress: 0.5 });
    await patchArticle(USER, summary.id, { read: false });
    const article = await getArticle(USER, summary.id);
    expect(article!.readAt).toBeNull();
    expect(article!.lastReadAt).toBeNull();
    expect(article!.readProgress).toBeNull();
  });

  it("clamps out-of-range progress", async () => {
    const summary = await saveArticle(
      USER,
      "https://example.com/progress-clamp",
      makeParsed(),
    );
    await patchArticle(USER, summary.id, { progress: 2 });
    const a = await getArticle(USER, summary.id);
    expect(a!.readProgress).toBe(1);
  });
});

describe("setArchived", () => {
  it("archives an article", async () => {
    const summary = await saveArticle(
      USER,
      "https://example.com/archive-me",
      makeParsed(),
    );
    await setArchived(USER, summary.id, true);

    const article = await getArticle(USER, summary.id);
    expect(article!.archivedAt).toBeTruthy();
  });

  it("unarchives an article", async () => {
    const summary = await saveArticle(
      USER,
      "https://example.com/unarchive",
      makeParsed(),
    );
    await setArchived(USER, summary.id, true);
    await setArchived(USER, summary.id, false);

    const article = await getArticle(USER, summary.id);
    expect(article!.archivedAt).toBeNull();
  });

  it("moves article between inbox and archive views", async () => {
    const summary = await saveArticle(
      USER,
      "https://example.com/move",
      makeParsed(),
    );

    let inbox = await listArticles(USER, { view: "inbox" });
    let archive = await listArticles(USER, { view: "archive" });
    expect(inbox).toHaveLength(1);
    expect(archive).toHaveLength(0);

    await setArchived(USER, summary.id, true);

    inbox = await listArticles(USER, { view: "inbox" });
    archive = await listArticles(USER, { view: "archive" });
    expect(inbox).toHaveLength(0);
    expect(archive).toHaveLength(1);
  });
});

describe("setTags", () => {
  it("sets tags and returns normalized sorted list", async () => {
    const summary = await saveArticle(
      USER,
      "https://example.com/tagged-1",
      makeParsed(),
    );
    const tags = await setTags(USER, summary.id, ["Tech", "JavaScript"]);
    expect(tags).toEqual(["javascript", "tech"]);
  });

  it("deduplicates tags", async () => {
    const summary = await saveArticle(
      USER,
      "https://example.com/dedup-tags",
      makeParsed(),
    );
    const tags = await setTags(USER, summary.id, ["news", "News", "NEWS"]);
    expect(tags).toEqual(["news"]);
  });

  it("normalizes whitespace in tags to hyphens", async () => {
    const summary = await saveArticle(
      USER,
      "https://example.com/ws-tags",
      makeParsed(),
    );
    const tags = await setTags(USER, summary.id, ["machine learning"]);
    expect(tags).toEqual(["machine-learning"]);
  });

  it("filters out empty and over-length tags", async () => {
    const summary = await saveArticle(
      USER,
      "https://example.com/bad-tags",
      makeParsed(),
    );
    const longTag = "a".repeat(33);
    const tags = await setTags(USER, summary.id, ["", "  ", longTag, "valid"]);
    expect(tags).toEqual(["valid"]);
  });

  it("persists tags to the article", async () => {
    const summary = await saveArticle(
      USER,
      "https://example.com/persist-tags",
      makeParsed(),
    );
    await setTags(USER, summary.id, ["saved-tag"]);
    const article = await getArticle(USER, summary.id);
    expect(article!.tags).toEqual(["saved-tag"]);
  });

  it("replaces previous tags", async () => {
    const summary = await saveArticle(
      USER,
      "https://example.com/replace-tags",
      makeParsed(),
    );
    await setTags(USER, summary.id, ["old-tag"]);
    await setTags(USER, summary.id, ["new-tag"]);
    const article = await getArticle(USER, summary.id);
    expect(article!.tags).toEqual(["new-tag"]);
  });

  it("allows filtering by tag after setting", async () => {
    const summary = await saveArticle(
      USER,
      "https://example.com/filter-tags",
      makeParsed(),
    );
    await setTags(USER, summary.id, ["typescript"]);

    const matched = await listArticles(USER, { tag: "typescript" });
    expect(matched).toHaveLength(1);
    expect(matched[0].id).toBe(summary.id);

    const unmatched = await listArticles(USER, { tag: "python" });
    expect(unmatched).toHaveLength(0);
  });
});
