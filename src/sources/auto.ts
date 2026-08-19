import * as cheerio from "cheerio";
import type { Page } from "playwright";
import type { TransformResult, JobListing } from "../types.js";
import type { JobSource } from "./types.js";
import type { DiscoveredSelectors } from "./auto/types.js";
import { resolveUrl, normalizeEmploymentType, normalizeExperienceKeyword, bucketYearsOfExperience } from "./shared.js";
import { simplifyHtmlForPrompt } from "./auto/htmlCleanup.js";
import { readCachedSelectors, writeCachedSelectors } from "./auto/selectorCache.js";
import { createOpenRouterSelectorDiscoveryClient } from "./auto/discoverSelectors.js";

const SOURCE_ID = "auto";
const NAVIGATION_TIMEOUT_MS = 30000;
const MAX_PROMPT_HTML_CHARS = 200000;
const MIN_CARD_MATCHES = 2;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/;
const EXPERIENCE_YEARS_PATTERN = /(\d+)\+?\s*years?/i;

function deriveExperienceLevel(rawText: string): string | null {
  const yearsMatch = EXPERIENCE_YEARS_PATTERN.exec(rawText);
  if (yearsMatch?.[1] !== undefined) {
    return bucketYearsOfExperience(Number(yearsMatch[1]));
  }
  return normalizeExperienceKeyword(rawText);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function buildPageUrl(searchUrl: string, pageNumber: number): string {
  if (pageNumber <= 1) {
    return searchUrl;
  }
  const url = new URL(searchUrl);
  url.searchParams.set("page", String(pageNumber));
  return url.toString();
}

async function waitForListings(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: NAVIGATION_TIMEOUT_MS }).catch(() => undefined);
}

async function countMatches(page: Page, selector: string): Promise<number> {
  try {
    return await page.locator(selector).count();
  } catch {
    return 0;
  }
}

async function extractWithSelectors(page: Page, cardSelector: string): Promise<string[]> {
  try {
    return await page.$$eval(cardSelector, (nodes) => nodes.map((node) => node.outerHTML));
  } catch {
    return [];
  }
}

async function discoverAndCacheSelectors(page: Page, hostname: string): Promise<DiscoveredSelectors> {
  const html = await page.content();
  const prompt = simplifyHtmlForPrompt(html, MAX_PROMPT_HTML_CHARS);
  const client = createOpenRouterSelectorDiscoveryClient(
    requireEnv("OPENROUTER_API_KEY"),
    process.env["OPENROUTER_MODEL"],
  );
  const selectors = await client.discover(prompt);

  const matches = await countMatches(page, selectors.cardSelector);
  if (matches < MIN_CARD_MATCHES) {
    throw new Error(
      `Discovered card selector "${selectors.cardSelector}" matched ${matches} element(s), expected at least ${MIN_CARD_MATCHES}`,
    );
  }

  writeCachedSelectors(hostname, selectors, page.url());
  return selectors;
}

// extractCardHtmls and parseCard both need the selectors discovered for this
// page, but the JobSource interface has no shared-context parameter between
// them. index.ts always runs one source's extract-then-transform sequentially
// before moving to the next, so module-level state is safe here; the actual
// parsing logic lives in the pure, separately-testable parseCardWithSelectors.
let activeSelectors: DiscoveredSelectors | null = null;
let activeOrigin = "";

async function extractCardHtmls(page: Page): Promise<string[]> {
  const url = new URL(page.url());
  activeOrigin = url.origin;

  const cached = readCachedSelectors(url.hostname);
  let selectors = cached;
  let cards = cached ? await extractWithSelectors(page, cached.cardSelector) : [];

  if (cards.length === 0) {
    selectors = await discoverAndCacheSelectors(page, url.hostname);
    cards = await extractWithSelectors(page, selectors.cardSelector);
  }

  activeSelectors = selectors;
  return cards;
}

function textAt($: cheerio.CheerioAPI, selector: string | null): string {
  return selector === null ? "" : $(selector).first().text().trim();
}

export function parseCardWithSelectors(
  html: string,
  selectors: DiscoveredSelectors,
  origin: string,
): TransformResult {
  const $ = cheerio.load(html, undefined, false);

  const title = textAt($, selectors.titleSelector);
  const company = textAt($, selectors.companySelector);
  const href = selectors.urlSelector ? $(selectors.urlSelector).first().attr("href") : undefined;
  const url = resolveUrl(href, origin);

  if (title === "" || company === "" || url === null) {
    return { listings: [], skippedCount: 1 };
  }

  const location = textAt($, selectors.locationSelector);
  const rawDate = textAt($, selectors.dateSelector);
  const postedDate = ISO_DATE_PATTERN.test(rawDate) ? rawDate.slice(0, 10) : null;
  const techStack = selectors.tagsSelector
    ? $(selectors.tagsSelector)
        .toArray()
        .map((element) => $(element).text().trim())
        .filter((tag) => tag !== "")
    : [];
  const employmentType = normalizeEmploymentType(textAt($, selectors.employmentTypeSelector));
  const rawExperience = textAt($, selectors.experienceSelector);
  const experienceLevel = rawExperience === "" ? null : deriveExperienceLevel(rawExperience);

  const source = new URL(origin).hostname;
  const listing: JobListing = {
    source,
    company,
    title,
    location,
    techStack,
    postedDate,
    employmentType,
    experienceLevel,
    url,
  };
  return { listings: [listing], skippedCount: 0 };
}

function parseCard(html: string): TransformResult {
  if (activeSelectors === null) {
    return { listings: [], skippedCount: 1 };
  }
  return parseCardWithSelectors(html, activeSelectors, activeOrigin);
}

export const autoSource: JobSource = {
  id: SOURCE_ID,
  label: "Auto-detected",
  get defaultSearchUrl(): string {
    return requireEnv("AUTO_SOURCE_URL");
  },
  defaultPages: 1,
  minPages: 1,
  maxPages: 5,
  buildPageUrl,
  waitForListings,
  extractCardHtmls,
  parseCard,
};
