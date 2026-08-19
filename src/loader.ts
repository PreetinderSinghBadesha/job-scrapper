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
    employment_type TEXT,
    experience_level TEXT,
    url TEXT NOT NULL UNIQUE,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;

const ADD_SOURCE_COLUMN_SQL = `
  ALTER TABLE job_listings ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'unknown'
`;

const ADD_EMPLOYMENT_TYPE_COLUMN_SQL = `
  ALTER TABLE job_listings ADD COLUMN IF NOT EXISTS employment_type TEXT
`;

const ADD_EXPERIENCE_LEVEL_COLUMN_SQL = `
  ALTER TABLE job_listings ADD COLUMN IF NOT EXISTS experience_level TEXT
`;

const UPSERT_SQL = `
  INSERT INTO job_listings
    (source, company, title, location, tech_stack, posted_date, employment_type, experience_level, url, last_seen_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
  ON CONFLICT (url) DO UPDATE SET
    source = EXCLUDED.source,
    company = EXCLUDED.company,
    title = EXCLUDED.title,
    location = EXCLUDED.location,
    tech_stack = EXCLUDED.tech_stack,
    posted_date = EXCLUDED.posted_date,
    employment_type = EXCLUDED.employment_type,
    experience_level = EXCLUDED.experience_level,
    last_seen_at = now()
`;

// $1 search, $2 source, $3 employmentType, $4 experienceLevel, $5 postedWithinDays.
// A freshness cutoff never hides a listing with an unknown posted_date — sources
// that don't expose a date (e.g. Y Combinator) would otherwise vanish under any filter.
const WHERE_CLAUSE = `
  WHERE ($1::text IS NULL
     OR company ILIKE '%' || $1 || '%'
     OR title ILIKE '%' || $1 || '%'
     OR location ILIKE '%' || $1 || '%')
    AND ($2::text IS NULL OR source = $2)
    AND ($3::text IS NULL OR employment_type = $3)
    AND ($4::text IS NULL OR experience_level = $4)
    AND ($5::int IS NULL OR posted_date IS NULL OR posted_date >= (CURRENT_DATE - $5::int))
`;

export type SortMode = "posted" | "scraped";

const SORT_CLAUSES: Record<SortMode, string> = {
  posted: "posted_date DESC NULLS LAST, last_seen_at DESC, id DESC",
  scraped: "last_seen_at DESC, id DESC",
};

function selectListingsSql(sort: SortMode): string {
  return `
    SELECT id, source, company, title, location, tech_stack, posted_date, employment_type, experience_level,
           url, first_seen_at, last_seen_at
    FROM job_listings
    ${WHERE_CLAUSE}
    ORDER BY ${SORT_CLAUSES[sort]}
    LIMIT $6
  `;
}

const COUNT_LISTINGS_SQL = `
  SELECT count(*)::int AS total
  FROM job_listings
  ${WHERE_CLAUSE}
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

const SUMMARY_BY_EMPLOYMENT_TYPE_SQL = `
  SELECT employment_type, count(*)::int AS total
  FROM job_listings
  WHERE employment_type IS NOT NULL
  GROUP BY employment_type
  ORDER BY total DESC
`;

const SUMMARY_BY_EXPERIENCE_LEVEL_SQL = `
  SELECT experience_level, count(*)::int AS total
  FROM job_listings
  WHERE experience_level IS NOT NULL
  GROUP BY experience_level
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
  readonly employment_type: string | null;
  readonly experience_level: string | null;
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
    employmentType: row.employment_type,
    experienceLevel: row.experience_level,
    url: row.url,
    firstSeenAt: row.first_seen_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
  };
}

export interface ListingsQuery {
  readonly search?: string;
  readonly limit?: number;
  readonly source?: string;
  readonly employmentType?: string;
  readonly experienceLevel?: string;
  readonly postedWithinDays?: number;
  readonly sort?: SortMode;
}

export interface ListingsPage {
  readonly listings: StoredJobListing[];
  readonly total: number;
}

export interface FacetCount {
  readonly value: string;
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
  readonly byEmploymentType: FacetCount[];
  readonly byExperienceLevel: FacetCount[];
}

export function createPool(connectionString: string): Pool {
  return new Pool({ connectionString });
}

export async function migrate(pool: Pool): Promise<void> {
  await pool.query(CREATE_TABLE_SQL);
  await pool.query(ADD_SOURCE_COLUMN_SQL);
  await pool.query(ADD_EMPLOYMENT_TYPE_COLUMN_SQL);
  await pool.query(ADD_EXPERIENCE_LEVEL_COLUMN_SQL);
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
        listing.employmentType,
        listing.experienceLevel,
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
  const employmentType = query.employmentType?.trim() || null;
  const experienceLevel = query.experienceLevel?.trim() || null;
  const postedWithinDays = query.postedWithinDays ?? null;
  const sort: SortMode = query.sort === "scraped" ? "scraped" : "posted";

  const whereParams = [search, source, employmentType, experienceLevel, postedWithinDays];

  const [listingsResult, countResult] = await Promise.all([
    pool.query<JobListingRow>(selectListingsSql(sort), [...whereParams, limit]),
    pool.query<{ total: number }>(COUNT_LISTINGS_SQL, whereParams),
  ]);

  return {
    listings: listingsResult.rows.map(mapRow),
    total: countResult.rows[0]?.total ?? 0,
  };
}

export async function getListingsSummary(pool: Pool): Promise<ListingsSummary> {
  const [summaryResult, bySourceResult, byEmploymentTypeResult, byExperienceLevelResult] = await Promise.all([
    pool.query<{
      total_listings: number;
      total_companies: number;
      last_updated_at: Date | null;
    }>(SUMMARY_SQL),
    pool.query<{ source: string; total: number }>(SUMMARY_BY_SOURCE_SQL),
    pool.query<{ employment_type: string; total: number }>(SUMMARY_BY_EMPLOYMENT_TYPE_SQL),
    pool.query<{ experience_level: string; total: number }>(SUMMARY_BY_EXPERIENCE_LEVEL_SQL),
  ]);

  const row = summaryResult.rows[0];
  return {
    totalListings: row?.total_listings ?? 0,
    totalCompanies: row?.total_companies ?? 0,
    lastUpdatedAt: row?.last_updated_at ? row.last_updated_at.toISOString() : null,
    bySource: bySourceResult.rows.map((r) => ({ source: r.source, total: r.total })),
    byEmploymentType: byEmploymentTypeResult.rows.map((r) => ({ value: r.employment_type, total: r.total })),
    byExperienceLevel: byExperienceLevelResult.rows.map((r) => ({ value: r.experience_level, total: r.total })),
  };
}
