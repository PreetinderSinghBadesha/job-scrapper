import { Pool } from "pg";
import type { JobListing, StoredJobListing } from "./types.js";

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS job_listings (
    id SERIAL PRIMARY KEY,
    source TEXT NOT NULL DEFAULT 'unknown',
    company TEXT NOT NULL,
    title TEXT NOT NULL,
    location TEXT NOT NULL,
    tech_stack TEXT[] NOT NULL DEFAULT '{}',
    posted_date DATE,
    url TEXT NOT NULL UNIQUE,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;

const ADD_SOURCE_COLUMN_SQL = `
  ALTER TABLE job_listings ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'unknown'
`;

const UPSERT_SQL = `
  INSERT INTO job_listings (source, company, title, location, tech_stack, posted_date, url, last_seen_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, now())
  ON CONFLICT (url) DO UPDATE SET
    source = EXCLUDED.source,
    company = EXCLUDED.company,
    title = EXCLUDED.title,
    location = EXCLUDED.location,
    tech_stack = EXCLUDED.tech_stack,
    posted_date = EXCLUDED.posted_date,
    last_seen_at = now()
`;

const SELECT_LISTINGS_SQL = `
  SELECT id, source, company, title, location, tech_stack, posted_date, url, first_seen_at, last_seen_at
  FROM job_listings
  WHERE ($1::text IS NULL
     OR company ILIKE '%' || $1 || '%'
     OR title ILIKE '%' || $1 || '%'
     OR location ILIKE '%' || $1 || '%')
    AND ($3::text IS NULL OR source = $3)
  ORDER BY last_seen_at DESC, id DESC
  LIMIT $2
`;

const COUNT_LISTINGS_SQL = `
  SELECT count(*)::int AS total
  FROM job_listings
  WHERE ($1::text IS NULL
     OR company ILIKE '%' || $1 || '%'
     OR title ILIKE '%' || $1 || '%'
     OR location ILIKE '%' || $1 || '%')
    AND ($2::text IS NULL OR source = $2)
`;

const SUMMARY_SQL = `
  SELECT count(*)::int AS total_listings,
         count(DISTINCT company)::int AS total_companies,
         max(last_seen_at) AS last_updated_at
  FROM job_listings
`;

const SUMMARY_BY_SOURCE_SQL = `
  SELECT source, count(*)::int AS total
  FROM job_listings
  GROUP BY source
  ORDER BY total DESC
`;

interface JobListingRow {
  readonly id: number;
  readonly source: string;
  readonly company: string;
  readonly title: string;
  readonly location: string;
  readonly tech_stack: string[];
  readonly posted_date: Date | null;
  readonly url: string;
  readonly first_seen_at: Date;
  readonly last_seen_at: Date;
}

function toDateOnlyString(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10);
}

function mapRow(row: JobListingRow): StoredJobListing {
  return {
    id: row.id,
    source: row.source,
    company: row.company,
    title: row.title,
    location: row.location,
    techStack: row.tech_stack,
    postedDate: toDateOnlyString(row.posted_date),
    url: row.url,
    firstSeenAt: row.first_seen_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
  };
}

export interface ListingsQuery {
  readonly search?: string;
  readonly limit?: number;
  readonly source?: string;
}

export interface ListingsPage {
  readonly listings: StoredJobListing[];
  readonly total: number;
}

export interface SourceCount {
  readonly source: string;
  readonly total: number;
}

export interface ListingsSummary {
  readonly totalListings: number;
  readonly totalCompanies: number;
  readonly lastUpdatedAt: string | null;
  readonly bySource: SourceCount[];
}

export function createPool(connectionString: string): Pool {
  return new Pool({ connectionString });
}

export async function migrate(pool: Pool): Promise<void> {
  await pool.query(CREATE_TABLE_SQL);
  await pool.query(ADD_SOURCE_COLUMN_SQL);
}

export async function upsertListings(pool: Pool, listings: JobListing[]): Promise<number> {
  if (listings.length === 0) {
    return 0;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const listing of listings) {
      await client.query(UPSERT_SQL, [
        listing.source,
        listing.company,
        listing.title,
        listing.location,
        listing.techStack,
        listing.postedDate,
        listing.url,
      ]);
    }
    await client.query("COMMIT");
    return listings.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getListings(pool: Pool, query: ListingsQuery = {}): Promise<ListingsPage> {
  const search = query.search?.trim() || null;
  const limit = Math.min(Math.max(query.limit ?? 200, 1), 500);
  const source = query.source?.trim() || null;

  const [listingsResult, countResult] = await Promise.all([
    pool.query<JobListingRow>(SELECT_LISTINGS_SQL, [search, limit, source]),
    pool.query<{ total: number }>(COUNT_LISTINGS_SQL, [search, source]),
  ]);

  return {
    listings: listingsResult.rows.map(mapRow),
    total: countResult.rows[0]?.total ?? 0,
  };
}

export async function getListingsSummary(pool: Pool): Promise<ListingsSummary> {
  const [summaryResult, bySourceResult] = await Promise.all([
    pool.query<{
      total_listings: number;
      total_companies: number;
      last_updated_at: Date | null;
    }>(SUMMARY_SQL),
    pool.query<{ source: string; total: number }>(SUMMARY_BY_SOURCE_SQL),
  ]);

  const row = summaryResult.rows[0];
  return {
    totalListings: row?.total_listings ?? 0,
    totalCompanies: row?.total_companies ?? 0,
    lastUpdatedAt: row?.last_updated_at ? row.last_updated_at.toISOString() : null,
    bySource: bySourceResult.rows.map((r) => ({ source: r.source, total: r.total })),
  };
}
