import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.BROADSHEET_FOLIO_ADAPTER = "memory";
});

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: "user_post_route_test" }),
}));

// Stub network — the route would call fetchAndParse when no html is given.
// Using the html path avoids the stub entirely.
const fetchAndParseMock = vi.fn();
vi.mock("@/lib/ingest", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/ingest")>("@/lib/ingest");
  return {
    ...actual,
    fetchAndParse: (...args: unknown[]) => fetchAndParseMock(...args),
  };
});

import { POST } from "@/app/api/articles/route";
import { listHighlights, listUnanchoredHighlights } from "@/lib/annotations";
import { authedUserId } from "@/lib/auth-types";
import { getFolio, volumeNameForUser } from "@/lib/folio";
import { articlePlaintext } from "@/lib/markdown";

const USER = authedUserId("user_post_route_test");

function postReq(body: unknown): Request {
  return new Request("http://localhost/api/articles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Readability rejects very-short bodies as paywall teasers, so pad this out
// with filler content that still leaves the target phrase unique.
const FILLER = Array.from(
  { length: 40 },
  (_, i) => `<p>Filler paragraph number ${i} with some written content.</p>`,
).join("\n");
const ARTICLE_HTML = `<!doctype html><html><head><title>Sample long-form piece</title></head>
<body><article><h1>Sample long-form piece</h1>
<p>This paragraph has unique phrasing we can anchor against.</p>
${FILLER}</article></body></html>`;

beforeEach(async () => {
  for (const ns of [undefined, "annotations" as const]) {
    const v = getFolio().volume(volumeNameForUser(USER, ns));
    const pages = await v.list();
    for (const p of pages) await v.delete(p.slug);
  }
});

describe("POST /api/articles with selection", () => {
  it("creates an anchored highlight when the selection is found in the article body", async () => {
    const url = "https://example.com/anchor-hit";
    const selection = { text: "unique phrasing we can anchor against" };
    const res = await POST(postReq({ url, html: ARTICLE_HTML, selection }));
    expect(res.status).toBe(201);
    const { article } = (await res.json()) as { article: { id: string } };

    const highlights = await listHighlights(USER, article.id);
    expect(highlights).toHaveLength(1);
    expect(highlights[0].text).toBe(selection.text);
    expect(highlights[0].end - highlights[0].start).toBe(selection.text.length);
  });

  it("falls back to an unanchored highlight when the selection doesn't match", async () => {
    const res = await POST(
      postReq({
        url: "https://example.com/anchor-miss",
        html: ARTICLE_HTML,
        selection: { text: "not present in the article at all" },
      }),
    );
    expect(res.status).toBe(201);
    const { article } = (await res.json()) as { article: { id: string } };

    const highlights = await listHighlights(USER, article.id);
    const unanchored = await listUnanchoredHighlights(USER, article.id);
    expect(highlights).toHaveLength(0);
    expect(unanchored).toHaveLength(1);
    expect(unanchored[0].text).toBe("not present in the article at all");
  });

  it("still persists the article if the selection handling throws (best-effort)", async () => {
    const res = await POST(
      postReq({
        url: "https://example.com/anchor-empty",
        html: ARTICLE_HTML,
        selection: { text: "   " },
      }),
    );
    // The zod min(1) is satisfied by the whitespace; server trims, ends up
    // skipping the attach, and returns a normal 201.
    expect(res.status).toBe(201);
    const { article } = (await res.json()) as { article: { id: string } };
    const highlights = await listHighlights(USER, article.id);
    const unanchored = await listUnanchoredHighlights(USER, article.id);
    expect(highlights).toHaveLength(0);
    expect(unanchored).toHaveLength(0);
  });

  it("plaintext helper matches the offsets the annotator's DOM walker would produce", () => {
    // The anchoring contract is "start/end are character offsets into the
    // rendered article plaintext". Lock the contract: the helper should
    // concatenate text nodes in document order, the same way the client's
    // TreeWalker(SHOW_TEXT) does.
    const md = "# Heading\n\nFirst paragraph.\n\nSecond has a **bold** word.\n";
    const text = articlePlaintext(md);
    expect(text).toContain("First paragraph.");
    expect(text).toContain("Second has a bold word.");
    expect(text.indexOf("First paragraph.")).toBeLessThan(
      text.indexOf("Second has a bold word."),
    );
  });
});
