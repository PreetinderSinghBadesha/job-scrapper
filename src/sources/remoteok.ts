import * as cheerio from "cheerio";
import type { Page } from "playwright";
import type { TransformResult, JobListing } from "../types.js";
import type { JobSource } from "./types.js";
import { resolveUrl } from "./shared.js";

const SOURCE_ID = "remoteok";
const SITE_ORIGIN = "https://remoteok.com";
const ROW_SELECTOR = "tr.job[data-url]";
const SALARY_TEASER_PREFIX = "💰";
const NAVIGATION_TIMEOUT_MS = 30000;

function buildPageUrl(searchUrl: string): string {
  return searchUrl;
}

async function waitForListings(page: Page): Promise<void> {
  await page.waitForSelector(ROW_SELECTOR, { timeout: NAVIGATION_TIMEOUT_MS });
}

async function extractCardHtmls(page: Page): Promise<string[]> {
  return page.$$eval(ROW_SELECTOR, (nodes) => nodes.map((node) => node.outerHTML));
}

function parseCard(html: string): TransformResult {
  const $ = cheerio.load(html, undefined, false);

  const company = $('h3[itemprop="name"]').first().text().trim();
  const title = $('h2[itemprop="title"]').first().text().trim();
  const url = resolveUrl($("[data-url]").first().attr("data-url"), SITE_ORIGIN);

  if (company === "" || title === "" || url === null) {
    return { listings: [], skippedCount: 1 };
  }

  let location = "";
  for (const element of $(".location").toArray()) {
    const text = $(element).text().trim();
    if (text !== "" && !text.startsWith(SALARY_TEASER_PREFIX)) {
      location = text;
      break;
    }
  }

  const techStack = $(".tag")
    .toArray()
    .map((element) => $(element).text().trim())
    .filter((tag) => tag !== "");

  const datetime = $("time").first().attr("datetime");
  const postedDate = datetime ? datetime.slice(0, 10) : null;

  const listing: JobListing = { source: SOURCE_ID, company, title, location, techStack, postedDate, url };
  return { listings: [listing], skippedCount: 0 };
}

export const remoteOkSource: JobSource = {
  id: SOURCE_ID,
  label: "RemoteOK",
  defaultSearchUrl: "https://remoteok.com/remote-dev-jobs",
  defaultPages: 1,
  minPages: 1,
  maxPages: 1,
  buildPageUrl,
  waitForListings,
  extractCardHtmls,
  parseCard,
};
