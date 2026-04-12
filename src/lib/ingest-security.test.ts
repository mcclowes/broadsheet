import { afterEach, describe, expect, it, vi } from "vitest";

const { lookupMock } = vi.hoisted(() => ({
  lookupMock: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  default: { lookup: lookupMock },
  lookup: lookupMock,
}));

import {
  isPrivateIPv4,
  isPrivateIPv6,
  assertPublicHost,
  readBoundedBody,
  IngestError,
  MAX_BODY_BYTES,
} from "./ingest";

afterEach(() => {
  lookupMock.mockReset();
});

describe("isPrivateIPv4", () => {
  it.each([
    ["0.0.0.0", true],
    ["0.255.255.255", true],
    ["10.0.0.1", true],
    ["10.255.255.255", true],
    ["127.0.0.1", true],
    ["127.255.255.255", true],
    ["169.254.0.1", true],
    ["169.254.169.254", true],
    ["172.16.0.1", true],
    ["172.31.255.255", true],
    ["192.168.0.1", true],
    ["192.168.255.255", true],
    ["100.64.0.1", true],
    ["100.127.255.255", true],
    ["224.0.0.1", true],
    ["239.255.255.255", true],
    ["255.255.255.255", true],
  ])("flags private/reserved %s → %s", (ip, expected) => {
    expect(isPrivateIPv4(ip)).toBe(expected);
  });

  it.each([
    ["8.8.8.8", false],
    ["1.1.1.1", false],
    ["172.15.255.255", false],
    ["172.32.0.1", false],
    ["100.63.255.255", false],
    ["100.128.0.1", false],
    ["11.0.0.1", false],
    ["223.255.255.255", false],
  ])("allows public %s → %s", (ip, expected) => {
    expect(isPrivateIPv4(ip)).toBe(expected);
  });

  it("rejects malformed IPv4", () => {
    expect(isPrivateIPv4("not.an.ip")).toBe(true);
    expect(isPrivateIPv4("999.999.999.999")).toBe(true);
    expect(isPrivateIPv4("1.2.3")).toBe(true);
    expect(isPrivateIPv4("")).toBe(true);
    expect(isPrivateIPv4("1.2.3.4.5")).toBe(true);
    expect(isPrivateIPv4("-1.0.0.0")).toBe(true);
  });
});

describe("isPrivateIPv6", () => {
  it.each([
    ["::1", true],
    ["::", true],
    ["fc00::1", true],
    ["fd12:3456:789a::1", true],
    ["fe80::1", true],
    ["fe80::abcd%eth0", true],
    ["::ffff:127.0.0.1", true],
    ["::ffff:10.0.0.1", true],
    ["::ffff:192.168.1.1", true],
  ])("flags private %s → %s", (ip, expected) => {
    expect(isPrivateIPv6(ip)).toBe(expected);
  });

  it.each([
    ["2606:4700::1111", false],
    ["2001:4860:4860::8888", false],
    ["::ffff:8.8.8.8", false],
    ["::ffff:1.1.1.1", false],
  ])("allows public %s → %s", (ip, expected) => {
    expect(isPrivateIPv6(ip)).toBe(expected);
  });

  it("handles uppercase and zone IDs", () => {
    expect(isPrivateIPv6("FE80::1%eth0")).toBe(true);
    expect(isPrivateIPv6("FD00::1")).toBe(true);
    expect(isPrivateIPv6("FC00::1")).toBe(true);
  });
});

describe("assertPublicHost", () => {
  it("allows a public IP literal", async () => {
    await expect(assertPublicHost("8.8.8.8")).resolves.toBeUndefined();
  });

  it("rejects a private IP literal", async () => {
    await expect(assertPublicHost("127.0.0.1")).rejects.toThrow(IngestError);
    await expect(assertPublicHost("10.0.0.1")).rejects.toThrow(IngestError);
    await expect(assertPublicHost("192.168.1.1")).rejects.toThrow(IngestError);
  });

  it("strips brackets from IPv6 literals", async () => {
    await expect(assertPublicHost("[::1]")).rejects.toThrow(IngestError);
  });

  it("hides internal IP in publicMessage", async () => {
    try {
      await assertPublicHost("192.168.1.1");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(IngestError);
      const ie = err as IngestError;
      expect(ie.publicMessage).toBe("Refusing to fetch a non-public address");
      expect(ie.message).toContain("192.168.1.1");
    }
  });

  it("rejects when DNS lookup fails", async () => {
    lookupMock.mockRejectedValueOnce(new Error("ENOTFOUND"));
    await expect(assertPublicHost("nonexistent.invalid")).rejects.toThrow(
      IngestError,
    );
  });

  it("surfaces 'Could not resolve the host' as publicMessage on DNS failure", async () => {
    lookupMock.mockRejectedValueOnce(new Error("ENOTFOUND"));
    try {
      await assertPublicHost("bad.example.com");
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as IngestError).publicMessage).toBe(
        "Could not resolve the host",
      );
    }
  });

  it("rejects when DNS resolves to a private address", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }]);
    await expect(assertPublicHost("evil.example.com")).rejects.toThrow(
      IngestError,
    );
  });

  it("rejects when any DNS result is private (multi-A)", async () => {
    lookupMock.mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]);
    await expect(assertPublicHost("mixed.example.com")).rejects.toThrow(
      IngestError,
    );
  });

  it("allows when DNS resolves to a public address", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]);
    await expect(assertPublicHost("example.com")).resolves.toBeUndefined();
  });

  it("rejects when DNS returns empty results", async () => {
    lookupMock.mockResolvedValueOnce([]);
    await expect(assertPublicHost("empty.example.com")).rejects.toThrow(
      IngestError,
    );
  });
});

describe("readBoundedBody", () => {
  function makeResponse(body: string | null): Response {
    if (body === null) {
      return new Response(null, { status: 200 });
    }
    return new Response(body, { status: 200 });
  }

  it("reads a normal body", async () => {
    const res = makeResponse("hello world");
    const text = await readBoundedBody(res);
    expect(text).toBe("hello world");
  });

  it("reads an empty body", async () => {
    const res = makeResponse("");
    const text = await readBoundedBody(res);
    expect(text).toBe("");
  });

  it("throws IngestError when body exceeds MAX_BODY_BYTES", async () => {
    const oversized = "x".repeat(MAX_BODY_BYTES + 1);
    const res = makeResponse(oversized);
    await expect(readBoundedBody(res)).rejects.toThrow(IngestError);

    try {
      const res2 = makeResponse(oversized);
      await readBoundedBody(res2);
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as IngestError).publicMessage).toBe(
        "Page is too large to save",
      );
    }
  });

  it("reads body exactly at MAX_BODY_BYTES", async () => {
    const exact = "x".repeat(MAX_BODY_BYTES);
    const res = makeResponse(exact);
    const text = await readBoundedBody(res);
    expect(text).toHaveLength(MAX_BODY_BYTES);
  });

  it("reads UTF-8 content correctly", async () => {
    const unicode = "Hello 世界 🌍 café";
    const res = makeResponse(unicode);
    const text = await readBoundedBody(res);
    expect(text).toBe(unicode);
  });
});
