export interface RawJobCardBlob {
  readonly html: string;
  readonly source: string;
  readonly pageNumber: number;
  readonly pageUrl: string;
}

export interface JobListing {
  readonly source: string;
  readonly company: string;
  readonly title: string;
  readonly location: string;
  readonly techStack: string[];
  readonly postedDate: string | null;
  readonly url: string;
}

export interface TransformResult {
  readonly listings: JobListing[];
  readonly skippedCount: number;
}

export interface StoredJobListing extends JobListing {
  readonly id: number;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
}

export interface SourceRunSummary {
  readonly source: string;
  readonly scraped: number;
  readonly skipped: number;
}

export interface RunSummary {
  readonly scraped: number;
  readonly upserted: number;
  readonly skipped: number;
  readonly bySource: SourceRunSummary[];
}
