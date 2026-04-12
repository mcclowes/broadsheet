import { describe, expect, it, beforeEach } from "vitest";
import {
  addAnnotation,
  listAnnotations,
  updateAnnotation,
  removeAnnotation,
} from "./annotations";
import { addHighlight } from "./highlights";
import { saveArticle } from "./articles";
import type { ParsedArticle } from "./ingest";

const USER = "test-user-annotations";

function makeParsed(): ParsedArticle {
  return {
    title: "Annotation test",
    byline: null,
    excerpt: null,
    siteName: null,
    lang: null,
    markdown: "Some article text for annotation testing.",
    wordCount: 7,
  };
}

describe("annotations", () => {
  let articleId: string;

  beforeEach(async () => {
    const url = `https://example.com/ann-test-${Date.now()}-${Math.random()}`;
    const summary = await saveArticle(USER, url, makeParsed());
    articleId = summary.id;
  });

  it("adds an article-level annotation", async () => {
    const ann = await addAnnotation(USER, articleId, {
      body: "Great article overall",
    });
    expect(ann.id).toBeTruthy();
    expect(ann.body).toBe("Great article overall");
    expect(ann.highlightId).toBeNull();

    const all = await listAnnotations(USER, articleId);
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(ann.id);
  });

  it("adds an annotation linked to a highlight", async () => {
    const h = await addHighlight(USER, articleId, {
      text: "article text",
      startOffset: 5,
      endOffset: 17,
    });
    const ann = await addAnnotation(USER, articleId, {
      body: "This is key",
      highlightId: h.id,
    });
    expect(ann.highlightId).toBe(h.id);
  });

  it("updates an annotation", async () => {
    const ann = await addAnnotation(USER, articleId, { body: "Original" });
    const updated = await updateAnnotation(USER, articleId, ann.id, {
      body: "Updated body",
    });
    expect(updated.body).toBe("Updated body");
    expect(updated.updatedAt).not.toBe(ann.updatedAt);

    const all = await listAnnotations(USER, articleId);
    expect(all[0].body).toBe("Updated body");
  });

  it("removes an annotation", async () => {
    const ann1 = await addAnnotation(USER, articleId, { body: "First" });
    await addAnnotation(USER, articleId, { body: "Second" });

    await removeAnnotation(USER, articleId, ann1.id);
    const all = await listAnnotations(USER, articleId);
    expect(all).toHaveLength(1);
    expect(all[0].body).toBe("Second");
  });

  it("throws when updating nonexistent annotation", async () => {
    await expect(
      updateAnnotation(USER, articleId, "nope", { body: "test" }),
    ).rejects.toThrow("Annotation not found");
  });

  it("returns empty array for nonexistent article", async () => {
    const all = await listAnnotations(USER, "nonexistent");
    expect(all).toEqual([]);
  });
});
