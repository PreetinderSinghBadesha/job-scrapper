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

## Employment type & experience level

Each source also extracts, from whatever it genuinely exposes on the listing page, an `employmentType` (`Full-time`/`Part-time`/`Contract`/`Internship`/`Freelance`) and `experienceLevel` (`Entry level`/`Mid level`/`Senior`/`Lead`) — never fabricated, `null` where the site doesn't show one:

| Source | Employment type | Experience level |
|---|---|---|
| Wellfound | Badge next to the title (e.g. "Full-time") | Bucketed from "X years of exp" text, where shown |
| RemoteOK | Classified out of its existing tag list (e.g. a `"senior"` or `"full time"` tag) | Same tag list, e.g. `"junior"` → `Entry level` |
| We Work Remotely | Category pill matching a known type, filtered from promotional badges ("Featured", "Top 100") | Not exposed on the category page |
| Y Combinator | First `job-details` span (`"Fulltime"`/`"Intern"`) | Not exposed on the listing page |
| Auto-detected | LLM-discovered `employmentTypeSelector`/`experienceSelector`, normalized the same way | Same |

Normalization lives in `normalizeEmploymentType`, `normalizeExperienceKeyword`, and `bucketYearsOfExperience` in `src/sources/shared.ts`.

## Filtering & sorting

`GET /api/listings` accepts `employmentType`, `experienceLevel`, `postedWithinDays` (freshness cutoff — never hides a listing with no known `postedDate`, since sources like Y Combinator never expose one), and `sort` (`posted`, the default, or `scraped`). Default sort is `posted_date DESC NULLS LAST, last_seen_at DESC` — a listing's actual posting date decides freshness, not when it was last (re-)scraped, so a job re-scraped today that was posted two years ago no longer jumps to the top. The frontend exposes all of this as pill filters (source/employment type/experience level) plus two `<select>` controls (posted-within, sort).

## Auto-detected source

A fifth, opt-in source (`src/sources/auto.ts`) for job boards nobody has hand-written a `JobSource` for. It doesn't hardcode a single CSS selector — instead it asks an LLM, once, to look at a site's HTML and report back which selector matches the repeated listing cards and which ones (relative to a card) hold the title, company, location, link, date, and tags. From then on, extraction runs exactly like the four hand-written sources: plain Playwright + cheerio against those selectors, no further AI involved.

```
page HTML  --cache miss-->  OpenRouter (free model, JSON output)  --{ cardSelector, titleSelector, ... }-->  .cache/auto-selectors.json
                                                                                          |
                                                                                          v
                                                            page.$$eval(cardSelector) + cheerio, same as every other source
```

- **The LLM is called at most once per site.** `.cache/auto-selectors.json` (gitignored) stores the discovered selectors keyed by hostname; every subsequent run reuses them for free. This is the direct answer to "don't burn tokens on every scrape" — one structured-output call (bounded to ~200K characters of cleaned HTML — form/filter-widget markup like faceted-search checkboxes is stripped first, since it can otherwise bury the real listing markup tens of thousands of characters in; `max_tokens: 2048` for the response) bootstraps unlimited free runs afterward.
- **Self-healing.** If the cached selectors suddenly match zero cards (the site redesigned), it re-discovers once and overwrites the cache rather than failing silently.
- **A discovered `cardSelector` is sanity-checked before being trusted or cached** — it must match at least 2 elements on the live page, or discovery is treated as a failure.
- The frontend's "Previously scraped sites" list (`GET /api/auto-sites`, backed by `listCachedSites()` in `src/sources/auto/selectorCache.ts`) shows every hostname with cached selectors and a search URL, each with an **Update** button that re-scrapes it via the same `POST /api/auto-scrape` route. Since selectors are already known for these, it's a pure cache hit — no LLM call, no `OPENROUTER_API_KEY` needed. (Sites auto-detected before this feature existed have selectors but no stored URL yet — they won't appear in the list until re-added once via "Add a site", which backfills it for good.)
- Enable it with `JOB_SOURCES=auto` (or `JOB_SOURCES=wellfound,auto`, etc.) plus `AUTO_SOURCE_URL` pointed at the search results page you want scraped. It is never included when `JOB_SOURCES` is left unset — the four sources above have no extra config or cost, so they stay the default.
- Needs `OPENROUTER_API_KEY` — but only on an actual cache miss. A repeat run against an already-cached hostname needs no API key at all. Get a free key at [openrouter.ai](https://openrouter.ai/settings/keys).
- Uses `z-ai/glm-5.2:free` by default (a free-tier OpenRouter model with reliable JSON output). Override with `OPENROUTER_MODEL` — pick any model at [openrouter.ai/models?max_price=0](https://openrouter.ai/models?max_price=0) whose `supported_parameters` includes `response_format`. Other free options with that support as of this writing: `openai/gpt-oss-20b:free`, `google/gemma-4-31b-it:free`, `nvidia/nemotron-3-super-120b-a12b:free`.
- Free OpenRouter models are rate-limited and occasionally get delisted/rotated — since discovery only runs on a cache miss, this rarely matters in practice, but if a model starts failing (e.g. a 429 "temporarily rate-limited upstream"), either retry later or switch to a cheap paid model tied to your own account (no shared pool): `OPENROUTER_MODEL=openai/gpt-oss-120b` costs about $0.0002 per new hostname discovered (~$0.03/M input, $0.17/M output tokens).
- `postedDate` is only populated when the discovered date text already looks like an ISO date (`YYYY-MM-DD...`); arbitrary relative-date formats ("3d ago", "posted last week") aren't guessed at, to avoid silently fabricating wrong dates for a site the code has never seen.
- Only point this at sites you have the right to scrape — there's no site-specific judgment happening here the way there was when a person (or in this case, me) manually inspected Wellfound/RemoteOK/WWR/YC's terms and structure before writing their selectors by hand.
- Pagination beyond page 1 (up to `JOB_SEARCH_PAGES`, capped at 5) is a guess: it sets a `page` query parameter, the scheme Wellfound itself uses. Sites using a different pagination mechanism (cursor tokens, infinite scroll, a different param name) will just see the same page 1 content again on every "page" — harmless (the `url` UNIQUE constraint upserts them as no-ops) but not additional coverage.

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

Unit tests cover the pure parsing functions only: `parseCard` for each hand-written source (`src/sources/__tests__/`) — missing-company, missing-title, missing-location/date, and per-site date-format edge cases — plus the shared date/URL utilities, the generic transformer dispatch logic, and the auto-detected source's pure pieces (`src/sources/auto/__tests__/`: HTML cleanup, selector-response validation, the selector file cache, and its selector-driven parsing core). None of these hit the network or a real LLM — `createOpenRouterSelectorDiscoveryClient` itself (the part that actually calls the OpenRouter API) isn't unit tested, the same way `extractJobCards`'s real `chromium.launch` isn't; only the deterministic logic around it is.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string (Neon/Supabase-compatible) |
| `JOB_SOURCES` | no | Comma-separated source ids to run (`wellfound,remoteok,weworkremotely,yc,auto`); defaults to the first four |
| `JOB_SEARCH_URL` | no | Overrides the search URL — only applied when `JOB_SOURCES` resolves to exactly one source |
| `JOB_SEARCH_PAGES` | no | Requested page count, clamped per-source (Wellfound: 3-5; RemoteOK/WWR/YC: always 1; `auto`: 1-5, via a guessed `?page=` param) |
| `AUTO_SOURCE_URL` | only for `auto` | Search results URL for the auto-detected source |
| `OPENROUTER_API_KEY` | only for `auto`, on a cache miss | Used once per new hostname to discover selectors; not needed on cache hits |
| `OPENROUTER_MODEL` | no | OpenRouter model id for selector discovery; defaults to `z-ai/glm-5.2:free` |
| `PORT` | no | Port for the frontend server (default 3000) |

## GitHub Actions

`.github/workflows/scraper.yml` runs daily at 06:00 UTC and can also be triggered manually via `workflow_dispatch`. It builds the Docker image and runs it with `DATABASE_URL` injected from a repository secret — add one named `DATABASE_URL` under repo Settings → Secrets and variables → Actions.

## Design decisions

**Upsert instead of insert.** The scraper runs daily against sources that repost and update the same listings. A plain insert would either duplicate rows on every run or require a separate delete-and-reinsert pass that throws away history. `url` is the natural unique key for a job posting — and stays unique across sources, since each site's URLs live on a different domain — so `INSERT ... ON CONFLICT (url) DO UPDATE` keeps one row per listing, refreshes `last_seen_at`, and lets the table double as a lightweight signal for "is this posting still live" over time.

**Playwright instead of a lighter HTTP client.** Wellfound's search results are rendered client-side — a plain `fetch` + HTML parse would see an empty shell, not the listings. Playwright drives a real browser, waits for the listing DOM to actually render, and only then hands off HTML for parsing. RemoteOK and We Work Remotely turned out to be closer to static HTML, but using the same Playwright-driven interface for every source means adding a new site never requires picking a different fetching strategy — the `JobSource` contract also caught a real bug here: RemoteOK renders skeleton placeholder rows (`tr.job.placeholder`) before its data loads via AJAX, so `waitForListings` has to wait for `tr.job[data-url]` specifically, not just `tr.job` — a plain HTTP fetch of the initial HTML would have silently returned only placeholders.

**One module per site instead of one script per site, or a single monolithic scraper.** Extraction, parsing, and persistence fail for completely different reasons — a selector changes, a field is missing, a database connection drops — and conflating them into one script per site means every failure mode has to be debugged against the same tangle of concerns, and shared logic (retries, rate limiting, upsert semantics) gets duplicated per site. Instead, `extractor.ts`, `transformer.ts`, and `loader.ts` stay generic and are written once; each site only supplies a `JobSource` — pure, DOM-shaped configuration and parsing functions with no browser or network code of their own, which is what makes them trivially unit-testable. Adding a fourth site is additive: one new file, one line in `src/sources/index.ts`, zero changes to the pipeline stages.

**LLM discovers selectors once; a plain algorithm does the actual scraping.** The obvious way to make an LLM "figure out the page" is to ask it to extract every listing directly — but that means a paid API call on every single run, for every single page, forever. Instead, the LLM's only job is to name CSS selectors once per site; those get cached to disk and reused by ordinary `page.$$eval` + cheerio parsing on every run after that, identical in shape to the four hand-written sources. This is also why it's a separate opt-in fifth source rather than a replacement for the existing four: Wellfound/RemoteOK/WWR/YC's selectors are already known-good and free to run, so there's nothing for the LLM to figure out there.

## Known limitations

- Wellfound's search UI does not expose a single URL that composes "remote" + role + India location into one filterable query string; the pipeline scrapes the dedicated `/role/l/software-engineer/india` listing page, which is location-filtered but includes some on-site roles alongside remote ones.
- RemoteOK, We Work Remotely, and Y Combinator don't paginate their listing pages via a URL parameter the way Wellfound does — each run scrapes whatever single batch of listings (~50, ~120, and ~60 respectively) the page renders.
- `techStack` is only meaningfully populated for RemoteOK (real tags) and Y Combinator (one role-category tag, e.g. "Full stack" — a coarser signal than a true skills list). Wellfound and We Work Remotely don't expose tech tags on their search/category pages at all, so it's `[]` for those two.
- `postedDate` is `null` for every Y Combinator listing — the public job board doesn't surface a posting date on the listing card.
- Selectors are matched against each site's current markup and have no stable `data-test`-style anchors on most of them — they'll need maintenance if a site's DOM changes.
- The auto-detected source's cache is per-hostname, not per-page-layout — if one site serves meaningfully different card markup on different pages (e.g. a category page vs. a search-results page) under the same hostname, the cached selectors from whichever page was seen first may not fit the other.
- Auto-detected date parsing only recognizes already-ISO-formatted text; it doesn't attempt to interpret relative or locale-specific date formats, so `postedDate` is frequently `null` for sites with non-ISO dates.
