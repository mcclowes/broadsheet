import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.BROADSHEET_FOLIO_ADAPTER = "memory";
});

import { handleClerkWebhook } from "./clerk-webhook";

function req(body: string, headers: Record<string, string> = {}): Request {
  return new Request("https://example.com/api/webhooks/clerk", {
    method: "POST",
    body,
    headers: {
      "svix-id": "msg_1",
      "svix-timestamp": String(Math.floor(Date.now() / 1000)),
      "svix-signature": "v1,sig",
      "content-type": "application/json",
      ...headers,
    },
  });
}

describe("handleClerkWebhook", () => {
  const deleted: string[] = [];
  const deps = {
    verify: vi.fn<(payload: string, headers: Headers) => unknown>(),
    deleteUser: vi.fn(async (userId: string) => {
      deleted.push(userId);
    }),
  };

  beforeEach(() => {
    deleted.length = 0;
    deps.verify.mockReset();
    deps.deleteUser.mockClear();
  });

  it("returns 400 when signature verification fails", async () => {
    deps.verify.mockImplementation(() => {
      throw new Error("bad sig");
    });
    const res = await handleClerkWebhook(
      req(JSON.stringify({ type: "user.deleted", data: { id: "user_1" } })),
      deps,
    );
    expect(res.status).toBe(400);
    expect(deps.deleteUser).not.toHaveBeenCalled();
  });

  it("deletes user data on user.deleted event", async () => {
    deps.verify.mockReturnValue({
      type: "user.deleted",
      data: { id: "user_42" },
    });
    const res = await handleClerkWebhook(
      req(JSON.stringify({ type: "user.deleted", data: { id: "user_42" } })),
      deps,
    );
    expect(res.status).toBe(200);
    expect(deleted).toEqual(["user_42"]);
  });

  it("ignores non-deletion events", async () => {
    deps.verify.mockReturnValue({
      type: "user.created",
      data: { id: "user_99" },
    });
    const res = await handleClerkWebhook(
      req(JSON.stringify({ type: "user.created", data: { id: "user_99" } })),
      deps,
    );
    expect(res.status).toBe(200);
    expect(deps.deleteUser).not.toHaveBeenCalled();
  });

  it("returns 400 when user.deleted payload has no id", async () => {
    deps.verify.mockReturnValue({ type: "user.deleted", data: {} });
    const res = await handleClerkWebhook(
      req(JSON.stringify({ type: "user.deleted", data: {} })),
      deps,
    );
    expect(res.status).toBe(400);
    expect(deps.deleteUser).not.toHaveBeenCalled();
  });
});
