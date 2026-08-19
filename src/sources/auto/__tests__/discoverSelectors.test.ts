import { describe, expect, it } from "vitest";
import { validateSelectors } from "../discoverSelectors.js";

describe("validateSelectors", () => {
  it("accepts a fully populated response", () => {
    const result = validateSelectors({
      cardSelector: ".job-card",
      titleSelector: ".title",
      companySelector: ".company",
      locationSelector: ".location",
      urlSelector: "a.job-link",
      dateSelector: ".posted",
      tagsSelector: ".tag",
      employmentTypeSelector: ".employment",
      experienceSelector: ".experience",
    });

    expect(result).toEqual({
      cardSelector: ".job-card",
      titleSelector: ".title",
      companySelector: ".company",
      locationSelector: ".location",
      urlSelector: "a.job-link",
      dateSelector: ".posted",
      tagsSelector: ".tag",
      employmentTypeSelector: ".employment",
      experienceSelector: ".experience",
    });
  });

  it("accepts null for every optional field", () => {
    const result = validateSelectors({
      cardSelector: ".job-card",
      titleSelector: null,
      companySelector: null,
      locationSelector: null,
      urlSelector: null,
      dateSelector: null,
      tagsSelector: null,
      employmentTypeSelector: null,
      experienceSelector: null,
    });

    expect(result.titleSelector).toBeNull();
    expect(result.tagsSelector).toBeNull();
    expect(result.employmentTypeSelector).toBeNull();
    expect(result.experienceSelector).toBeNull();
  });

  it("treats missing optional fields as null", () => {
    const result = validateSelectors({ cardSelector: ".job-card" });

    expect(result.titleSelector).toBeNull();
    expect(result.companySelector).toBeNull();
  });

  it("treats an empty-string optional field as null", () => {
    const result = validateSelectors({ cardSelector: ".job-card", titleSelector: "   " });

    expect(result.titleSelector).toBeNull();
  });

  it("throws when cardSelector is missing", () => {
    expect(() => validateSelectors({ titleSelector: ".title" })).toThrow(/cardSelector/);
  });

  it("throws when cardSelector is an empty string", () => {
    expect(() => validateSelectors({ cardSelector: "" })).toThrow(/cardSelector/);
  });

  it("throws when the response is not an object", () => {
    expect(() => validateSelectors("not an object")).toThrow();
    expect(() => validateSelectors(null)).toThrow();
  });

  it("throws when an optional field is a non-string, non-null value", () => {
    expect(() => validateSelectors({ cardSelector: ".job-card", titleSelector: 42 })).toThrow(
      /titleSelector/,
    );
  });
});
