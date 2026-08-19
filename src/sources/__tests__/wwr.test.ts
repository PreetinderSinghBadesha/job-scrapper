import { describe, expect, it } from "vitest";
import { weWorkRemotelySource } from "../wwr.js";

const REFERENCE_DATE = new Date("2026-08-19T00:00:00.000Z");

function makeCard(params: {
  title?: string;
  href?: string;
  company?: string;
  location?: string;
  postedDate?: string;
  employmentType?: string;
  extraCategoryPills?: string[];
}): string {
  const titleHtml =
    params.title === undefined
      ? ""
      : `<span class="new-listing__header__title__text">${params.title}</span>`;
  const dateHtml =
    params.postedDate === undefined
      ? ""
      : `<p class="new-listing__header__icons__date">${params.postedDate}</p>`;
  const companyHtml =
    params.company === undefined ? "" : `<p class="new-listing__company-name">${params.company}</p>`;
  const locationHtml =
    params.location === undefined
      ? ""
      : `<p class="new-listing__company-headquarters">${params.location}</p>`;
  const anchorOpen =
    params.href === undefined
      ? "<div>"
      : `<a class="listing-link--unlocked" href="${params.href}">`;
  const anchorClose = params.href === undefined ? "</div>" : "</a>";
  const employmentTypePillHtml =
    params.employmentType === undefined
      ? ""
      : `<span class="new-listing__categories__category">${params.employmentType}</span>`;
  const extraPillsHtml = (params.extraCategoryPills ?? [])
    .map((text) => `<span class="new-listing__categories__category new-listing__categories__category--featured">${text}</span>`)
    .join("");

  return `
    <li class="new-listing-container feature">
      ${anchorOpen}
        <div class="new-listing__header">
          <h3 class="new-listing__header__title">${titleHtml}</h3>
          <div class="new-listing__header__icons">${dateHtml}</div>
        </div>
        ${companyHtml}
        ${locationHtml}
        <div class="new-listing__categories">${extraPillsHtml}${employmentTypePillHtml}</div>
      ${anchorClose}
    </li>
  `;
}

describe("weWorkRemotelySource.parseCard", () => {
  it("parses a well-formed card into a typed listing", () => {
    const card = makeCard({
      title: "Staff Software Engineer",
      href: "/remote-jobs/samsara-staff-software-engineer",
      company: "Samsara",
      location: "Remote",
      postedDate: "1d",
    });

    const result = weWorkRemotelySource.parseCard(card, REFERENCE_DATE);

    expect(result.skippedCount).toBe(0);
    expect(result.listings).toEqual([
      {
        source: "weworkremotely",
        company: "Samsara",
        title: "Staff Software Engineer",
        location: "Remote",
        techStack: [],
        postedDate: "2026-08-18",
        employmentType: null,
        experienceLevel: null,
        url: "https://weworkremotely.com/remote-jobs/samsara-staff-software-engineer",
      },
    ]);
  });

  it("picks the employment-type pill out from among promotional badges and other categories", () => {
    const card = makeCard({
      title: "Staff Software Engineer",
      href: "/remote-jobs/1",
      company: "Samsara",
      employmentType: "Full-Time",
      extraCategoryPills: ["Featured", "Top 100"],
    });

    const result = weWorkRemotelySource.parseCard(card, REFERENCE_DATE);

    expect(result.listings[0]?.employmentType).toBe("Full-time");
  });

  it("skips a card missing the job link", () => {
    const card = makeCard({ title: "Software Engineer", company: "Acme" });

    const result = weWorkRemotelySource.parseCard(card, REFERENCE_DATE);

    expect(result.listings).toHaveLength(0);
    expect(result.skippedCount).toBe(1);
  });

  it("skips a card missing a title", () => {
    const card = makeCard({ href: "/remote-jobs/1", company: "Acme" });

    const result = weWorkRemotelySource.parseCard(card, REFERENCE_DATE);

    expect(result.listings).toHaveLength(0);
    expect(result.skippedCount).toBe(1);
  });

  it("skips a card missing a company", () => {
    const card = makeCard({ href: "/remote-jobs/1", title: "Software Engineer" });

    const result = weWorkRemotelySource.parseCard(card, REFERENCE_DATE);

    expect(result.listings).toHaveLength(0);
    expect(result.skippedCount).toBe(1);
  });

  it("defaults location to an empty string and posted date to null when absent", () => {
    const card = makeCard({
      title: "Software Engineer",
      href: "/remote-jobs/1",
      company: "Acme",
    });

    const result = weWorkRemotelySource.parseCard(card, REFERENCE_DATE);

    expect(result.listings[0]?.location).toBe("");
    expect(result.listings[0]?.postedDate).toBeNull();
  });
});
