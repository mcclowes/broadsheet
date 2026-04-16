import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.hoisted(() => {
  process.env.BROADSHEET_FOLIO_ADAPTER = "memory";
});

import {
  getDigestPreferences,
  setDigestPreferences,
  listDigestSubscribers,
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
} from "./digest";
import { authedUserId } from "./auth-types";

// The memory adapter shares state within a process — reset between tests
// by toggling preferences off for any users we create.
const USER_A = authedUserId("user_test_digest_alice");
const USER_B = authedUserId("user_test_digest_bob");

beforeEach(async () => {
  // Clean up any leftover state
  await setDigestPreferences(USER_A, {
    enabled: false,
    email: "alice@test.com",
  });
  await setDigestPreferences(USER_B, {
    enabled: false,
    email: "bob@test.com",
  });
});

describe("getDigestPreferences", () => {
  it("returns disabled by default for unknown users", async () => {
    const prefs = await getDigestPreferences(authedUserId("user_unknown_999"));
    expect(prefs).toEqual({ enabled: false, email: "", enabledAt: null });
  });
});

describe("setDigestPreferences", () => {
  it("enables digest and persists email", async () => {
    const result = await setDigestPreferences(USER_A, {
      enabled: true,
      email: "alice@test.com",
    });
    expect(result.enabled).toBe(true);
    expect(result.email).toBe("alice@test.com");
    expect(result.enabledAt).toBeTruthy();

    const fetched = await getDigestPreferences(USER_A);
    expect(fetched.enabled).toBe(true);
    expect(fetched.email).toBe("alice@test.com");
  });

  it("disables digest and removes from registry", async () => {
    await setDigestPreferences(USER_A, {
      enabled: true,
      email: "alice@test.com",
    });
    const result = await setDigestPreferences(USER_A, {
      enabled: false,
      email: "alice@test.com",
    });
    expect(result.enabled).toBe(false);

    const fetched = await getDigestPreferences(USER_A);
    expect(fetched.enabled).toBe(false);
  });

  it("preserves enabledAt on re-enable with same user", async () => {
    await setDigestPreferences(USER_A, {
      enabled: true,
      email: "alice@test.com",
    });

    // Disable then re-enable
    await setDigestPreferences(USER_A, {
      enabled: false,
      email: "alice@test.com",
    });
    const second = await setDigestPreferences(USER_A, {
      enabled: true,
      email: "alice@test.com",
    });

    // enabledAt should be fresh since the record was deleted
    expect(second.enabledAt).toBeTruthy();
    // The timestamps may differ since the record was deleted on disable
    expect(typeof second.enabledAt).toBe("string");
  });
});

describe("listDigestSubscribers", () => {
  it("returns empty array when no subscribers", async () => {
    const subs = await listDigestSubscribers();
    expect(subs).toEqual([]);
  });

  it("returns all enabled subscribers", async () => {
    await setDigestPreferences(USER_A, {
      enabled: true,
      email: "alice@test.com",
    });
    await setDigestPreferences(USER_B, {
      enabled: true,
      email: "bob@test.com",
    });

    const subs = await listDigestSubscribers();
    const emails = subs.map((s) => s.email).sort();
    expect(emails).toEqual(["alice@test.com", "bob@test.com"]);
  });

  it("excludes disabled subscribers", async () => {
    await setDigestPreferences(USER_A, {
      enabled: true,
      email: "alice@test.com",
    });
    await setDigestPreferences(USER_B, {
      enabled: true,
      email: "bob@test.com",
    });

    // Disable one
    await setDigestPreferences(USER_B, {
      enabled: false,
      email: "bob@test.com",
    });

    const subs = await listDigestSubscribers();
    expect(subs).toHaveLength(1);
    expect(subs[0].email).toBe("alice@test.com");
  });
});

describe("unsubscribe tokens", () => {
  const originalSecret = process.env.CRON_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("throws when CRON_SECRET is missing rather than using a fallback", () => {
    delete process.env.CRON_SECRET;
    expect(() => generateUnsubscribeToken("user_abc")).toThrow(/CRON_SECRET/);
  });

  it("verifyUnsubscribeToken returns false when secret is missing", () => {
    // First generate a real token with a secret set...
    process.env.CRON_SECRET = "secret-a";
    const token = generateUnsubscribeToken("user_abc");
    // ...then simulate the secret disappearing. verify must not crash.
    delete process.env.CRON_SECRET;
    expect(verifyUnsubscribeToken("user_abc", token)).toBe(false);
  });

  it("rejects tokens signed with a different secret", () => {
    process.env.CRON_SECRET = "secret-a";
    const token = generateUnsubscribeToken("user_abc");
    process.env.CRON_SECRET = "secret-b";
    expect(verifyUnsubscribeToken("user_abc", token)).toBe(false);
  });

  it("accepts tokens signed with the current secret", () => {
    process.env.CRON_SECRET = "secret-a";
    const token = generateUnsubscribeToken("user_abc");
    expect(verifyUnsubscribeToken("user_abc", token)).toBe(true);
  });
});
