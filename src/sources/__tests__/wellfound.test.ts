import { describe, expect, it } from "vitest";
import { wellfoundSource } from "../wellfound.js";

const REFERENCE_DATE = new Date("2026-08-19T00:00:00.000Z");

function makeRow(params: {
  title?: string;
  href?: string;
  salary?: string;
  location?: string;
  postedDate?: string;
}): string {
  const titleHtml =
    params.title === undefined
      ? ""
      : `<a class="mr-2 text-sm font-semibold text-brand-burgandy hover:underline" href="${params.href ?? ""}">${params.title}</a>`;
  const salaryHtml =
    params.salary === undefined
      ? ""
      : `<div class="flex items-center text-neutral-500"><span class="pl-1 text-xs">${params.salary}</span></div>`;
  const locationHtml =
    params.location === undefined
      ? ""
      : `<div class="flex items-center text-neutral-500"><span class="pl-1 text-xs">${params.location}</span></div>`;
  const dateHtml =
    params.postedDate === undefined
      ? ""
      : `<span class="text-xs lowercase text-dark-a md:hidden">${params.postedDate}</span>`;

  return `
    <div class="min-h-[50px] items-end justify-between rounded-2xl px-2 py-2 sm:flex">
      <div class="w-full pb-1 sm:pb-0">
        <div class="mb-1 flex items-start">${titleHtml}</div>
        <div class="sm:flex sm:space-x-2">${salaryHtml}${locationHtml}</div>
        ${dateHtml}
      </div>
    </div>
  `;
}

function makeCard(params: { company?: string; rows: string[] }): string {
  const companyHtml =
    params.company === undefined ? "" : `<h2 class="inline text-md font-semibold">${params.company}</h2>`;

  return `
    <div class="mb-6 w-full rounded border border-gray-400 bg-white">
      <div class="mb-2 px-4 pt-4">${companyHtml}</div>
      <div class="mb-4 w-full px-4">${params.rows.join("")}</div>
    </div>
  `;
}

describe("wellfoundSource.parseCard", () => {
  it("parses a well-formed card into typed listings", () => {
    const card = makeCard({
      company: "Oklo",
      rows: [
        makeRow({
          title: "Software Engineer",
          href: "/jobs/4579450-software-engineer",
          salary: "$110k – $200k",
          location: "Remote • Santa Clara",
          postedDate: "6 days ago",
        }),
        makeRow({
          title: "Senior Software Engineer",
          href: "/jobs/3685218-senior-software-engineer",
          location: "Remote • Bengaluru",
          postedDate: "today",
        }),
      ],
    });

    const result = wellfoundSource.parseCard(card, REFERENCE_DATE);

    expect(result.skippedCount).toBe(0);
    expect(result.listings).toHaveLength(2);
    expect(result.listings[0]).toEqual({
      source: "wellfound",
      company: "Oklo",
      title: "Software Engineer",
      location: "Remote • Santa Clara",
      techStack: [],
      postedDate: "2026-08-13",
      url: "https://wellfound.com/jobs/4579450-software-engineer",
    });
    expect(result.listings[1]?.postedDate).toBe("2026-08-19");
  });

  it("ignores anchors that do not point to a job posting", () => {
    const card = makeCard({
      company: "Cuebo.ai",
      rows: [makeRow({ title: "Software Engineer", location: "Onsite or remote • Gurgaon" })],
    });

    const result = wellfoundSource.parseCard(card, REFERENCE_DATE);

    expect(result.listings).toHaveLength(0);
    expect(result.skippedCount).toBe(0);
  });

  it("skips a row missing a title", () => {
    const card = makeCard({
      company: "Cuebo.ai",
      rows: [makeRow({ title: "", href: "/jobs/1-role" })],
    });

    const result = wellfoundSource.parseCard(card, REFERENCE_DATE);

    expect(result.listings).toHaveLength(0);
    expect(result.skippedCount).toBe(1);
  });

  it("skips every row when the company name is missing", () => {
    const card = makeCard({
      rows: [
        makeRow({ title: "Backend Engineer", href: "/jobs/1-backend-engineer" }),
        makeRow({ title: "Frontend Engineer", href: "/jobs/2-frontend-engineer" }),
      ],
    });

    const result = wellfoundSource.parseCard(card, REFERENCE_DATE);

    expect(result.listings).toHaveLength(0);
    expect(result.skippedCount).toBe(2);
  });

  it("defaults location to an empty string and posted date to null when absent", () => {
    const card = makeCard({
      company: "Mihuru",
      rows: [makeRow({ title: "Software Engineer", href: "/jobs/1-software-engineer" })],
    });

    const result = wellfoundSource.parseCard(card, REFERENCE_DATE);

    expect(result.skippedCount).toBe(0);
    expect(result.listings[0]?.location).toBe("");
    expect(result.listings[0]?.postedDate).toBeNull();
  });

  it("does not treat a salary figure as the location", () => {
    const card = makeCard({
      company: "Metropolis",
      rows: [
        makeRow({
          title: "Staff Software Engineer",
          href: "/jobs/1-staff-software-engineer",
          salary: "₹8L – ₹20L",
          location: "Bengaluru",
        }),
      ],
    });

    const result = wellfoundSource.parseCard(card, REFERENCE_DATE);

    expect(result.listings[0]?.location).toBe("Bengaluru");
  });
});
