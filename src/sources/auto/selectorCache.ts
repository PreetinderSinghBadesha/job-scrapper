import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { DiscoveredSelectors } from "./types.js";

export const DEFAULT_CACHE_PATH = path.join(process.cwd(), ".cache", "auto-selectors.json");

interface CacheEntry {
  readonly searchUrl: string | null;
  readonly selectors: DiscoveredSelectors;
}

type CacheFile = Record<string, CacheEntry>;

function isDiscoveredSelectors(value: unknown): value is DiscoveredSelectors {
  return (
    typeof value === "object" && value !== null && typeof (value as Record<string, unknown>)["cardSelector"] === "string"
  );
}

// Cache entries written before the "update" button existed are a bare DiscoveredSelectors
// object with no searchUrl. Reading both that legacy shape and the current
// { searchUrl, selectors } shape means already-discovered selectors keep working without
// a wasted LLM re-call — they just won't have a known URL to list until next discovered.
function normalizeEntry(value: unknown): CacheEntry | null {
  if (isDiscoveredSelectors(value)) {
    return { searchUrl: null, selectors: value };
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    if (isDiscoveredSelectors(record["selectors"])) {
      const searchUrl = typeof record["searchUrl"] === "string" ? record["searchUrl"] : null;
      return { searchUrl, selectors: record["selectors"] };
    }
  }
  return null;
}

function readCacheFile(cachePath: string): CacheFile {
  if (!existsSync(cachePath)) {
    return {};
  }
  try {
    const parsed = JSON.parse(readFileSync(cachePath, "utf8")) as Record<string, unknown>;
    const cache: CacheFile = {};
    for (const [hostname, rawEntry] of Object.entries(parsed)) {
      const entry = normalizeEntry(rawEntry);
      if (entry !== null) {
        cache[hostname] = entry;
      }
    }
    return cache;
  } catch {
    return {};
  }
}

export function readCachedSelectors(
  hostname: string,
  cachePath: string = DEFAULT_CACHE_PATH,
): DiscoveredSelectors | null {
  return readCacheFile(cachePath)[hostname]?.selectors ?? null;
}

export function writeCachedSelectors(
  hostname: string,
  selectors: DiscoveredSelectors,
  searchUrl: string,
  cachePath: string = DEFAULT_CACHE_PATH,
): void {
  const cache = readCacheFile(cachePath);
  cache[hostname] = { searchUrl, selectors };
  mkdirSync(path.dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

export interface KnownSite {
  readonly hostname: string;
  readonly searchUrl: string;
}

export function listCachedSites(cachePath: string = DEFAULT_CACHE_PATH): KnownSite[] {
  const cache = readCacheFile(cachePath);
  const sites: KnownSite[] = [];
  for (const [hostname, entry] of Object.entries(cache)) {
    if (entry.searchUrl !== null) {
      sites.push({ hostname, searchUrl: entry.searchUrl });
    }
  }
  return sites.sort((a, b) => a.hostname.localeCompare(b.hostname));
}
