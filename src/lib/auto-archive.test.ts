import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.BROADSHEET_FOLIO_ADAPTER = "memory";
});

import {
  getAutoArchivePreferences,
  setAutoArchivePreferences,
  listAutoArchiveSubscribers,
  shouldAutoArchive,
  runAutoArchiveForUser,
} from "./auto-archive";
import { authedUserId } from "./auth-types";
import {
  saveArticle,
  listArticles,
  patchArticle,
  getArticle,
} from "./articles";
import {
  getFolio,
  volumeNameForUser,
  AUTO_ARCHIVE_REGISTRY_VOLUME,
} from "./folio";
import type { ParsedArticle } from "./ingest";
import type { ArticleFrontmatter } from "./articles";

const USER_A = authedUserId("user_test_autoarchive_alice");
const USER_B = authedUserId("user_test_autoarchive_bob");

function parsed(): ParsedArticle {
  return {
    title: "T",
    byline: null,
    excerpt: null,
    siteName: null,
    lang: null,
    image: null,
    markdown: "hello ".repeat(50),
    wordCount: 50,
  };
}

async function clearUserArticles(userId: ReturnType<typeof authedUserId>) {
  const vol = getFolio().volume<ArticleFrontmatter>(volumeNameForUser(userId));
  const pages = await vol.list();
  for (const p of pages) await vol.delete(p.slug);
}

async function clearRegistry() {
  const vol = getFolio().volume(AUTO_ARCHIVE_REGISTRY_VOLUME);
  const pages = await vol.list();
  for (const p of pages) await vol.delete(p.slug);
}

async function setSavedAt(
  userId: ReturnType<typeof authedUserId>,
  id: string,
  savedAt: string,
) {
  const vol = getFolio().volume<ArticleFrontmatter>(volumeNameForUser(userId));
  await vol.patch(id, { frontmatter: { savedAt } });
}

beforeEach(async () => {
  await clearRegistry();
  await clearUserArticles(USER_A);
  await clearUserArticles(USER_B);
});

describe("shouldAutoArchive", () => {
  const now = new Date("2026-06-01T00:00:00.000Z");

  it("skips already archived articles", () => {
    expect(
      shouldAutoArchive(
        {
          savedAt: "2020-01-01T00:00:00.000Z",
          readAt: null,
          archivedAt: "2021-01-01T00:00:00.000Z",
        },
        { unreadAfterDays: 14, readAfterDays: 14 },
        now,
      ),
    ).toBe(false);
  });

  it("archives unread articles older than threshold by savedAt", () => {
    expect(
      shouldAutoArchive(
        {
          savedAt: "2026-05-01T00:00:00.000Z", // 31 days old
          readAt: null,
          archivedAt: null,
        },
        { unreadAfterDays: 30, readAfterDays: null },
        now,
      ),
    ).toBe(true);
  });

  it("skips unread articles newer than threshold", () => {
    expect(
      shouldAutoArchive(
        {
          savedAt: "2026-05-20T00:00:00.000Z", // 12 days old
          readAt: null,
          archivedAt: null,
        },
        { unreadAfterDays: 14, readAfterDays: null },
        now,
      ),
    ).toBe(false);
  });

  it("archives read articles older than threshold by readAt, not savedAt", () => {
    expect(
      shouldAutoArchive(
        {
          savedAt: "2020-01-01T00:00:00.000Z", // very old save
          readAt: "2026-05-29T00:00:00.000Z", // only 3 days ago
          archivedAt: null,
        },
        { unreadAfterDays: 14, readAfterDays: 14 },
        now,
      ),
    ).toBe(false);
  });

  it("archives read articles once readAt is old enough", () => {
    expect(
      shouldAutoArchive(
        {
          savedAt: "2020-01-01T00:00:00.000Z",
          readAt: "2026-05-01T00:00:00.000Z", // 31 days ago
          archivedAt: null,
        },
        { unreadAfterDays: null, readAfterDays: 30 },
        now,
      ),
    ).toBe(true);
  });

  it("null duration disables the matching rule", () => {
    // Read article, read rule disabled
    expect(
      shouldAutoArchive(
        {
          savedAt: "2020-01-01T00:00:00.000Z",
          readAt: "2020-01-02T00:00:00.000Z",
          archivedAt: null,
        },
        { unreadAfterDays: 14, readAfterDays: null },
        now,
      ),
    ).toBe(false);
    // Unread article, unread rule disabled
    expect(
      shouldAutoArchive(
        {
          savedAt: "2020-01-01T00:00:00.000Z",
          readAt: null,
          archivedAt: null,
        },
        { unreadAfterDays: null, readAfterDays: 30 },
        now,
      ),
    ).toBe(false);
  });
});

describe("getAutoArchivePreferences", () => {
  it("returns defaults for unknown users", async () => {
    const prefs = await getAutoArchivePreferences(
      authedUserId("user_unknown_aa"),
    );
    expect(prefs).toEqual({
      unreadAfterDays: null,
      readAfterDays: null,
      updatedAt: null,
    });
  });
});

describe("setAutoArchivePreferences", () => {
  it("persists both rules", async () => {
    const result = await setAutoArchivePreferences(USER_A, {
      unreadAfterDays: 30,
      readAfterDays: 14,
    });
    expect(result.unreadAfterDays).toBe(30);
    expect(result.readAfterDays).toBe(14);
    expect(result.updatedAt).toBeTruthy();

    const fetched = await getAutoArchivePreferences(USER_A);
    expect(fetched.unreadAfterDays).toBe(30);
    expect(fetched.readAfterDays).toBe(14);
  });

  it("removes the registry entry when both rules are null", async () => {
    await setAutoArchivePreferences(USER_A, {
      unreadAfterDays: 30,
      readAfterDays: 14,
    });
    const result = await setAutoArchivePreferences(USER_A, {
      unreadAfterDays: null,
      readAfterDays: null,
    });
    expect(result).toEqual({
      unreadAfterDays: null,
      readAfterDays: null,
      updatedAt: null,
    });
    const subs = await listAutoArchiveSubscribers();
    expect(subs.find((s) => s.userId === USER_A)).toBeUndefined();
  });

  it("rejects invalid durations", async () => {
    await expect(
      setAutoArchivePreferences(USER_A, {
        // @ts-expect-error — testing runtime guard
        unreadAfterDays: 7,
        readAfterDays: null,
      }),
    ).rejects.toThrow();
  });
});

describe("listAutoArchiveSubscribers", () => {
  it("includes users with at least one active rule", async () => {
    await setAutoArchivePreferences(USER_A, {
      unreadAfterDays: 30,
      readAfterDays: null,
    });
    await setAutoArchivePreferences(USER_B, {
      unreadAfterDays: null,
      readAfterDays: 90,
    });
    const subs = await listAutoArchiveSubscribers();
    const ids = subs.map((s) => s.userId).sort();
    expect(ids).toEqual([USER_A, USER_B].sort());
  });
});

describe("runAutoArchiveForUser", () => {
  it("archives unread inbox articles older than the unread threshold", async () => {
    const saved = await saveArticle(
      USER_A,
      "https://example.com/old",
      parsed(),
    );
    // Backdate savedAt
    await setSavedAt(USER_A, saved.id, "2026-01-01T00:00:00.000Z");

    const archived = await runAutoArchiveForUser(
      USER_A,
      { unreadAfterDays: 30, readAfterDays: null },
      new Date("2026-06-01T00:00:00.000Z"),
    );
    expect(archived).toBe(1);

    const article = await getArticle(USER_A, saved.id);
    expect(article?.archivedAt).toBeTruthy();
  });

  it("archives read articles based on readAt, not savedAt", async () => {
    const a = await saveArticle(USER_A, "https://example.com/a", parsed());
    // Mark it read "now" but backdate savedAt far in the past.
    await setSavedAt(USER_A, a.id, "2020-01-01T00:00:00.000Z");
    // Mark read at a specific date by patching readAt directly.
    await patchArticle(USER_A, a.id, { read: true });
    const vol = getFolio().volume<ArticleFrontmatter>(
      volumeNameForUser(USER_A),
    );
    await vol.patch(a.id, {
      frontmatter: { readAt: "2026-05-29T00:00:00.000Z" },
    });

    const archivedOnlyRead = await runAutoArchiveForUser(
      USER_A,
      { unreadAfterDays: null, readAfterDays: 14 },
      new Date("2026-06-01T00:00:00.000Z"),
    );
    // Read 3 days ago, threshold 14 → not yet.
    expect(archivedOnlyRead).toBe(0);

    const archivedLater = await runAutoArchiveForUser(
      USER_A,
      { unreadAfterDays: null, readAfterDays: 14 },
      new Date("2026-06-20T00:00:00.000Z"),
    );
    expect(archivedLater).toBe(1);
  });

  it("skips already archived articles", async () => {
    const a = await saveArticle(USER_A, "https://example.com/a", parsed());
    await setSavedAt(USER_A, a.id, "2020-01-01T00:00:00.000Z");
    await patchArticle(USER_A, a.id, { archived: true });

    const archived = await runAutoArchiveForUser(
      USER_A,
      { unreadAfterDays: 14, readAfterDays: 14 },
      new Date("2026-06-01T00:00:00.000Z"),
    );
    expect(archived).toBe(0);
  });

  it("is a no-op when both rules are null", async () => {
    const a = await saveArticle(USER_A, "https://example.com/a", parsed());
    await setSavedAt(USER_A, a.id, "2020-01-01T00:00:00.000Z");

    const archived = await runAutoArchiveForUser(USER_A, {
      unreadAfterDays: null,
      readAfterDays: null,
    });
    expect(archived).toBe(0);
    const inbox = await listArticles(USER_A, { view: "inbox" });
    expect(inbox).toHaveLength(1);
  });
});
