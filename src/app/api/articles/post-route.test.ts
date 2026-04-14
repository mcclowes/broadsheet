import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.BROADSHEET_FOLIO_ADAPTER = "memory";
});

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: "user_post_route_test" }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { POST } from "./route";
import { authedUserId } from "@/lib/auth-types";
import { getFolio, volumeNameForUser } from "@/lib/folio";
import { listUnanchoredHighlights } from "@/lib/annotations";
import { articleIdForUrl } from "@/lib/articles";

const USER = authedUserId("user_post_route_test");

const HTML = `<!doctype html><html><head><title>Test Post</title></head>
<body><article><h1>Test Post</h1>
<p>The quick brown fox jumps over the lazy dog. This is enough body text to satisfy readability parsing so that the article is ingested successfully for our tests.</p>
<p>Second paragraph with more words to ensure the extractor returns a usable article body for the downstream save path.</p>
</article></body></html>`;

async function clearVolumes() {
  for (const name of [
    volumeNameForUser(USER),
    volumeNameForUser(USER, "annotations"),
  ]) {
    const v = getFolio().volume(name);
    for (const p of await v.list()) await v.delete(p.slug);
  }
}

beforeEach(clearVolumes);

describe("POST /api/articles with selection", () => {
  it("stores an unanchored highlight when selection.text is provided", async () => {
    const url = "https://example.com/selection-test";
    const req = new Request(
      "https://broadsheet.marginalutility.dev/api/articles",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          html: HTML,
          selection: { text: "quick brown fox" },
        }),
      },
    );

    const res = await POST(req);
    expect(res.status).toBe(201);
    const payload = await res.json();
    expect(payload.article.id).toBe(articleIdForUrl(url));

    const highlights = await listUnanchoredHighlights(USER, payload.article.id);
    expect(highlights).toHaveLength(1);
    expect(highlights[0].text).toBe("quick brown fox");
  });

  it("does not create a highlight when no selection is sent", async () => {
    const url = "https://example.com/no-selection";
    const req = new Request(
      "https://broadsheet.marginalutility.dev/api/articles",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, html: HTML }),
      },
    );

    const res = await POST(req);
    expect(res.status).toBe(201);
    const payload = await res.json();
    const highlights = await listUnanchoredHighlights(USER, payload.article.id);
    expect(highlights).toHaveLength(0);
  });
});
