import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Request, type Response } from "express";
import { createPool, migrate, getListings, getListingsSummary, upsertListings } from "./loader.js";
import { extractJobCards } from "./extractor.js";
import { transformJobCards } from "./transformer.js";
import { autoSource } from "./sources/auto.js";
import { listCachedSites } from "./sources/auto/selectorCache.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

interface AutoScrapeRequestBody {
  readonly url?: unknown;
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(currentDir, "..", "public");

const databaseUrl = requireEnv("DATABASE_URL");
const port = process.env["PORT"] ? Number(process.env["PORT"]) : 3000;
const pool = createPool(databaseUrl);

let autoScrapeInProgress = false;

const app = express();
app.use(express.json());
app.use(express.static(publicDir));

function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

app.get("/api/listings", async (req: Request, res: Response) => {
  const search = stringParam(req.query["search"]);
  const source = stringParam(req.query["source"]);
  const employmentType = stringParam(req.query["employmentType"]);
  const experienceLevel = stringParam(req.query["experienceLevel"]);
  const postedWithinDaysParam = stringParam(req.query["postedWithinDays"]);
  const postedWithinDays =
    postedWithinDaysParam !== undefined && Number.isFinite(Number(postedWithinDaysParam))
      ? Number(postedWithinDaysParam)
      : undefined;
  const sortParam = req.query["sort"];
  const sort = sortParam === "scraped" ? "scraped" : "posted";

  try {
    const [page, summary] = await Promise.all([
      getListings(pool, {
        ...(search !== undefined ? { search } : {}),
        ...(source !== undefined ? { source } : {}),
        ...(employmentType !== undefined ? { employmentType } : {}),
        ...(experienceLevel !== undefined ? { experienceLevel } : {}),
        ...(postedWithinDays !== undefined ? { postedWithinDays } : {}),
        sort,
      }),
      getListingsSummary(pool),
    ]);
    res.json({ ...page, summary });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get("/api/auto-sites", (_req: Request, res: Response) => {
  res.json({ sites: listCachedSites() });
});

app.post(
  "/api/auto-scrape",
  async (req: Request<Record<string, never>, unknown, AutoScrapeRequestBody>, res: Response) => {
    const rawUrl = req.body.url;
    const url = typeof rawUrl === "string" ? rawUrl.trim() : "";

    if (url === "" || !isHttpUrl(url)) {
      res.status(400).json({ error: "Provide a valid http(s) URL" });
      return;
    }

    if (autoScrapeInProgress) {
      res.status(409).json({ error: "Another auto-scrape is already running — try again shortly" });
      return;
    }

    autoScrapeInProgress = true;
    try {
      const rawCards = await extractJobCards(autoSource, { searchUrl: url });
      const { listings, skippedCount } = transformJobCards(autoSource, rawCards);
      const upserted = await upsertListings(pool, listings);

      res.json({ scraped: listings.length + skippedCount, upserted, skipped: skippedCount });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    } finally {
      autoScrapeInProgress = false;
    }
  },
);

async function start(): Promise<void> {
  await migrate(pool);
  app.listen(port, () => {
    process.stdout.write(`Listening on http://localhost:${port}\n`);
  });
}

start().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
