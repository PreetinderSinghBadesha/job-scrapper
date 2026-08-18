import type { Page } from "playwright";
import type { TransformResult } from "../types.js";

export interface JobSource {
  readonly id: string;
  readonly label: string;
  readonly defaultSearchUrl: string;
  readonly defaultPages: number;
  readonly minPages: number;
  readonly maxPages: number;
  buildPageUrl(searchUrl: string, pageNumber: number): string;
  waitForListings(page: Page): Promise<void>;
  extractCardHtmls(page: Page): Promise<string[]>;
  parseCard(html: string, referenceDate: Date): TransformResult;
}
