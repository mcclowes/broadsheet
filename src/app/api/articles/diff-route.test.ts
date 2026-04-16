import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.BROADSHEET_FOLIO_ADAPTER = "memory";
});

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: "user_diff_route_test" }),
}));

// `fetchAndParse` would open real sockets; stub it out so the test can count
// invocations and assert the cache short-circuits the second call.
const fetchAndParseMock = vi.fn();
vi.mock("@/lib/ingest", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/ingest")>("@/lib/ingest");
  return {
    ...actual,
    fetchAndParse: (...args: unknown[]) => fetchAndParseMock(...args),
  };
});

import { GET, _clearDiffFetchCache } from "@/app/api/articles/[id]/diff/route";
import { saveArticle } from "@/lib/articles";
import { authedUserId } from "@/lib/auth-types";
import { getFolio, volumeNameForUser } from "@/lib/folio";
import { IngestError } from "@/lib/ingest";

const USER = authedUserId("user_diff_route_test");

async function seedArticle(url: string, markdown: string) {
  return saveArticle(USER, url, {
    title: "Title",
    byline: null,
    excerpt: null,
    siteName: null,
    lang: null,
    image: null,
    markdown,
    wordCount: markdown.split(/\s+/).length,
  });
}

function diffReq(id: string): Request {
  return new Request(`http://localhost/api/articles/${id}/diff`, {
    method: "GET",
  });
}

beforeEach(async () => {
  _clearDiffFetchCache();
  fetchAndParseMock.mockReset();
  const v = getFolio().volume(volumeNameForUser(USER));
  const pages = await v.list();
  for (const p of pages) await v.delete(p.slug);
});

describe("GET /api/articles/[id]/diff", () => {
  it("caches the fetched markdown across repeated calls", async () => {
    const saved = await seedArticle(
      "https://example.com/diff-cache-a",
      "Original stored body",
    );

    fetchAndParseMock.mockResolvedValue({
      parsed: {
        title: "T",
        byline: null,
        excerpt: null,
        siteName: null,
        lang: null,
        image: null,
        markdown: "Fresh upstream body",
        wordCount: 3,
      },
      finalUrl: saved.url,
    });

    const first = await GET(diffReq(saved.id), {
      params: Promise.resolve({ id: saved.id }),
    });
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.hasChanges).toBe(true);
    expect(firstBody.fetchedAt).toBeTruthy();
    expect(fetchAndParseMock).toHaveBeenCalledTimes(1);

    const second = await GET(diffReq(saved.id), {
      params: Promise.resolve({ id: saved.id }),
    });
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    // Cache hit: no additional upstream fetch, same fetchedAt timestamp.
    expect(fetchAndParseMock).toHaveBeenCalledTimes(1);
    expect(secondBody.fetchedAt).toBe(firstBody.fetchedAt);
    expect(secondBody.hasChanges).toBe(true);
  });

  it("does not cache a failed upstream fetch", async () => {
    const saved = await seedArticle(
      "https://example.com/diff-cache-b",
      "Stored body",
    );

    fetchAndParseMock.mockRejectedValueOnce(
      new IngestError("boom", undefined, "Upstream unavailable"),
    );
    const failed = await GET(diffReq(saved.id), {
      params: Promise.resolve({ id: saved.id }),
    });
    expect(failed.status).toBe(502);

    fetchAndParseMock.mockResolvedValueOnce({
      parsed: {
        title: "T",
        byline: null,
        excerpt: null,
        siteName: null,
        lang: null,
        image: null,
        markdown: "Stored body",
        wordCount: 2,
      },
      finalUrl: saved.url,
    });
    const retry = await GET(diffReq(saved.id), {
      params: Promise.resolve({ id: saved.id }),
    });
    expect(retry.status).toBe(200);
    // Failed call must not poison the cache — retry has to re-fetch.
    expect(fetchAndParseMock).toHaveBeenCalledTimes(2);
  });

  it("rejects requests with a malformed id without fetching upstream", async () => {
    const res = await GET(diffReq("not-a-real-id"), {
      params: Promise.resolve({ id: "not-a-real-id" }),
    });
    expect(res.status).toBe(400);
    expect(fetchAndParseMock).not.toHaveBeenCalled();
  });
});
