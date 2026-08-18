import { describe, expect, it } from "vitest";
import { parseShortRelativeDate, parseWordyRelativeDate, resolveUrl } from "../shared.js";

const REFERENCE_DATE = new Date("2026-08-19T00:00:00.000Z");

describe("parseWordyRelativeDate", () => {
  it("resolves today and yesterday", () => {
    expect(parseWordyRelativeDate("today", REFERENCE_DATE)).toBe("2026-08-19");
    expect(parseWordyRelativeDate("yesterday", REFERENCE_DATE)).toBe("2026-08-18");
  });

  it("resolves N days/weeks/months/years ago", () => {
    expect(parseWordyRelativeDate("3 days ago", REFERENCE_DATE)).toBe("2026-08-16");
    expect(parseWordyRelativeDate("2 weeks ago", REFERENCE_DATE)).toBe("2026-08-05");
    expect(parseWordyRelativeDate("1 month ago", REFERENCE_DATE)).toBe("2026-07-20");
    expect(parseWordyRelativeDate("1 year ago", REFERENCE_DATE)).toBe("2025-08-19");
  });

  it("returns null for unrecognized or empty text", () => {
    expect(parseWordyRelativeDate("last spring", REFERENCE_DATE)).toBeNull();
    expect(parseWordyRelativeDate("", REFERENCE_DATE)).toBeNull();
  });
});

describe("parseShortRelativeDate", () => {
  it("resolves short day/week/month/year suffixes", () => {
    expect(parseShortRelativeDate("1d", REFERENCE_DATE)).toBe("2026-08-18");
    expect(parseShortRelativeDate("2w", REFERENCE_DATE)).toBe("2026-08-05");
    expect(parseShortRelativeDate("1mo", REFERENCE_DATE)).toBe("2026-07-20");
    expect(parseShortRelativeDate("1y", REFERENCE_DATE)).toBe("2025-08-19");
  });

  it("returns null for unrecognized text", () => {
    expect(parseShortRelativeDate("recently", REFERENCE_DATE)).toBeNull();
    expect(parseShortRelativeDate("", REFERENCE_DATE)).toBeNull();
  });
});

describe("resolveUrl", () => {
  it("resolves a relative href against the origin", () => {
    expect(resolveUrl("/jobs/1-role", "https://example.com")).toBe("https://example.com/jobs/1-role");
  });

  it("returns null for missing or empty href", () => {
    expect(resolveUrl(undefined, "https://example.com")).toBeNull();
    expect(resolveUrl("", "https://example.com")).toBeNull();
  });
});
