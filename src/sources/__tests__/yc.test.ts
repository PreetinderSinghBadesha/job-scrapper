import { describe, expect, it } from "vitest";
import { ycSource } from "../yc.js";

function makeCard(params: {
  company?: string;
  href?: string;
  title?: string;
  jobHref?: string;
  details?: string[];
}): string {
  const companyHtml =
    params.company === undefined
      ? ""
      : `<a href="${params.href ?? "/companies/acme"}" target="company"><span><span class="font-bold">${params.company}</span></span></a>`;
  const titleHtml =
    params.title === undefined
      ? ""
      : `<a href="${params.jobHref ?? ""}" target="job" class="text-base font-semibold text-blue-500">${params.title}</a>`;
  const detailSpans = (params.details ?? []).map((text) => `<span>${text}</span>`).join("");

  return `
    <div class="flex h-full cursor-pointer flex-col rounded border border-gray-200 bg-beige-lighter p-3">
      <div class="flex items-start gap-2">
        <div class="min-w-0"><div class="text-sm text-gray-700">${companyHtml}</div></div>
      </div>
      <div class="mt-2">${titleHtml}</div>
      <div class="mt-auto flex items-center pt-1">
        <p class="job-details line-clamp-2 grow break-normal">${detailSpans}</p>
      </div>
    </div>
  `;
}

describe("ycSource.parseCard", () => {
  it("parses a well-formed card into a typed listing, stripping the batch suffix", () => {
    const card = makeCard({
      company: "Hive (S14)",
      href: "/companies/hive",
      title: "Senior Software Engineer, Data Systems",
      jobHref: "/jobs/103934",
      details: ["Fulltime", "Remote (US)", "Full stack"],
    });

    const result = ycSource.parseCard(card, new Date());

    expect(result.skippedCount).toBe(0);
    expect(result.listings).toEqual([
      {
        source: "yc",
        company: "Hive",
        title: "Senior Software Engineer, Data Systems",
        location: "Remote (US)",
        techStack: ["Full stack"],
        postedDate: null,
        employmentType: "Full-time",
        experienceLevel: null,
        url: "https://www.workatastartup.com/jobs/103934",
      },
    ]);
  });

  it("normalizes the Intern employment-type detail", () => {
    const card = makeCard({
      company: "Acme",
      title: "Software Engineering Intern",
      jobHref: "/jobs/1",
      details: ["Intern", "San Francisco, CA, US"],
    });

    const result = ycSource.parseCard(card, new Date());

    expect(result.listings[0]?.employmentType).toBe("Internship");
  });

  it("skips a card missing the job link", () => {
    const card = makeCard({ company: "Acme", title: "Software Engineer" });

    const result = ycSource.parseCard(card, new Date());

    expect(result.listings).toHaveLength(0);
    expect(result.skippedCount).toBe(1);
  });

  it("skips a card missing a title", () => {
    const card = makeCard({ company: "Acme", jobHref: "/jobs/1" });

    const result = ycSource.parseCard(card, new Date());

    expect(result.listings).toHaveLength(0);
    expect(result.skippedCount).toBe(1);
  });

  it("skips a card missing a company", () => {
    const card = makeCard({ title: "Software Engineer", jobHref: "/jobs/1" });

    const result = ycSource.parseCard(card, new Date());

    expect(result.listings).toHaveLength(0);
    expect(result.skippedCount).toBe(1);
  });

  it("defaults location and tech stack when detail spans are missing", () => {
    const card = makeCard({
      company: "Acme (W20)",
      title: "Software Engineer",
      jobHref: "/jobs/1",
      details: ["Fulltime"],
    });

    const result = ycSource.parseCard(card, new Date());

    expect(result.listings[0]?.company).toBe("Acme");
    expect(result.listings[0]?.location).toBe("");
    expect(result.listings[0]?.techStack).toEqual([]);
    expect(result.listings[0]?.postedDate).toBeNull();
  });
});
