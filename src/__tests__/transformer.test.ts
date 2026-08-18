import { describe, expect, it } from "vitest";
import { transformJobCards } from "../transformer.js";
import type { RawJobCardBlob, TransformResult } from "../types.js";
import type { JobSource } from "../sources/types.js";

function makeStubSource(parse: (html: string) => TransformResult): JobSource {
  return {
    id: "stub",
    label: "Stub",
    defaultSearchUrl: "https://example.com",
    defaultPages: 1,
    minPages: 1,
    maxPages: 1,
    buildPageUrl: (searchUrl) => searchUrl,
    waitForListings: async () => undefined,
    extractCardHtmls: async () => [],
    parseCard: parse,
  };
}

function makeBlob(html: string): RawJobCardBlob {
  return { html, source: "stub", pageNumber: 1, pageUrl: "https://example.com" };
}

describe("transformJobCards", () => {
  it("delegates parsing to the source and aggregates listings and skip counts", () => {
    const source = makeStubSource((html) =>
      html === "good"
        ? {
            listings: [
              {
                source: "stub",
                company: "Acme",
                title: "Engineer",
                location: "Remote",
                techStack: [],
                postedDate: null,
                url: "https://example.com/1",
              },
            ],
            skippedCount: 0,
          }
        : { listings: [], skippedCount: 1 },
    );

    const result = transformJobCards(source, [makeBlob("good"), makeBlob("bad")]);

    expect(result.listings).toHaveLength(1);
    expect(result.skippedCount).toBe(1);
  });

  it("returns an empty result for no blobs", () => {
    const source = makeStubSource(() => ({ listings: [], skippedCount: 0 }));

    const result = transformJobCards(source, []);

    expect(result.listings).toHaveLength(0);
    expect(result.skippedCount).toBe(0);
  });
});
