import "dotenv/config";
import { extractJobCards } from "./extractor.js";
import { transformJobCards } from "./transformer.js";
import { createPool, migrate, upsertListings } from "./loader.js";
import { resolveSources } from "./sources/index.js";
import type { JobListing, RunSummary, SourceRunSummary } from "./types.js";

const BETWEEN_SOURCE_DELAY_MS = 2000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printSummary(summary: RunSummary): void {
  process.stdout.write(
    `${summary.scraped} scraped, ${summary.upserted} upserted, ${summary.skipped} skipped\n`,
  );
  for (const source of summary.bySource) {
    process.stdout.write(`  ${source.source}: ${source.scraped} scraped, ${source.skipped} skipped\n`);
  }
}

async function run(): Promise<void> {
  const databaseUrl = requireEnv("DATABASE_URL");
  const sourceIds = process.env["JOB_SOURCES"]?.split(",");
  const sources = resolveSources(sourceIds);
  const searchUrl = sources.length === 1 ? process.env["JOB_SEARCH_URL"] : undefined;
  const pageCount = process.env["JOB_SEARCH_PAGES"]
    ? Number(process.env["JOB_SEARCH_PAGES"])
    : undefined;
  const referenceDate = new Date();

  const allListings: JobListing[] = [];
  const bySource: SourceRunSummary[] = [];
  let totalSkipped = 0;

  for (const [index, source] of sources.entries()) {
    const rawCards = await extractJobCards(source, {
      ...(searchUrl !== undefined ? { searchUrl } : {}),
      ...(pageCount !== undefined ? { pageCount } : {}),
    });
    const { listings, skippedCount } = transformJobCards(source, rawCards, referenceDate);

    allListings.push(...listings);
    totalSkipped += skippedCount;
    bySource.push({ source: source.id, scraped: listings.length + skippedCount, skipped: skippedCount });

    if (index < sources.length - 1) {
      await sleep(BETWEEN_SOURCE_DELAY_MS);
    }
  }

  const pool = createPool(databaseUrl);
  try {
    await migrate(pool);
    const upserted = await upsertListings(pool, allListings);

    printSummary({
      scraped: allListings.length + totalSkipped,
      upserted,
      skipped: totalSkipped,
      bySource,
    });
  } finally {
    await pool.end();
  }
}

run().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
