/**
 * Tests for the Next.js middleware. We test the pure `handleProxy` export
 * rather than the Clerk-wrapped default so we don't have to stub the full
 * Clerk runtime. The invariants under test are the contract:
 *
 *   1. Unauthenticated requests to protected API routes get 401.
 *   2. Cross-origin mutating requests get 403, even when authenticated.
 *   3. Unauthenticated requests to protected pages call `auth.protect()`.
 *   4. Public API routes (webhook/cron/unsubscribe) pass through.
 *   5. Path-segment boundary holds: `/library-foo` is NOT protected.
 */
import { describe, expect, it, vi } from "vitest";
import { handleProxy, type ProxyAuth } from "./proxy";

interface MockAuth extends ProxyAuth {
  protect: ProxyAuth["protect"] & ReturnType<typeof vi.fn>;
}

function mockAuth(userId: string | null): MockAuth {
  const fn = (async () => ({ userId })) as MockAuth;
  fn.protect = vi.fn<() => Promise<unknown>>(
    async () => undefined,
  ) as MockAuth["protect"];
  return fn;
}

function req(
  url: string,
  init: {
    method?: string;
    origin?: string | null;
  } = {},
): Request {
  const headers = new Headers();
  if (init.origin !== undefined && init.origin !== null) {
    headers.set("origin", init.origin);
  }
  return new Request(url, { method: init.method ?? "GET", headers });
}

describe("handleProxy — protected API auth", () => {
  it.each([
    ["/api/articles", "GET"],
    ["/api/articles/abc123", "GET"],
    ["/api/articles/abc123/annotations", "GET"],
    ["/api/sources", "GET"],
    ["/api/sources/xyz", "DELETE"],
    ["/api/digest/preferences", "GET"],
    ["/api/import/pocket", "POST"],
    ["/api/settings/auto-archive", "GET"],
  ])("returns 401 for unauthed %s %s", async (path, method) => {
    const auth = mockAuth(null);
    const res = await handleProxy(
      auth,
      req(`https://broadsheet.marginalutility.dev${path}`, {
        method,
        origin: "https://broadsheet.marginalutility.dev",
      }),
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(401);
  });

  it("returns undefined (pass-through) when authed", async () => {
    const auth = mockAuth("user_abc");
    const res = await handleProxy(
      auth,
      req("https://broadsheet.marginalutility.dev/api/articles", {
        method: "GET",
        origin: "https://broadsheet.marginalutility.dev",
      }),
    );
    expect(res).toBeUndefined();
  });
});

describe("handleProxy — CSRF", () => {
  it("rejects a cross-origin POST to a protected API", async () => {
    const auth = mockAuth("user_abc");
    const res = await handleProxy(
      auth,
      req("https://broadsheet.marginalutility.dev/api/articles", {
        method: "POST",
        origin: "https://attacker.example",
      }),
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(403);
  });

  it("allows a same-origin POST to a protected API", async () => {
    const auth = mockAuth("user_abc");
    const res = await handleProxy(
      auth,
      req("https://broadsheet.marginalutility.dev/api/articles", {
        method: "POST",
        origin: "https://broadsheet.marginalutility.dev",
      }),
    );
    expect(res).toBeUndefined();
  });

  it("skips CSRF on GET (non-mutating)", async () => {
    const auth = mockAuth("user_abc");
    const res = await handleProxy(
      auth,
      req("https://broadsheet.marginalutility.dev/api/articles", {
        method: "GET",
        origin: "https://attacker.example",
      }),
    );
    // GET passes the CSRF gate; the 401-or-ok depends on auth. With
    // a signed-in user, it should pass through.
    expect(res).toBeUndefined();
  });
});

describe("handleProxy — public API passes through", () => {
  it.each([
    ["/api/webhooks/clerk", "POST"],
    ["/api/digest/send", "POST"],
    ["/api/digest/unsubscribe", "GET"],
    ["/api/auto-archive/run", "POST"],
    ["/api/health", "GET"],
  ])("does not gate %s %s", async (path, method) => {
    const auth = mockAuth(null);
    const res = await handleProxy(
      auth,
      req(`https://broadsheet.marginalutility.dev${path}`, {
        method,
        origin: "https://broadsheet.marginalutility.dev",
      }),
    );
    expect(res).toBeUndefined();
  });
});

describe("handleProxy — protected pages call auth.protect()", () => {
  it.each([
    "/library",
    "/library/foo",
    "/read/abc",
    "/sources",
    "/settings",
    "/import/pocket",
  ])("calls auth.protect() on %s", async (path) => {
    const auth = mockAuth(null);
    await handleProxy(
      auth,
      req(`https://broadsheet.marginalutility.dev${path}`),
    );
    expect(auth.protect).toHaveBeenCalled();
  });

  it("does NOT gate /library-foo (segment boundary regression)", async () => {
    const auth = mockAuth(null);
    await handleProxy(
      auth,
      req("https://broadsheet.marginalutility.dev/library-foo"),
    );
    expect(auth.protect).not.toHaveBeenCalled();
  });

  it("does NOT gate /ready (segment boundary regression)", async () => {
    const auth = mockAuth(null);
    await handleProxy(
      auth,
      req("https://broadsheet.marginalutility.dev/ready"),
    );
    expect(auth.protect).not.toHaveBeenCalled();
  });

  it("does NOT gate /", async () => {
    const auth = mockAuth(null);
    await handleProxy(auth, req("https://broadsheet.marginalutility.dev/"));
    expect(auth.protect).not.toHaveBeenCalled();
  });

  it("does NOT gate /sign-in", async () => {
    const auth = mockAuth(null);
    await handleProxy(
      auth,
      req("https://broadsheet.marginalutility.dev/sign-in"),
    );
    expect(auth.protect).not.toHaveBeenCalled();
  });
});
