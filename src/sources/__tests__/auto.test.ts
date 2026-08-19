import { describe, expect, it } from "vitest";
import { parseCardWithSelectors } from "../auto.js";
import type { DiscoveredSelectors } from "../auto/types.js";

const SELECTORS: DiscoveredSelectors = {
  cardSelector: ".card",
  titleSelector: ".title",
  companySelector: ".company",
  locationSelector: ".location",
  urlSelector: "a.link",
  dateSelector: ".posted",
  tagsSelector: ".tag",
  employmentTypeSelector: ".employment",
  experienceSelector: ".experience",
};

const ORIGIN = "https://example.com";

function makeCard(params: {
  title?: string;
  company?: string;
  href?: string;
  location?: string;
  postedDate?: string;
  tags?: string[];
  employmentType?: string;
  experience?: string;
}): string {
  const titleHtml = params.title === undefined ? "" : `<div class="title">${params.title}</div>`;
  const companyHtml = params.company === undefined ? "" : `<div class="company">${params.company}</div>`;
  const linkHtml = params.href === undefined ? "" : `<a class="link" href="${params.href}">view</a>`;
  const locationHtml = params.location === undefined ? "" : `<div class="location">${params.location}</div>`;
  const dateHtml = params.postedDate === undefined ? "" : `<div class="posted">${params.postedDate}</div>`;
  const tagsHtml = (params.tags ?? []).map((tag) => `<span class="tag">${tag}</span>`).join("");
  const employmentHtml =
    params.employmentType === undefined ? "" : `<div class="employment">${params.employmentType}</div>`;
  const experienceHtml =
    params.experience === undefined ? "" : `<div class="experience">${params.experience}</div>`;

  return `<div class="card">${titleHtml}${companyHtml}${linkHtml}${locationHtml}${dateHtml}${tagsHtml}${employmentHtml}${experienceHtml}</div>`;
}

describe("parseCardWithSelectors", () => {
  it("parses a well-formed card using the discovered selectors", () => {
    const card = makeCard({
      title: "Backend Engineer",
      company: "Acme",
      href: "/jobs/123",
      location: "Remote",
      postedDate: "2026-08-01",
      tags: ["Go", "Kubernetes"],
      employmentType: "Full-time",
      experience: "5+ years",
    });

    const result = parseCardWithSelectors(card, SELECTORS, ORIGIN);

    expect(result.skippedCount).toBe(0);
    expect(result.listings).toEqual([
      {
        source: "example.com",
        company: "Acme",
        title: "Backend Engineer",
        location: "Remote",
        techStack: ["Go", "Kubernetes"],
        postedDate: "2026-08-01",
        employmentType: "Full-time",
        experienceLevel: "Senior",
        url: "https://example.com/jobs/123",
      },
    ]);
  });

  it("skips a card missing a title", () => {
    const card = makeCard({ company: "Acme", href: "/jobs/1" });

    const result = parseCardWithSelectors(card, SELECTORS, ORIGIN);

    expect(result.listings).toHaveLength(0);
    expect(result.skippedCount).toBe(1);
  });

  it("skips a card missing a company", () => {
    const card = makeCard({ title: "Backend Engineer", href: "/jobs/1" });

    const result = parseCardWithSelectors(card, SELECTORS, ORIGIN);

    expect(result.listings).toHaveLength(0);
    expect(result.skippedCount).toBe(1);
  });

  it("skips a card missing the job link", () => {
    const card = makeCard({ title: "Backend Engineer", company: "Acme" });

    const result = parseCardWithSelectors(card, SELECTORS, ORIGIN);

    expect(result.listings).toHaveLength(0);
    expect(result.skippedCount).toBe(1);
  });

  it("defaults location, tech stack, employment type, and experience when their selectors find nothing", () => {
    const card = makeCard({ title: "Backend Engineer", company: "Acme", href: "/jobs/1" });

    const result = parseCardWithSelectors(card, SELECTORS, ORIGIN);

    expect(result.listings[0]?.location).toBe("");
    expect(result.listings[0]?.techStack).toEqual([]);
    expect(result.listings[0]?.employmentType).toBeNull();
    expect(result.listings[0]?.experienceLevel).toBeNull();
  });

  it("treats a non-ISO posted-date string as unparseable and stores null", () => {
    const card = makeCard({
      title: "Backend Engineer",
      company: "Acme",
      href: "/jobs/1",
      postedDate: "3 days ago",
    });

    const result = parseCardWithSelectors(card, SELECTORS, ORIGIN);

    expect(result.listings[0]?.postedDate).toBeNull();
  });

  it("accepts an ISO posted date and trims it to just the date part", () => {
    const card = makeCard({
      title: "Backend Engineer",
      company: "Acme",
      href: "/jobs/1",
      postedDate: "2026-08-01T12:00:00Z",
    });

    const result = parseCardWithSelectors(card, SELECTORS, ORIGIN);

    expect(result.listings[0]?.postedDate).toBe("2026-08-01");
  });

  it("normalizes an unrecognized employment-type string to null", () => {
    const card = makeCard({
      title: "Backend Engineer",
      company: "Acme",
      href: "/jobs/1",
      employmentType: "Whatever this site calls it",
    });

    const result = parseCardWithSelectors(card, SELECTORS, ORIGIN);

    expect(result.listings[0]?.employmentType).toBeNull();
  });

  it("buckets a years-of-experience string discovered on the page", () => {
    const card = makeCard({
      title: "Backend Engineer",
      company: "Acme",
      href: "/jobs/1",
      experience: "1 year",
    });

    const result = parseCardWithSelectors(card, SELECTORS, ORIGIN);

    expect(result.listings[0]?.experienceLevel).toBe("Entry level");
  });

  it("falls back to keyword matching when experience text has no year count", () => {
    const card = makeCard({
      title: "Backend Engineer",
      company: "Acme",
      href: "/jobs/1",
      experience: "Junior",
    });

    const result = parseCardWithSelectors(card, SELECTORS, ORIGIN);

    expect(result.listings[0]?.experienceLevel).toBe("Entry level");
  });

  it("treats null selectors as always absent, without throwing", () => {
    const selectorsWithNulls: DiscoveredSelectors = {
      cardSelector: ".card",
      titleSelector: null,
      companySelector: null,
      locationSelector: null,
      urlSelector: null,
      dateSelector: null,
      tagsSelector: null,
      employmentTypeSelector: null,
      experienceSelector: null,
    };
    const card = makeCard({ title: "Backend Engineer", company: "Acme", href: "/jobs/1" });

    const result = parseCardWithSelectors(card, selectorsWithNulls, ORIGIN);

    expect(result.listings).toHaveLength(0);
    expect(result.skippedCount).toBe(1);
  });
});
