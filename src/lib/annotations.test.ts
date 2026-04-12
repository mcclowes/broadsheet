import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.BROADSHEET_FOLIO_ADAPTER = "memory";
});

import {
  addHighlight,
  deleteHighlight,
  listHighlights,
  sortHighlights,
  updateHighlight,
  type Highlight,
} from "./annotations";
import { authedUserId } from "./auth-types";
import { getFolio, volumeNameForUser } from "./folio";

const USER = authedUserId("user_test_anno_alice");
const OTHER = authedUserId("user_test_anno_bob");
const ARTICLE = "a".repeat(32);

async function clearVolume(userId: ReturnType<typeof authedUserId>) {
  const vol = getFolio().volume(volumeNameForUser(userId, "annotations"));
  const pages = await vol.list();
  for (const p of pages) await vol.delete(p.slug);
}

beforeEach(async () => {
  await clearVolume(USER);
  await clearVolume(OTHER);
});

describe("sortHighlights", () => {
  it("sorts by start then end", () => {
    const h = (start: number, end: number): Highlight => ({
      id: `${start}-${end}`,
      start,
      end,
      text: "t",
      note: null,
      color: "yellow",
      createdAt: "",
      updatedAt: "",
    });
    const sorted = sortHighlights([h(10, 20), h(5, 8), h(5, 12)]);
    expect(sorted.map((x) => x.id)).toEqual(["5-8", "5-12", "10-20"]);
  });
});

describe("annotations storage", () => {
  it("adds, lists, updates, and deletes highlights", async () => {
    const empty = await listHighlights(USER, ARTICLE);
    expect(empty).toEqual([]);

    const h1 = await addHighlight(USER, ARTICLE, {
      start: 10,
      end: 20,
      text: "hello world",
    });
    expect(h1.color).toBe("yellow");
    expect(h1.note).toBeNull();

    const h2 = await addHighlight(USER, ARTICLE, {
      start: 0,
      end: 5,
      text: "early",
      note: "a note",
      color: "green",
    });

    const listed = await listHighlights(USER, ARTICLE);
    expect(listed.map((h) => h.id)).toEqual([h2.id, h1.id]);

    const updated = await updateHighlight(USER, ARTICLE, h1.id, {
      note: "added later",
      color: "pink",
    });
    expect(updated?.note).toBe("added later");
    expect(updated?.color).toBe("pink");

    const removed = await deleteHighlight(USER, ARTICLE, h2.id);
    expect(removed).toBe(true);

    const finalList = await listHighlights(USER, ARTICLE);
    expect(finalList.map((h) => h.id)).toEqual([h1.id]);
  });

  it("isolates highlights between users", async () => {
    await addHighlight(USER, ARTICLE, { start: 0, end: 5, text: "mine" });
    const otherList = await listHighlights(OTHER, ARTICLE);
    expect(otherList).toEqual([]);
  });

  it("rejects invalid ranges", async () => {
    await expect(
      addHighlight(USER, ARTICLE, { start: 10, end: 10, text: "x" }),
    ).rejects.toThrow();
    await expect(
      addHighlight(USER, ARTICLE, { start: 10, end: 5, text: "x" }),
    ).rejects.toThrow();
  });

  it("returns null when updating missing highlight", async () => {
    const result = await updateHighlight(USER, ARTICLE, "no-such-id", {
      note: "x",
    });
    expect(result).toBeNull();
  });

  it("returns false when deleting missing highlight", async () => {
    const result = await deleteHighlight(USER, ARTICLE, "no-such-id");
    expect(result).toBe(false);
  });
});
