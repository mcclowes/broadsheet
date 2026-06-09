import { describe, expect, it } from "vitest";
import { privatePage } from "./metadata";

describe("privatePage", () => {
  it("sets the title so the root template applies", () => {
    expect(privatePage("Library").title).toBe("Library");
  });

  it("blocks indexing and following — the load-bearing privacy guarantee", () => {
    expect(privatePage("Library").robots).toEqual({
      index: false,
      follow: false,
    });
  });
});
