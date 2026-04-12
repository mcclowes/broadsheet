import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Tests below mutate process.env.BROADSHEET_PREVIEW_MODE and rely on a
// module-level cache of the Folio adapter in src/lib/folio.ts. We reset
// the module registry between tests so each run re-evaluates with the
// current env.

describe("isPreviewMode", () => {
  const original = process.env.BROADSHEET_PREVIEW_MODE;

  afterEach(() => {
    if (original === undefined) delete process.env.BROADSHEET_PREVIEW_MODE;
    else process.env.BROADSHEET_PREVIEW_MODE = original;
    vi.resetModules();
  });

  it("returns false when the env var is unset", async () => {
    delete process.env.BROADSHEET_PREVIEW_MODE;
    const { isPreviewMode } = await import("./preview-mode");
    expect(isPreviewMode()).toBe(false);
  });

  it("returns true only when BROADSHEET_PREVIEW_MODE=1", async () => {
    process.env.BROADSHEET_PREVIEW_MODE = "1";
    const { isPreviewMode } = await import("./preview-mode");
    expect(isPreviewMode()).toBe(true);
  });

  it("treats other truthy-looking values as not-preview", async () => {
    // Be strict — only "1" enables the flag. Prevents accidental activation
    // from stray "true" or "yes" values in dashboards.
    process.env.BROADSHEET_PREVIEW_MODE = "true";
    const { isPreviewMode } = await import("./preview-mode");
    expect(isPreviewMode()).toBe(false);
  });
});

describe("getRequestUserId", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.BROADSHEET_PREVIEW_MODE;
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns the preview demo id in preview mode without calling auth()", async () => {
    process.env.BROADSHEET_PREVIEW_MODE = "1";
    const authSpy = vi.fn();
    vi.doMock("@clerk/nextjs/server", () => ({ auth: authSpy }));

    const { getRequestUserId, PREVIEW_USER_ID } =
      await import("./preview-mode");
    const id = await getRequestUserId();
    expect(id).toBe(PREVIEW_USER_ID);
    expect(authSpy).not.toHaveBeenCalled();
  });

  it("delegates to Clerk's auth() when preview mode is off", async () => {
    delete process.env.BROADSHEET_PREVIEW_MODE;
    const authSpy = vi.fn(async () => ({ userId: "user_real_123" }));
    vi.doMock("@clerk/nextjs/server", () => ({ auth: authSpy }));

    const { getRequestUserId } = await import("./preview-mode");
    const id = await getRequestUserId();
    expect(id).toBe("user_real_123");
    expect(authSpy).toHaveBeenCalledTimes(1);
  });

  it("returns null when Clerk reports no session", async () => {
    delete process.env.BROADSHEET_PREVIEW_MODE;
    vi.doMock("@clerk/nextjs/server", () => ({
      auth: async () => ({ userId: null }),
    }));

    const { getRequestUserId } = await import("./preview-mode");
    expect(await getRequestUserId()).toBeNull();
  });
});
