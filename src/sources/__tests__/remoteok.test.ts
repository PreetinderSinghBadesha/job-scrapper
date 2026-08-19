import { describe, expect, it } from "vitest";
import { remoteOkSource } from "../remoteok.js";

function makeRow(params: {
  company?: string;
  title?: string;
  dataUrl?: string;
  locations?: string[];
  tags?: string[];
  datetime?: string;
}): string {
  const companyHtml = params.company === undefined ? "" : `<h3 itemprop="name">${params.company}</h3>`;
  const titleHtml = params.title === undefined ? "" : `<h2 itemprop="title">${params.title}</h2>`;
  const locationsHtml = (params.locations ?? [])
    .map((text) => `<div class="location">${text}</div>`)
    .join("");
  const tagsHtml = (params.tags ?? []).map((tag) => `<div class="tag">${tag}</div>`).join("");
  const timeHtml = params.datetime === undefined ? "" : `<time datetime="${params.datetime}">ago</time>`;
  const dataUrlAttr = params.dataUrl === undefined ? "" : ` data-url="${params.dataUrl}"`;

  return `
    <tr class="job"${dataUrlAttr}>
      <td class="company">${companyHtml}</td>
      <td>${titleHtml}${locationsHtml}</td>
      <td>${tagsHtml}</td>
      <td>${timeHtml}</td>
    </tr>
  `;
}

describe("remoteOkSource.parseCard", () => {
  it("parses a well-formed row into a typed listing", () => {
    const row = makeRow({
      company: "Acme Corp",
      title: "Senior Software Engineer",
      dataUrl: "/remote-jobs/senior-software-engineer-123",
      locations: ["🌏 Worldwide", "💰 $100k – $150k"],
      tags: ["Python", "Remote"],
      datetime: "2026-08-15T12:00:00+00:00",
    });

    const result = remoteOkSource.parseCard(row, new Date());

    expect(result.skippedCount).toBe(0);
    expect(result.listings).toEqual([
      {
        source: "remoteok",
        company: "Acme Corp",
        title: "Senior Software Engineer",
        location: "🌏 Worldwide",
        techStack: ["Python", "Remote"],
        postedDate: "2026-08-15",
        employmentType: null,
        experienceLevel: null,
        url: "https://remoteok.com/remote-jobs/senior-software-engineer-123",
      },
    ]);
  });

  it("classifies known employment-type and seniority tags out of the tech stack", () => {
    const row = makeRow({
      company: "Acme Corp",
      title: "Senior Software Engineer",
      dataUrl: "/remote-jobs/1",
      tags: ["Python", "Senior", "Full Time", "Golang"],
    });

    const result = remoteOkSource.parseCard(row, new Date());

    expect(result.listings[0]?.employmentType).toBe("Full-time");
    expect(result.listings[0]?.experienceLevel).toBe("Senior");
    expect(result.listings[0]?.techStack).toEqual(["Python", "Golang"]);
  });

  it("skips a row missing data-url", () => {
    const row = makeRow({ company: "Acme Corp", title: "Software Engineer" });

    const result = remoteOkSource.parseCard(row, new Date());

    expect(result.listings).toHaveLength(0);
    expect(result.skippedCount).toBe(1);
  });

  it("skips a row missing a title", () => {
    const row = makeRow({ company: "Acme Corp", dataUrl: "/remote-jobs/1" });

    const result = remoteOkSource.parseCard(row, new Date());

    expect(result.listings).toHaveLength(0);
    expect(result.skippedCount).toBe(1);
  });

  it("skips a row missing a company", () => {
    const row = makeRow({ title: "Software Engineer", dataUrl: "/remote-jobs/1" });

    const result = remoteOkSource.parseCard(row, new Date());

    expect(result.listings).toHaveLength(0);
    expect(result.skippedCount).toBe(1);
  });

  it("defaults tech stack to an empty array and posted date to null when absent", () => {
    const row = makeRow({
      company: "Acme Corp",
      title: "Software Engineer",
      dataUrl: "/remote-jobs/1",
    });

    const result = remoteOkSource.parseCard(row, new Date());

    expect(result.listings[0]?.techStack).toEqual([]);
    expect(result.listings[0]?.postedDate).toBeNull();
    expect(result.listings[0]?.location).toBe("");
  });
});
