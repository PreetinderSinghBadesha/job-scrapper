import { chromium, type Browser, type Page } from "playwright";
import type { RawJobCardBlob } from "./types.js";
import type { JobSource } from "./sources/types.js";

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1000;
const MIN_PAGE_DELAY_MS = 2000;
const MAX_PAGE_DELAY_MS = 5000;
const NAVIGATION_TIMEOUT_MS = 30000;

export interface ExtractorOptions {
  readonly searchUrl?: string;
  readonly pageCount?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelayMs(minMs: number, maxMs: number): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

async function withRetry<T>(operation: () => Promise<T>, label: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRY_ATTEMPTS) {
        const backoffMs = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
        await sleep(backoffMs);
      }
    }
  }
  throw new Error(`${label} failed after ${MAX_RETRY_ATTEMPTS} attempts: ${String(lastError)}`);
}

async function extractCardsFromPage(page: Page, source: JobSource, pageUrl: string): Promise<string[]> {
  await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
  await source.waitForListings(page);
  return source.extractCardHtmls(page);
}

export async function extractJobCards(
  source: JobSource,
  options: ExtractorOptions = {},
): Promise<RawJobCardBlob[]> {
  const searchUrl = options.searchUrl ?? source.defaultSearchUrl;
  const requestedPages = options.pageCount ?? source.defaultPages;
  const pageCount = Math.min(Math.max(requestedPages, source.minPages), source.maxPages);

  const browser: Browser = await chromium.launch({ headless: true });
  const blobs: RawJobCardBlob[] = [];

  try {
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const pageUrl = source.buildPageUrl(searchUrl, pageNumber);
      const cardHtmls = await withRetry(
        () => extractCardsFromPage(page, source, pageUrl),
        `extract ${source.id} page ${pageNumber}`,
      );

      if (cardHtmls.length === 0) {
        break;
      }

      for (const html of cardHtmls) {
        blobs.push({ html, source: source.id, pageNumber, pageUrl });
      }

      if (pageNumber < pageCount) {
        await sleep(randomDelayMs(MIN_PAGE_DELAY_MS, MAX_PAGE_DELAY_MS));
      }
    }
  } finally {
    await browser.close();
  }

  return blobs;
}
