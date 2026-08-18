# Job Listings ETL

A small, production-shaped ETL pipeline that scrapes software engineering job listings from multiple job boards, normalizes them into a typed schema, and upserts them into Postgres on a daily schedule. It's a miniature version of the extract-transform-load pattern that powers large-scale data intelligence platforms like MixRank: point a headless browser at JS-rendered sources, turn messy per-site HTML into structured, typed records through a common interface, and land them idempotently in a database that downstream systems can query — all as independently testable, pluggable stages instead of one script.

## Sources

Each source is a self-contained module implementing a common `JobSource` interface (`src/sources/types.ts`) — adding a new site means adding one file to `src/sources/`, not touching the extractor, transformer, or orchestrator.

| Source | `src/sources/*.ts` | Search target | Pagination | Tech stack |
|---|---|---|---|---|
| [Wellfound](https://wellfound.com) | `wellfound.ts` | `role/l/software-engineer/india` | 3-5 pages, URL `?page=` | Not exposed on search results (`[]`) |
| [RemoteOK](https://remoteok.com) | `remoteok.ts` | `remote-dev-jobs` | Single batch, no URL pagination | Real tags, e.g. `["Python", "React"]` |
| [We Work Remotely](https://weworkremotely.com) | `wwr.ts` | `categories/remote-programming-jobs` | Single batch, no URL pagination | Not exposed on the category page (`[]`) |
| [Y Combinator](https://www.workatastartup.com) | `yc.ts` | `workatastartup.com/jobs` (defaults to Software Engineer roles) | Single batch, no URL pagination | One role-category tag, e.g. `["Full stack"]` |

Wellfound is India-filtered specifically; the other three are globally-remote (or hybrid) software engineering roles — none of them supports composing a remote + role + India URL filter the way Wellfound's dedicated location page does. Y Combinator's board is publicly browsable without an account; only clicking "Apply" requires login, which the pipeline never does.

## Architecture

```mermaid
flowchart LR
    GHA["GitHub Actions\n(daily cron + workflow_dispatch)"] -->|docker run| Container

    subgraph Container["Docker container"]
        direction TB
        S["sources/*.ts\none JobSource per site"]
        E["extractor.ts\ngeneric Playwright driver"] -->|"RawJobCardBlob[]\n(raw HTML, tagged by source)"| T["transformer.ts\ngeneric dispatcher"]
        T -->|"JobListing[]\n+ skip count"| L["loader.ts\npg upsert"]
        S -.->|"buildPageUrl / waitForListings\nextractCardHtmls / parseCard"| E
        S -.->|parseCard| T
    end

    L -->|"ON CONFLICT (url)\nDO UPDATE"| PG[(Postgres\njob_listings)]
```

```
sources/{wellfound,remoteok,wwr,yc}.ts  -->  extractor.ts  --raw HTML blobs-->  transformer.ts  --typed JobListing[]-->  loader.ts  --upsert-->  Postgres
   (per-site selectors + parsing)             (generic Playwright driver,           (generic dispatch to               (migration, ON CONFLICT
                                                retries, rate limiting)               source.parseCard)                  DO UPDATE)
                                                       ^
                                                       |
                                       orchestrated by index.ts, looping over resolved sources
```

`extractor.ts` and `transformer.ts` know nothing about Wellfound, RemoteOK, or We Work Remotely specifically — they only know the `JobSource` interface. All site-specific knowledge (selectors, pagination shape, date formats, field extraction) lives inside each `src/sources/*.ts` file.

A separate `server.ts` + `public/` frontend reads from the same `job_listings` table through `loader.ts` to display what the pipeline collected. It isn't part of the cron path — it's a viewer, not a stage of the ETL.

## Frontend

A minimal read-only viewer over the scraped data: search box, per-source filter pills, summary stats (total listings, companies, last updated), and a card grid — no framework, no build step, styled after Claude's own visual language (warm paper background, serif headings, rust-orange accent).

```bash
npm run serve       # dev, via tsx
# or, after `npm run build`:
npm run serve:dist  # runs the compiled server
```

Then open `http://localhost:3000` (override with `PORT`). `GET /api/listings?search=<term>&source=<id>` serves the same data as JSON.

## Setup

### Local

```bash
npm install
npx playwright install --with-deps chromium
cp .env.example .env   # fill in DATABASE_URL
npm run build
npm start
```

Or for iteration without a build step:

```bash
npm run dev
```

### Docker

```bash
docker build -t job-scrapper .
docker run --rm -e DATABASE_URL="postgres://user:password@host:5432/dbname" job-scrapper
```

### Tests

```bash
npm test
```

Unit tests cover the pure parsing functions only: `parseCard` for each source (`src/sources/__tests__/`) — missing-company, missing-title, missing-location/date, and per-site date-format edge cases — plus the shared date/URL utilities and the generic transformer dispatch logic.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string (Neon/Supabase-compatible) |
| `JOB_SOURCES` | no | Comma-separated source ids to run (`wellfound,remoteok,weworkremotely,yc`); defaults to all |
| `JOB_SEARCH_URL` | no | Overrides the search URL — only applied when `JOB_SOURCES` resolves to exactly one source |
| `JOB_SEARCH_PAGES` | no | Requested page count, clamped per-source (Wellfound: 3-5; the other three: always 1) |
| `PORT` | no | Port for the frontend server (default 3000) |

## GitHub Actions

`.github/workflows/scraper.yml` runs daily at 06:00 UTC and can also be triggered manually via `workflow_dispatch`. It builds the Docker image and runs it with `DATABASE_URL` injected from a repository secret — add one named `DATABASE_URL` under repo Settings → Secrets and variables → Actions.

## Design decisions

**Upsert instead of insert.** The scraper runs daily against sources that repost and update the same listings. A plain insert would either duplicate rows on every run or require a separate delete-and-reinsert pass that throws away history. `url` is the natural unique key for a job posting — and stays unique across sources, since each site's URLs live on a different domain — so `INSERT ... ON CONFLICT (url) DO UPDATE` keeps one row per listing, refreshes `last_seen_at`, and lets the table double as a lightweight signal for "is this posting still live" over time.

**Playwright instead of a lighter HTTP client.** Wellfound's search results are rendered client-side — a plain `fetch` + HTML parse would see an empty shell, not the listings. Playwright drives a real browser, waits for the listing DOM to actually render, and only then hands off HTML for parsing. RemoteOK and We Work Remotely turned out to be closer to static HTML, but using the same Playwright-driven interface for every source means adding a new site never requires picking a different fetching strategy — the `JobSource` contract also caught a real bug here: RemoteOK renders skeleton placeholder rows (`tr.job.placeholder`) before its data loads via AJAX, so `waitForListings` has to wait for `tr.job[data-url]` specifically, not just `tr.job` — a plain HTTP fetch of the initial HTML would have silently returned only placeholders.

**One module per site instead of one script per site, or a single monolithic scraper.** Extraction, parsing, and persistence fail for completely different reasons — a selector changes, a field is missing, a database connection drops — and conflating them into one script per site means every failure mode has to be debugged against the same tangle of concerns, and shared logic (retries, rate limiting, upsert semantics) gets duplicated per site. Instead, `extractor.ts`, `transformer.ts`, and `loader.ts` stay generic and are written once; each site only supplies a `JobSource` — pure, DOM-shaped configuration and parsing functions with no browser or network code of their own, which is what makes them trivially unit-testable. Adding a fourth site is additive: one new file, one line in `src/sources/index.ts`, zero changes to the pipeline stages.

## Known limitations

- Wellfound's search UI does not expose a single URL that composes "remote" + role + India location into one filterable query string; the pipeline scrapes the dedicated `/role/l/software-engineer/india` listing page, which is location-filtered but includes some on-site roles alongside remote ones.
- RemoteOK, We Work Remotely, and Y Combinator don't paginate their listing pages via a URL parameter the way Wellfound does — each run scrapes whatever single batch of listings (~50, ~120, and ~60 respectively) the page renders.
- `techStack` is only meaningfully populated for RemoteOK (real tags) and Y Combinator (one role-category tag, e.g. "Full stack" — a coarser signal than a true skills list). Wellfound and We Work Remotely don't expose tech tags on their search/category pages at all, so it's `[]` for those two.
- `postedDate` is `null` for every Y Combinator listing — the public job board doesn't surface a posting date on the listing card.
- Selectors are matched against each site's current markup and have no stable `data-test`-style anchors on most of them — they'll need maintenance if a site's DOM changes.
