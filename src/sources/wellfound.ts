import * as cheerio from "cheerio";
import type { Cheerio, CheerioAPI } from "cheerio";
import type { Page } from "playwright";
import type { TransformResult, JobListing } from "../types.js";
import type { JobSource } from "./types.js";
import { resolveUrl, parseWordyRelativeDate } from "./shared.js";

const SOURCE_ID = "wellfound";
const SITE_ORIGIN = "https://wellfound.com";
const CARD_SELECTOR = "div.rounded.border.border-gray-400.bg-white";
const JOB_LINK_SELECTOR = 'a[href^="/jobs/"]';
const ROW_SELECTOR = '[class*="min-h-"]';
const META_SELECTOR = '[class*="text-neutral-500"]';
const DATE_SELECTOR = '[class*="text-dark-a"]';
const CURRENCY_PATTERN = /[$₹£€]/;
const NAVIGATION_TIMEOUT_MS = 30000;

function buildPageUrl(searchUrl: string, pageNumber: number): string {
  const url = new URL(searchUrl);
  url.searchParams.set("page", String(pageNumber));
  return url.toString();
}

async function waitForListings(page: Page): Promise<void> {
  await page.waitForSelector(JOB_LINK_SELECTOR, { timeout: NAVIGATION_TIMEOUT_MS });
}

async function extractCardHtmls(page: Page): Promise<string[]> {
  return page.$$eval(
    CARD_SELECTOR,
    (nodes, jobLinkSelector) =>
      nodes
        .filter((node) => node.querySelector(jobLinkSelector) !== null)
        .map((node) => node.outerHTML),
    JOB_LINK_SELECTOR,
  );
}

function extractCompanyName($: CheerioAPI): string {
  return $("h2").first().text().trim();
}

function extractLocation(row: Cheerio<never>, $: CheerioAPI): string {
  const metaBlocks = row.find(META_SELECTOR);
  for (const element of metaBlocks.toArray()) {
    const text = $(element).text().trim();
    if (text !== "" && !CURRENCY_PATTERN.test(text)) {
      return text;
    }
  }
  return "";
}

function extractPostedDate(row: Cheerio<never>, referenceDate: Date): string | null {
  const dateBlocks = row.find(DATE_SELECTOR);
  const rawText = dateBlocks.first().text().trim();
  return parseWordyRelativeDate(rawText, referenceDate);
}

function parseRow(
  anchorElement: never,
  $: CheerioAPI,
  company: string,
  referenceDate: Date,
): JobListing | null {
  const anchor = $(anchorElement);
  const title = anchor.text().trim();
  const url = resolveUrl(anchor.attr("href"), SITE_ORIGIN);

  if (company === "" || title === "" || url === null) {
    return null;
  }

  const row = anchor.closest(ROW_SELECTOR) as Cheerio<never>;
  const location = extractLocation(row, $);
  const postedDate = extractPostedDate(row, referenceDate);

  return { source: SOURCE_ID, company, title, location, techStack: [], postedDate, url };
}

function parseCard(html: string, referenceDate: Date): TransformResult {
  const $ = cheerio.load(html);
  const company = extractCompanyName($);
  const anchors = $(JOB_LINK_SELECTOR).toArray();

  const listings: JobListing[] = [];
  let skippedCount = 0;

  for (const anchorElement of anchors) {
    const listing = parseRow(anchorElement as never, $, company, referenceDate);
    if (listing === null) {
      skippedCount += 1;
      continue;
    }
    listings.push(listing);
  }

  return { listings, skippedCount };
}

export const wellfoundSource: JobSource = {
  id: SOURCE_ID,
  label: "Wellfound",
  defaultSearchUrl: "https://wellfound.com/role/l/software-engineer/india",
  defaultPages: 4,
  minPages: 3,
  maxPages: 5,
  buildPageUrl,
  waitForListings,
  extractCardHtmls,
  parseCard,
};
