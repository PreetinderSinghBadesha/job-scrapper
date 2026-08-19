import { describe, expect, it } from "vitest";
import {
  bucketYearsOfExperience,
  normalizeEmploymentType,
  normalizeExperienceKeyword,
  parseShortRelativeDate,
  parseWordyRelativeDate,
  resolveUrl,
} from "../shared.js";

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

describe("normalizeEmploymentType", () => {
  it("recognizes common variants regardless of casing or separator", () => {
    expect(normalizeEmploymentType("Full-time")).toBe("Full-time");
    expect(normalizeEmploymentType("fulltime")).toBe("Full-time");
    expect(normalizeEmploymentType("Part Time")).toBe("Part-time");
    expect(normalizeEmploymentType("CONTRACT")).toBe("Contract");
    expect(normalizeEmploymentType("Intern")).toBe("Internship");
    expect(normalizeEmploymentType("Freelance")).toBe("Freelance");
  });

  it("returns null for unrecognized or empty text", () => {
    expect(normalizeEmploymentType("Remote")).toBeNull();
    expect(normalizeEmploymentType("")).toBeNull();
    expect(normalizeEmploymentType(null)).toBeNull();
    expect(normalizeEmploymentType(undefined)).toBeNull();
  });
});

describe("normalizeExperienceKeyword", () => {
  it("maps seniority keywords to canonical buckets", () => {
    expect(normalizeExperienceKeyword("Senior")).toBe("Senior");
    expect(normalizeExperienceKeyword("sr")).toBe("Senior");
    expect(normalizeExperienceKeyword("Lead")).toBe("Lead");
    expect(normalizeExperienceKeyword("Principal Engineer")).toBe("Lead");
    expect(normalizeExperienceKeyword("Junior")).toBe("Entry level");
    expect(normalizeExperienceKeyword("entry-level")).toBe("Entry level");
    expect(normalizeExperienceKeyword("mid-level")).toBe("Mid level");
  });

  it("returns null for text with no seniority signal", () => {
    expect(normalizeExperienceKeyword("Backend")).toBeNull();
    expect(normalizeExperienceKeyword("")).toBeNull();
  });
});

describe("bucketYearsOfExperience", () => {
  it("buckets years into the same labels normalizeExperienceKeyword uses", () => {
    expect(bucketYearsOfExperience(0)).toBe("Entry level");
    expect(bucketYearsOfExperience(1)).toBe("Entry level");
    expect(bucketYearsOfExperience(2)).toBe("Mid level");
    expect(bucketYearsOfExperience(4)).toBe("Mid level");
    expect(bucketYearsOfExperience(5)).toBe("Senior");
    expect(bucketYearsOfExperience(8)).toBe("Senior");
    expect(bucketYearsOfExperience(9)).toBe("Lead");
  });
});
