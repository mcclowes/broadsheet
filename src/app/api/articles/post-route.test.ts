import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.BROADSHEET_FOLIO_ADAPTER = "memory";
});

// Mock Clerk auth() to return a known userId
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: "user_post_route_test" }),
}));

// Avoid making any real HTTP requests when the body lacks `html`.
// All tests pass `html` explicitly so this guards against accidents.
vi.mock("@/lib/ingest", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/ingest")>();
  return {
    ...orig,
    fetchAndParse: vi.fn(async () => {
      throw new Error("fetchAndParse should not be called in this test");
    }),
  };
});

import { POST } from "./route";
import { listHighlights, listUnanchoredHighlights } from "@/lib/annotations";
import { authedUserId } from "@/lib/auth-types";
import { getFolio, volumeNameForUser } from "@/lib/folio";

const USER = authedUserId("user_post_route_test");

beforeEach(async () => {
  for (const name of [
    volumeNameForUser(USER),
    volumeNameForUser(USER, "annotations"),
  ]) {
    const v = getFolio().volume(name);
    const pages = await v.list();
    for (const p of pages) await v.delete(p.slug);
  }
});

const ARTICLE_HTML = `<!doctype html>
<html><head><title>Selection Test</title></head>
<body>
<article>
<h1>Selection Test</h1>
<p>The lazy brown dog sleeps. The quick brown fox jumps over the lazy brown dog. The end is near.</p>
<p>Another paragraph for padding so Readability is happy and pulls the content out cleanly.</p>
</article>
</body></html>`;

describe("POST /api/articles selection → highlight", () => {
  it("creates an anchored highlight when selection text is found", async () => {
    const req = new Request("http://localhost/api/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/select-anchor",
        html: ARTICLE_HTML,
        selection: { text: "quick brown fox" },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.highlight).toBe("anchored");

    const highlights = await listHighlights(USER, data.article.id);
    expect(highlights).toHaveLength(1);
    expect(highlights[0].text).toBe("quick brown fox");
    expect(highlights[0].end).toBeGreaterThan(highlights[0].start);

    const unanchored = await listUnanchoredHighlights(USER, data.article.id);
    expect(unanchored).toHaveLength(0);
  });

  it("creates an unanchored highlight when selection text is not in the article", async () => {
    const req = new Request("http://localhost/api/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/select-miss",
        html: ARTICLE_HTML,
        selection: { text: "this exact phrase does not appear in the body" },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.highlight).toBe("unanchored");

    const highlights = await listHighlights(USER, data.article.id);
    expect(highlights).toHaveLength(0);

    const unanchored = await listUnanchoredHighlights(USER, data.article.id);
    expect(unanchored).toHaveLength(1);
    expect(unanchored[0].text).toBe(
      "this exact phrase does not appear in the body",
    );
  });

  it("saves without a highlight when no selection is provided (regression)", async () => {
    const req = new Request("http://localhost/api/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/no-selection",
        html: ARTICLE_HTML,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.highlight).toBe("skipped");

    const highlights = await listHighlights(USER, data.article.id);
    const unanchored = await listUnanchoredHighlights(USER, data.article.id);
    expect(highlights).toHaveLength(0);
    expect(unanchored).toHaveLength(0);
  });

  it("rejects an empty selection.text with 400", async () => {
    const req = new Request("http://localhost/api/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/empty-selection",
        html: ARTICLE_HTML,
        selection: { text: "" },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("attaches a highlight to an already-saved article (created=false)", async () => {
    const body = {
      url: "https://example.com/already-saved",
      html: ARTICLE_HTML,
    };
    const first = await POST(
      new Request("http://localhost/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    expect(first.status).toBe(201);

    const second = await POST(
      new Request("http://localhost/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          selection: { text: "quick brown fox" },
        }),
      }),
    );
    expect(second.status).toBe(200);
    const data = await second.json();
    expect(data.created).toBe(false);
    expect(data.highlight).toBe("anchored");

    const highlights = await listHighlights(USER, data.article.id);
    expect(highlights).toHaveLength(1);
  });
});
