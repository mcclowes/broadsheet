import { afterEach, describe, expect, it } from "vitest";
import { verifyCronBearer } from "./cron-auth";

describe("verifyCronBearer", () => {
  const original = process.env.CRON_SECRET;

  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it("rejects when CRON_SECRET is unset (fail closed)", () => {
    delete process.env.CRON_SECRET;
    expect(verifyCronBearer("Bearer anything")).toBe(false);
  });

  it("rejects when the header is missing", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(verifyCronBearer(null)).toBe(false);
  });

  it("accepts the correct Bearer header", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(verifyCronBearer("Bearer s3cret")).toBe(true);
  });

  it("rejects a different secret", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(verifyCronBearer("Bearer wrong")).toBe(false);
  });

  it("rejects a header that differs only in length", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(verifyCronBearer("Bearer s3cretx")).toBe(false);
    expect(verifyCronBearer("Bearer s3cre")).toBe(false);
  });

  it("is case-sensitive on the Bearer prefix", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(verifyCronBearer("bearer s3cret")).toBe(false);
  });
});
