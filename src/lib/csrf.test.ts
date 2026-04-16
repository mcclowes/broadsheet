import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Re-import after env mutation requires dynamic import
async function loadCheckOrigin() {
  // Clear module cache so buildAllowlist() re-reads env
  vi.resetModules();
  const mod = await import("./csrf");
  return mod.checkOrigin;
}

function reqWithOrigin(origin: string | null): Request {
  const headers = new Headers();
  if (origin !== null) headers.set("origin", origin);
  return new Request("https://broadsheet.marginalutility.dev/api/articles", {
    method: "POST",
    headers,
  });
}

describe("checkOrigin", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllEnvs();
  });

  it("allows requests with no Origin header", async () => {
    const checkOrigin = await loadCheckOrigin();
    expect(checkOrigin(reqWithOrigin(null))).toBeNull();
  });

  it("allows the production origin", async () => {
    const checkOrigin = await loadCheckOrigin();
    expect(
      checkOrigin(reqWithOrigin("https://broadsheet.marginalutility.dev")),
    ).toBeNull();
  });

  it("allows localhost dev origin", async () => {
    const checkOrigin = await loadCheckOrigin();
    expect(checkOrigin(reqWithOrigin("http://localhost:3000"))).toBeNull();
  });

  it("allows any chrome extension origin when no allowlist env set (local dev)", async () => {
    delete process.env.BROADSHEET_EXTENSION_IDS;
    delete process.env.VERCEL_ENV;
    vi.stubEnv("NODE_ENV", "development");
    const checkOrigin = await loadCheckOrigin();
    expect(
      checkOrigin(
        reqWithOrigin("chrome-extension://abcdefghijklmnopqrstuvwxyz"),
      ),
    ).toBeNull();
  });

  it("rejects extension origins on Vercel preview deploys with no allowlist", async () => {
    delete process.env.BROADSHEET_EXTENSION_IDS;
    process.env.VERCEL_ENV = "preview";
    const checkOrigin = await loadCheckOrigin();
    const response = checkOrigin(
      reqWithOrigin("chrome-extension://abcdefghijklmnopqrstuvwxyz"),
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(403);
  });

  it("accepts moz-extension:// origins when in the allowlist", async () => {
    process.env.BROADSHEET_EXTENSION_IDS =
      "abcdefghijklmnopqrstuvwxyz,11111111-2222-3333-4444-555555555555";
    const checkOrigin = await loadCheckOrigin();
    expect(
      checkOrigin(
        reqWithOrigin("moz-extension://11111111-2222-3333-4444-555555555555"),
      ),
    ).toBeNull();
    const blocked = checkOrigin(
      reqWithOrigin("moz-extension://00000000-0000-0000-0000-000000000000"),
    );
    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(403);
  });

  it("accepts safari-web-extension:// origins when in the allowlist", async () => {
    process.env.BROADSHEET_EXTENSION_IDS = "AAAA.com.example.broadsheet";
    const checkOrigin = await loadCheckOrigin();
    expect(
      checkOrigin(
        reqWithOrigin("safari-web-extension://AAAA.com.example.broadsheet"),
      ),
    ).toBeNull();
  });

  it("allows only allowlisted chrome extension IDs when env is set", async () => {
    process.env.BROADSHEET_EXTENSION_IDS =
      "abcdefghijklmnopqrstuvwxyz,pqrstuvwxyzabcdefghijklmno";
    const checkOrigin = await loadCheckOrigin();
    expect(
      checkOrigin(
        reqWithOrigin("chrome-extension://abcdefghijklmnopqrstuvwxyz"),
      ),
    ).toBeNull();
    expect(
      checkOrigin(
        reqWithOrigin("chrome-extension://pqrstuvwxyzabcdefghijklmno"),
      ),
    ).toBeNull();
    const blocked = checkOrigin(
      reqWithOrigin("chrome-extension://maliciousextensionid0000000"),
    );
    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(403);
  });

  it("rejects all extension origins in production when no allowlist set", async () => {
    delete process.env.BROADSHEET_EXTENSION_IDS;
    process.env.VERCEL_ENV = "production";
    const checkOrigin = await loadCheckOrigin();
    const response = checkOrigin(
      reqWithOrigin("chrome-extension://abcdefghijklmnopqrstuvwxyz"),
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(403);
  });

  it("rejects a foreign origin with 403", async () => {
    const checkOrigin = await loadCheckOrigin();
    const response = checkOrigin(reqWithOrigin("https://evil.example.com"));
    expect(response).not.toBeNull();
    expect(response!.status).toBe(403);
    const body = await response!.json();
    expect(body.error).toBe("Forbidden");
  });

  it("rejects http version of production origin", async () => {
    const checkOrigin = await loadCheckOrigin();
    const response = checkOrigin(
      reqWithOrigin("http://broadsheet.marginalutility.dev"),
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(403);
  });

  it("allows Vercel preview deployment origin from VERCEL_URL", async () => {
    process.env.VERCEL_URL = "broadsheet-abc123-mcclowes-projects.vercel.app";
    const checkOrigin = await loadCheckOrigin();
    expect(
      checkOrigin(
        reqWithOrigin("https://broadsheet-abc123-mcclowes-projects.vercel.app"),
      ),
    ).toBeNull();
  });

  it("allows Vercel branch URL from VERCEL_BRANCH_URL", async () => {
    process.env.VERCEL_BRANCH_URL =
      "broadsheet-git-feat-xyz-mcclowes-projects.vercel.app";
    const checkOrigin = await loadCheckOrigin();
    expect(
      checkOrigin(
        reqWithOrigin(
          "https://broadsheet-git-feat-xyz-mcclowes-projects.vercel.app",
        ),
      ),
    ).toBeNull();
  });
});
