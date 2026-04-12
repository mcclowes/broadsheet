import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Force MemoryAdapter so tests don't touch the dev FsAdapter path. Preview
// mode would force it anyway, but the "no-op when off" case relies on this.
process.env.BROADSHEET_FOLIO_ADAPTER = "memory";

// `ensurePreviewSeed` caches its in-flight promise at module scope, so we
// reset modules between tests to get a clean seed state. We also set the
// preview env var *before* importing so the Folio adapter resolves to the
// MemoryAdapter used by preview mode.

describe("ensurePreviewSeed", () => {
  const original = process.env.BROADSHEET_PREVIEW_MODE;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (original === undefined) delete process.env.BROADSHEET_PREVIEW_MODE;
    else process.env.BROADSHEET_PREVIEW_MODE = original;
    vi.resetModules();
  });

  it("is a no-op when preview mode is off", async () => {
    delete process.env.BROADSHEET_PREVIEW_MODE;
    const { ensurePreviewSeed } = await import("./preview-seed");
    const { listArticles } = await import("./articles");
    const { authedUserId } = await import("./auth-types");
    const { PREVIEW_USER_ID } = await import("./preview-mode");

    await ensurePreviewSeed();
    // Even the preview user's library should stay empty.
    const articles = await listArticles(authedUserId(PREVIEW_USER_ID));
    expect(articles).toHaveLength(0);
  }, 20_000);

  it("seeds a non-empty fixture library for the preview user", async () => {
    process.env.BROADSHEET_PREVIEW_MODE = "1";
    const { ensurePreviewSeed } = await import("./preview-seed");
    const { listArticles } = await import("./articles");
    const { authedUserId } = await import("./auth-types");
    const { PREVIEW_USER_ID } = await import("./preview-mode");

    await ensurePreviewSeed();
    const articles = await listArticles(authedUserId(PREVIEW_USER_ID));
    expect(articles.length).toBeGreaterThan(0);
    // Fixtures should have real titles / sources so the newspaper layout
    // has something to render.
    for (const a of articles) {
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.readMinutes).toBeGreaterThan(0);
    }
  });

  it("is idempotent — calling twice does not duplicate fixtures", async () => {
    process.env.BROADSHEET_PREVIEW_MODE = "1";
    const { ensurePreviewSeed } = await import("./preview-seed");
    const { listArticles } = await import("./articles");
    const { authedUserId } = await import("./auth-types");
    const { PREVIEW_USER_ID } = await import("./preview-mode");

    await ensurePreviewSeed();
    const first = await listArticles(authedUserId(PREVIEW_USER_ID));
    await ensurePreviewSeed();
    const second = await listArticles(authedUserId(PREVIEW_USER_ID));
    expect(second.length).toBe(first.length);
    expect(new Set(second.map((a) => a.id))).toEqual(
      new Set(first.map((a) => a.id)),
    );
  });

  it("produces fixtures with valid article ids (32 hex chars)", async () => {
    process.env.BROADSHEET_PREVIEW_MODE = "1";
    const { ensurePreviewSeed } = await import("./preview-seed");
    const { listArticles } = await import("./articles");
    const { authedUserId } = await import("./auth-types");
    const { PREVIEW_USER_ID } = await import("./preview-mode");

    await ensurePreviewSeed();
    const articles = await listArticles(authedUserId(PREVIEW_USER_ID));
    for (const a of articles) {
      expect(a.id).toMatch(/^[a-f0-9]{32}$/);
    }
  });
});
