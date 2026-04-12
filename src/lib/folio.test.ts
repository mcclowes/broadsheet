import { describe, expect, it } from "vitest";
import { volumeNameForUser } from "./folio";

describe("volumeNameForUser", () => {
  it("returns a deterministic volume name for a given userId", () => {
    const a = volumeNameForUser("user_abc123");
    const b = volumeNameForUser("user_abc123");
    expect(a).toBe(b);
  });

  it("returns different names for different users", () => {
    const a = volumeNameForUser("user_alice");
    const b = volumeNameForUser("user_bob");
    expect(a).not.toBe(b);
  });

  it("produces a slug-safe name matching [a-z0-9][a-z0-9_-]*", () => {
    const name = volumeNameForUser("user_ÄÖÜ-Special!@#$%");
    expect(name).toMatch(/^[a-z0-9][a-z0-9_-]*$/);
  });

  it("starts with 'user-' prefix", () => {
    const name = volumeNameForUser("clerk_user_abc");
    expect(name).toMatch(/^user-/);
  });

  it("appends suffix when provided", () => {
    const base = volumeNameForUser("user_alice");
    const withSuffix = volumeNameForUser("user_alice", "sources");
    expect(withSuffix).toBe(`${base}-sources`);
  });

  it("throws on invalid suffix characters", () => {
    expect(() => volumeNameForUser("user_alice", "BAD SUFFIX")).toThrow(
      "Invalid volume suffix",
    );
  });

  it("throws on suffix starting with a non-alphanumeric character", () => {
    expect(() => volumeNameForUser("user_alice", "-leading-dash")).toThrow(
      "Invalid volume suffix",
    );
  });

  it("accepts valid suffix patterns", () => {
    expect(() => volumeNameForUser("user_alice", "sources")).not.toThrow();
    expect(() => volumeNameForUser("user_alice", "feed-cache")).not.toThrow();
    expect(() => volumeNameForUser("user_alice", "data_v2")).not.toThrow();
  });
});
