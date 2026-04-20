import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.BROADSHEET_FOLIO_ADAPTER = "memory";
});

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));

const fetchImageMock = vi.fn();
vi.mock("@/lib/ingest", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/ingest")>("@/lib/ingest");
  return {
    ...actual,
    fetchPublicImage: (...args: unknown[]) => fetchImageMock(...args),
  };
});

import { GET } from "@/app/api/image/route";
import { IngestError } from "@/lib/ingest";
import { imageProxyLimiter } from "@/lib/rate-limit";

function imgReq(url?: string): Request {
  const qs = url ? `?url=${encodeURIComponent(url)}` : "";
  return new Request(`http://localhost/api/image${qs}`, { method: "GET" });
}

beforeEach(() => {
  authMock.mockReset();
  fetchImageMock.mockReset();
  // Per-user limiter is keyed on userId; use a fresh id each test to
  // sidestep cross-test interference without reaching into internals.
});

describe("GET /api/image", () => {
  it("401s when unauthenticated", async () => {
    authMock.mockResolvedValue({ userId: null });
    const res = await GET(imgReq("https://example.com/x.jpg"));
    expect(res.status).toBe(401);
    expect(fetchImageMock).not.toHaveBeenCalled();
  });

  it("400s when url parameter is missing", async () => {
    authMock.mockResolvedValue({ userId: "user_img_missing" });
    const res = await GET(imgReq());
    expect(res.status).toBe(400);
    expect(fetchImageMock).not.toHaveBeenCalled();
  });

  it("422s when upstream is rejected by SSRF / content-type guards", async () => {
    authMock.mockResolvedValue({ userId: "user_img_ssrf" });
    fetchImageMock.mockRejectedValue(
      new IngestError(
        "Refusing to fetch private address 10.0.0.1",
        undefined,
        "Refusing to fetch a non-public address",
      ),
    );
    const res = await GET(imgReq("http://internal.invalid/x.jpg"));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Refusing to fetch a non-public address");
  });

  it("500s on unexpected upstream errors", async () => {
    authMock.mockResolvedValue({ userId: "user_img_500" });
    fetchImageMock.mockRejectedValue(new Error("socket hang up"));
    const res = await GET(imgReq("https://example.com/x.jpg"));
    expect(res.status).toBe(500);
  });

  it("returns the image bytes with caching + type headers on success", async () => {
    authMock.mockResolvedValue({ userId: "user_img_ok" });
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
    fetchImageMock.mockResolvedValue({
      bytes,
      contentType: "image/png",
      finalUrl: "https://example.com/x.png",
    });

    const res = await GET(imgReq("https://example.com/x.png"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=86400");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.equals(bytes)).toBe(true);
  });

  it("429s with Retry-After once the per-user bucket is drained", async () => {
    const userId = "user_img_rate";
    authMock.mockResolvedValue({ userId });
    fetchImageMock.mockResolvedValue({
      bytes: Buffer.from([0]),
      contentType: "image/png",
      finalUrl: "https://example.com/x.png",
    });

    // Drain the bucket directly, then make a real request and assert 429.
    for (;;) {
      const result = imageProxyLimiter.consume(userId);
      if (!result.allowed) break;
    }

    const res = await GET(imgReq("https://example.com/x.png"));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });
});
