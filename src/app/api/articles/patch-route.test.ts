import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.BROADSHEET_FOLIO_ADAPTER = "memory";
});

// Mock Clerk auth() to return a known userId
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: "user_route_test" }),
}));

// `revalidatePath` requires a Next.js request context; no-op in route tests.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { PATCH } from "./[id]/route";
import { saveArticle, getArticle } from "@/lib/articles";
import { authedUserId } from "@/lib/auth-types";
import { getFolio, volumeNameForUser } from "@/lib/folio";

const USER = authedUserId("user_route_test");

beforeEach(async () => {
  const v = getFolio().volume(volumeNameForUser(USER));
  const pages = await v.list();
  for (const p of pages) await v.delete(p.slug);
});

describe("PATCH /api/articles/[id]", () => {
  it("marks an article as read", async () => {
    const s = await saveArticle(USER, "https://example.com/route-read", {
      title: "T",
      byline: null,
      excerpt: null,
      siteName: null,
      lang: null,
      image: null,
      markdown: "Hello world example body content here",
      wordCount: 6,
    });

    const req = new Request(`http://localhost/api/articles/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read: true }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: s.id }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    const a = await getArticle(USER, s.id);
    expect(a!.readAt).toBeTruthy();
  });

  it("rejects with 400 for malformed id", async () => {
    const req = new Request(`http://localhost/api/articles/bad-id`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read: true }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "bad-id" }) });
    expect(res.status).toBe(400);
  });

  it("returns 404 for missing article", async () => {
    const req = new Request(`http://localhost/api/articles/${"a".repeat(32)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read: true }),
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "a".repeat(32) }),
    });
    expect(res.status).toBe(404);
  });

  it("accepts a payload that includes unknown keys (e.g. clientTimestamp from offline sync)", async () => {
    const s = await saveArticle(USER, "https://example.com/route-extra", {
      title: "T",
      byline: null,
      excerpt: null,
      siteName: null,
      lang: null,
      image: null,
      markdown: "Hello world example body content here",
      wordCount: 6,
    });
    const req = new Request(`http://localhost/api/articles/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        read: true,
        clientTimestamp: "2026-04-12T12:00:00.000Z",
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: s.id }) });
    expect(res.status).toBe(200);
    const a = await getArticle(USER, s.id);
    expect(a!.readAt).toBeTruthy();
  });
});
