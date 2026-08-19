import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listCachedSites, readCachedSelectors, writeCachedSelectors } from "../selectorCache.js";
import type { DiscoveredSelectors } from "../types.js";

const SAMPLE_SELECTORS: DiscoveredSelectors = {
  cardSelector: ".job-card",
  titleSelector: ".title",
  companySelector: ".company",
  locationSelector: ".location",
  urlSelector: "a",
  dateSelector: null,
  tagsSelector: null,
  employmentTypeSelector: null,
  experienceSelector: null,
};
const SAMPLE_URL = "https://example.com/jobs";

let tempDir: string;
let cachePath: string;

beforeEach(() => {
  tempDir = mkdtempSync(path.join(tmpdir(), "auto-selector-cache-"));
  cachePath = path.join(tempDir, "cache.json");
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("selectorCache", () => {
  it("returns null when no cache file exists yet", () => {
    expect(readCachedSelectors("example.com", cachePath)).toBeNull();
    expect(existsSync(cachePath)).toBe(false);
  });

  it("round-trips selectors for a hostname", () => {
    writeCachedSelectors("example.com", SAMPLE_SELECTORS, SAMPLE_URL, cachePath);

    expect(readCachedSelectors("example.com", cachePath)).toEqual(SAMPLE_SELECTORS);
  });

  it("returns null for a hostname that was never cached", () => {
    writeCachedSelectors("example.com", SAMPLE_SELECTORS, SAMPLE_URL, cachePath);

    expect(readCachedSelectors("other.com", cachePath)).toBeNull();
  });

  it("keeps entries for multiple hostnames independently", () => {
    const otherSelectors: DiscoveredSelectors = { ...SAMPLE_SELECTORS, cardSelector: ".other-card" };

    writeCachedSelectors("example.com", SAMPLE_SELECTORS, SAMPLE_URL, cachePath);
    writeCachedSelectors("other.com", otherSelectors, "https://other.com/jobs", cachePath);

    expect(readCachedSelectors("example.com", cachePath)).toEqual(SAMPLE_SELECTORS);
    expect(readCachedSelectors("other.com", cachePath)).toEqual(otherSelectors);
  });

  it("recovers gracefully from a corrupted cache file", () => {
    writeFileSync(cachePath, "{ not valid json");

    expect(readCachedSelectors("example.com", cachePath)).toBeNull();
  });

  it("overwrites a stale entry for the same hostname", () => {
    const updatedSelectors: DiscoveredSelectors = { ...SAMPLE_SELECTORS, cardSelector: ".new-card" };

    writeCachedSelectors("example.com", SAMPLE_SELECTORS, SAMPLE_URL, cachePath);
    writeCachedSelectors("example.com", updatedSelectors, SAMPLE_URL, cachePath);

    expect(readCachedSelectors("example.com", cachePath)).toEqual(updatedSelectors);
  });

  it("still reads selectors from a legacy pre-searchUrl cache entry", () => {
    writeFileSync(cachePath, JSON.stringify({ "example.com": SAMPLE_SELECTORS }));

    expect(readCachedSelectors("example.com", cachePath)).toEqual(SAMPLE_SELECTORS);
  });

  it("excludes legacy entries with no known searchUrl from listCachedSites", () => {
    writeFileSync(cachePath, JSON.stringify({ "example.com": SAMPLE_SELECTORS }));

    expect(listCachedSites(cachePath)).toEqual([]);
  });

  describe("listCachedSites", () => {
    it("returns an empty list when no cache file exists yet", () => {
      expect(listCachedSites(cachePath)).toEqual([]);
    });

    it("lists every cached hostname with its search URL, sorted", () => {
      writeCachedSelectors("zeta.com", SAMPLE_SELECTORS, "https://zeta.com/jobs", cachePath);
      writeCachedSelectors("alpha.com", SAMPLE_SELECTORS, "https://alpha.com/jobs", cachePath);

      expect(listCachedSites(cachePath)).toEqual([
        { hostname: "alpha.com", searchUrl: "https://alpha.com/jobs" },
        { hostname: "zeta.com", searchUrl: "https://zeta.com/jobs" },
      ]);
    });
  });
});
