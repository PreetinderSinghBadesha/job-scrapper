import * as cheerio from "cheerio";
import type { Page } from "playwright";
import type { TransformResult, JobListing } from "../types.js";
import type { JobSource } from "./types.js";
import { resolveUrl, parseShortRelativeDate } from "./shared.js";

const SOURCE_ID = "weworkremotely";
const SITE_ORIGIN = "https://weworkremotely.com";
const CARD_SELECTOR = "section.jobs li";
const TITLE_SELECTOR = ".new-listing__header__title__text";
const JOB_LINK_SELECTOR = 'a[href^="/remote-jobs/"]';
const NAVIGATION_TIMEOUT_MS = 30000;

function buildPageUrl(searchUrl: string): string {
  return searchUrl;
}

async function waitForListings(page: Page): Promise<void> {
  await page.waitForSelector(TITLE_SELECTOR, { timeout: NAVIGATION_TIMEOUT_MS });
}

async function extractCardHtmls(page: Page): Promise<string[]> {
  return page.$$eval(
    CARD_SELECTOR,
    (nodes, titleSelector) =>
      nodes.filter((node) => node.querySelector(titleSelector) !== null).map((node) => node.outerHTML),
    TITLE_SELECTOR,
  );
}

function parseCard(html: string, referenceDate: Date): TransformResult {
  const $ = cheerio.load(html, undefined, false);

  const title = $(TITLE_SELECTOR).first().text().trim();
  const url = resolveUrl($(JOB_LINK_SELECTOR).first().attr("href"), SITE_ORIGIN);
  const company = $(".new-listing__company-name").first().text().trim();

  if (company === "" || title === "" || url === null) {
    return { listings: [], skippedCount: 1 };
  }

  const location = $(".new-listing__company-headquarters").first().text().trim();
  const rawPostedDate = $(".new-listing__header__icons__date").first().text().trim();
  const postedDate = parseShortRelativeDate(rawPostedDate, referenceDate);

  const listing: JobListing = { source: SOURCE_ID, company, title, location, techStack: [], postedDate, url };
  return { listings: [listing], skippedCount: 0 };
}

export const weWorkRemotelySource: JobSource = {
  id: SOURCE_ID,
  label: "We Work Remotely",
  defaultSearchUrl: "https://weworkremotely.com/categories/remote-programming-jobs",
  defaultPages: 1,
  minPages: 1,
  maxPages: 1,
  buildPageUrl,
  waitForListings,
  extractCardHtmls,
  parseCard,
};
