import { describe, expect, it } from "vitest";
import { parseOfflineReaderPath } from "./offline-routing";

describe("parseOfflineReaderPath", () => {
  it("extracts the article id from a /read/:id URL", () => {
    const id = "a".repeat(32);
    expect(parseOfflineReaderPath(`/read/${id}`)).toBe(id);
    expect(parseOfflineReaderPath(`/read/${id}/`)).toBe(id);
  });

  it("returns null for non-reader paths", () => {
    expect(parseOfflineReaderPath("/offline")).toBeNull();
    expect(parseOfflineReaderPath("/library")).toBeNull();
    expect(parseOfflineReaderPath("/")).toBeNull();
  });

  it("returns null for malformed ids", () => {
    expect(parseOfflineReaderPath("/read/not-an-id")).toBeNull();
    expect(parseOfflineReaderPath("/read/AAAA")).toBeNull();
    expect(parseOfflineReaderPath("/read/" + "a".repeat(33))).toBeNull();
    expect(parseOfflineReaderPath("/read/" + "A".repeat(32))).toBeNull();
  });

  it("doesn't match nested /read/:id/... subpaths", () => {
    const id = "a".repeat(32);
    expect(parseOfflineReaderPath(`/read/${id}/diff`)).toBeNull();
  });
});
