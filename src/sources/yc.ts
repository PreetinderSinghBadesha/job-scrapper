import * as cheerio from "cheerio";
import type { Page } from "playwright";
import type { TransformResult, JobListing } from "../types.js";
import type { JobSource } from "./types.js";
import { resolveUrl, normalizeEmploymentType } from "./shared.js";

const SOURCE_ID = "yc";
const SITE_ORIGIN = "https://www.workatastartup.com";
const CARD_SELECTOR = "div.cursor-pointer.rounded.border";
const JOB_LINK_SELECTOR = 'a[href^="/jobs/"]';
const COMPANY_LINK_SELECTOR = 'a[href^="/companies/"]';
const BATCH_SUFFIX_PATTERN = /\s*\([A-Za-z]{1,3}\d{2}\)\s*$/;
// Real postings are "/jobs/{numeric id}"; the site also links to SEO pages
// like "/jobs/l/software-engineer" and "/jobs/san-francisco/software-engineer"
// that share the "/jobs/" prefix but aren't listings.
const JOB_HREF_PATTERN_SOURCE = "^/jobs/\\d+$";
const NAVIGATION_TIMEOUT_MS = 30000;

function isRealJobHref(href: string | null | undefined): boolean {
  return href !== null && href !== undefined && new RegExp(JOB_HREF_PATTERN_SOURCE).test(href);
}

function buildPageUrl(searchUrl: string): string {
  return searchUrl;
}

async function waitForListings(page: Page): Promise<void> {
  await page.waitForFunction(
    (pattern) =>
      Array.from(document.querySelectorAll('a[href^="/jobs/"]')).some((a) =>
        new RegExp(pattern).test(a.getAttribute("href") ?? ""),
      ),
    JOB_HREF_PATTERN_SOURCE,
    { timeout: NAVIGATION_TIMEOUT_MS },
  );
}

async function extractCardHtmls(page: Page): Promise<string[]> {
  return page.$$eval(
    CARD_SELECTOR,
    (nodes, { jobLinkSelector, pattern }) =>
      nodes
        .filter((node) => {
          const link = node.querySelector(jobLinkSelector);
          return link !== null && new RegExp(pattern).test(link.getAttribute("href") ?? "");
        })
        .map((node) => node.outerHTML),
    { jobLinkSelector: JOB_LINK_SELECTOR, pattern: JOB_HREF_PATTERN_SOURCE },
  );
}

function parseCard(html: string): TransformResult {
  const $ = cheerio.load(html, undefined, false);

  const rawCompany = $(COMPANY_LINK_SELECTOR).first().text().trim();
  const company = rawCompany.replace(BATCH_SUFFIX_PATTERN, "").trim();
  const jobLink = $(JOB_LINK_SELECTOR)
    .toArray()
    .map((element) => $(element))
    .find((element) => isRealJobHref(element.attr("href")));
  const title = jobLink?.text().trim() ?? "";
  const url = resolveUrl(jobLink?.attr("href"), SITE_ORIGIN);

  if (company === "" || title === "" || url === null) {
    return { listings: [], skippedCount: 1 };
  }

  const detailSpans = $("p.job-details span")
    .toArray()
    .map((element) => $(element).text().trim());
  const employmentType = normalizeEmploymentType(detailSpans[0]);
  const location = detailSpans[1] ?? "";
  const category = detailSpans[2];
  const techStack = category ? [category] : [];

  const listing: JobListing = {
    source: SOURCE_ID,
    company,
    title,
    location,
    techStack,
    postedDate: null,
    employmentType,
    experienceLevel: null,
    url,
  };
  return { listings: [listing], skippedCount: 0 };
}

export const ycSource: JobSource = {
  id: SOURCE_ID,
  label: "Y Combinator",
  defaultSearchUrl: "https://www.workatastartup.com/jobs",
  defaultPages: 1,
  minPages: 1,
  maxPages: 1,
  buildPageUrl,
  waitForListings,
  extractCardHtmls,
  parseCard,
};
