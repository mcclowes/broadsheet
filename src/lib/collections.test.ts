import { describe, expect, it } from "vitest";
import {
  createCollection,
  listCollections,
  getCollection,
  updateCollection,
  deleteCollection,
  addArticleToCollection,
  removeArticleFromCollection,
  listCollectionsForArticle,
} from "./collections";

const USER = "test-user-collections";

describe("collections", () => {
  it("creates and retrieves a collection", async () => {
    const col = await createCollection(USER, {
      name: "Research",
      description: "ML papers",
    });
    expect(col.id).toBeTruthy();
    expect(col.name).toBe("Research");
    expect(col.description).toBe("ML papers");
    expect(col.articleIds).toEqual([]);

    const fetched = await getCollection(USER, col.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe("Research");
  });

  it("lists collections sorted by updatedAt descending", async () => {
    const a = await createCollection(USER, { name: `Col A ${Date.now()}` });
    const b = await createCollection(USER, { name: `Col B ${Date.now()}` });

    const all = await listCollections(USER);
    const ids = all.map((c) => c.id);
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
  });

  it("updates a collection", async () => {
    const col = await createCollection(USER, { name: "Old name" });
    const updated = await updateCollection(USER, col.id, {
      name: "New name",
      description: "Updated desc",
    });
    expect(updated.name).toBe("New name");
    expect(updated.description).toBe("Updated desc");
  });

  it("deletes a collection", async () => {
    const col = await createCollection(USER, { name: "To delete" });
    await deleteCollection(USER, col.id);
    const fetched = await getCollection(USER, col.id);
    expect(fetched).toBeNull();
  });

  it("adds and removes articles from a collection", async () => {
    const col = await createCollection(USER, { name: "Articles col" });

    const updated = await addArticleToCollection(USER, col.id, "art-1");
    expect(updated.articleIds).toContain("art-1");

    const updated2 = await addArticleToCollection(USER, col.id, "art-2");
    expect(updated2.articleIds).toEqual(["art-1", "art-2"]);

    // dedup — adding same article again is a no-op
    const updated3 = await addArticleToCollection(USER, col.id, "art-1");
    expect(updated3.articleIds).toEqual(["art-1", "art-2"]);

    const removed = await removeArticleFromCollection(USER, col.id, "art-1");
    expect(removed.articleIds).toEqual(["art-2"]);
  });

  it("lists collections containing a specific article", async () => {
    const col1 = await createCollection(USER, { name: `Set1 ${Date.now()}` });
    const col2 = await createCollection(USER, { name: `Set2 ${Date.now()}` });
    await createCollection(USER, { name: `Set3 ${Date.now()}` });

    await addArticleToCollection(USER, col1.id, "art-x");
    await addArticleToCollection(USER, col2.id, "art-x");

    const matching = await listCollectionsForArticle(USER, "art-x");
    const ids = matching.map((c) => c.id);
    expect(ids).toContain(col1.id);
    expect(ids).toContain(col2.id);
    expect(ids).toHaveLength(2);
  });

  it("throws when adding article to nonexistent collection", async () => {
    await expect(
      addArticleToCollection(USER, "nonexistent", "art-1"),
    ).rejects.toThrow("Collection not found");
  });
});
