import type { RawJobCardBlob, JobListing, TransformResult } from "./types.js";
import type { JobSource } from "./sources/types.js";

export function transformJobCards(
  source: JobSource,
  blobs: RawJobCardBlob[],
  referenceDate: Date = new Date(),
): TransformResult {
  const listings: JobListing[] = [];
  let skippedCount = 0;

  for (const blob of blobs) {
    const result = source.parseCard(blob.html, referenceDate);
    listings.push(...result.listings);
    skippedCount += result.skippedCount;
  }

  return { listings, skippedCount };
}
