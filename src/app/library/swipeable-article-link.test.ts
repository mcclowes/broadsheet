import { describe, it, expect } from "vitest";
import { shouldCommitSwipe, isHorizontalSwipe } from "./swipe-gesture";

describe("shouldCommitSwipe", () => {
  it("commits beyond threshold in either direction", () => {
    expect(shouldCommitSwipe(80)).toBe(true);
    expect(shouldCommitSwipe(-80)).toBe(true);
    expect(shouldCommitSwipe(120)).toBe(true);
  });

  it("does not commit below threshold", () => {
    expect(shouldCommitSwipe(0)).toBe(false);
    expect(shouldCommitSwipe(40)).toBe(false);
    expect(shouldCommitSwipe(-40)).toBe(false);
    expect(shouldCommitSwipe(79)).toBe(false);
  });
});

describe("isHorizontalSwipe", () => {
  it("ignores tiny movements", () => {
    expect(isHorizontalSwipe(4, 0)).toBe(false);
    expect(isHorizontalSwipe(0, 0)).toBe(false);
  });

  it("detects horizontal motion that dominates vertical", () => {
    expect(isHorizontalSwipe(40, 5)).toBe(true);
    expect(isHorizontalSwipe(-40, 10)).toBe(true);
  });

  it("rejects predominantly vertical motion (scroll)", () => {
    expect(isHorizontalSwipe(20, 40)).toBe(false);
    expect(isHorizontalSwipe(10, 30)).toBe(false);
  });
});
