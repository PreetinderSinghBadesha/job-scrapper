const statTotal = document.getElementById("stat-total");
const statCompanies = document.getElementById("stat-companies");
const statUpdated = document.getElementById("stat-updated");
const searchInput = document.getElementById("search");
const freshnessSelect = document.getElementById("freshness-select");
const sortSelect = document.getElementById("sort-select");
const sourceFilters = document.getElementById("source-filters");
const employmentTypeFilters = document.getElementById("employment-type-filters");
const experienceLevelFilters = document.getElementById("experience-level-filters");
const resultCount = document.getElementById("result-count");
const cardGrid = document.getElementById("card-grid");
const emptyState = document.getElementById("empty-state");
const autoScrapeForm = document.getElementById("auto-scrape-form");
const autoScrapeUrlInput = document.getElementById("auto-scrape-url");
const autoScrapeSubmit = document.getElementById("auto-scrape-submit");
const autoScrapeStatus = document.getElementById("auto-scrape-status");
const knownSites = document.getElementById("known-sites");
const knownSitesPills = document.getElementById("known-sites-pills");

const SOURCE_LABELS = {
  wellfound: "Wellfound",
  remoteok: "RemoteOK",
  weworkremotely: "We Work Remotely",
  yc: "Y Combinator",
  auto: "Auto-detected",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

let selectedSource = "";
let selectedEmploymentType = "";
let selectedExperienceLevel = "";

function sourceLabel(sourceId) {
  return SOURCE_LABELS[sourceId] ?? sourceId;
}

function formatDate(isoDate) {
  if (!isoDate) {
    return null;
  }
  return dateFormatter.format(new Date(isoDate));
}

function formatRelativeToNow(isoTimestamp) {
  if (!isoTimestamp) {
    return "—";
  }
  const diffMs = new Date(isoTimestamp).getTime() - Date.now();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  if (Math.abs(diffHours) < 24) {
    return relativeFormatter.format(diffHours, "hour");
  }
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return relativeFormatter.format(diffDays, "day");
}

function buildCard(listing) {
  const card = document.createElement("article");
  card.className = "card";

  const topRow = document.createElement("div");
  topRow.className = "card-top-row";

  const company = document.createElement("p");
  company.className = "card-company";
  company.textContent = listing.company;
  topRow.appendChild(company);

  const sourceBadge = document.createElement("span");
  sourceBadge.className = "source-badge";
  sourceBadge.textContent = sourceLabel(listing.source);
  topRow.appendChild(sourceBadge);

  card.appendChild(topRow);

  const title = document.createElement("h2");
  title.className = "card-title";
  title.textContent = listing.title;
  card.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "card-meta";
  if (listing.location) {
    const locationSpan = document.createElement("span");
    locationSpan.textContent = listing.location;
    meta.appendChild(locationSpan);
  }
  const postedDate = formatDate(listing.postedDate);
  if (postedDate) {
    const dateSpan = document.createElement("span");
    dateSpan.className = "dot";
    dateSpan.textContent = postedDate;
    meta.appendChild(dateSpan);
  }
  if (listing.employmentType) {
    const employmentSpan = document.createElement("span");
    employmentSpan.className = "dot";
    employmentSpan.textContent = listing.employmentType;
    meta.appendChild(employmentSpan);
  }
  if (listing.experienceLevel) {
    const experienceSpan = document.createElement("span");
    experienceSpan.className = "dot";
    experienceSpan.textContent = listing.experienceLevel;
    meta.appendChild(experienceSpan);
  }
  if (meta.childNodes.length > 0) {
    card.appendChild(meta);
  }

  if (listing.techStack.length > 0) {
    const tags = document.createElement("div");
    tags.className = "card-tags";
    for (const tech of listing.techStack) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = tech;
      tags.appendChild(chip);
    }
    card.appendChild(tags);
  }

  const link = document.createElement("a");
  link.className = "card-link";
  link.href = listing.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "View posting";
  card.appendChild(link);

  return card;
}

function renderListings(listings) {
  cardGrid.replaceChildren();
  emptyState.hidden = listings.length > 0;
  for (const listing of listings) {
    cardGrid.appendChild(buildCard(listing));
  }
}

function buildFilterPill(label, count, isActive, onClick) {
  const pill = document.createElement("button");
  pill.type = "button";
  pill.className = "source-pill" + (isActive ? " active" : "");
  pill.textContent = count === null ? label : `${label} (${count.toLocaleString()})`;
  pill.addEventListener("click", onClick);
  return pill;
}

function renderFilterRow(container, allLabel, entries, selectedValue, onSelect, labelFn) {
  container.hidden = entries.length === 0;
  if (entries.length === 0) {
    return;
  }

  container.replaceChildren();
  const totalCount = entries.reduce((sum, entry) => sum + entry.total, 0);
  container.appendChild(
    buildFilterPill(allLabel, totalCount, selectedValue === "", () => onSelect("")),
  );
  for (const entry of entries) {
    const value = entry.source ?? entry.value;
    container.appendChild(
      buildFilterPill(labelFn(entry), entry.total, selectedValue === value, () => onSelect(value)),
    );
  }
}

function renderStats(summary) {
  statTotal.textContent = summary.totalListings.toLocaleString();
  statCompanies.textContent = summary.totalCompanies.toLocaleString();
  statUpdated.textContent = formatRelativeToNow(summary.lastUpdatedAt);

  renderFilterRow(sourceFilters, "All sources", summary.bySource, selectedSource, (value) => {
    selectedSource = value;
    loadListings(searchInput.value.trim());
  }, (entry) => sourceLabel(entry.source));

  renderFilterRow(
    employmentTypeFilters,
    "All types",
    summary.byEmploymentType,
    selectedEmploymentType,
    (value) => {
      selectedEmploymentType = value;
      loadListings(searchInput.value.trim());
    },
    (entry) => entry.value,
  );

  renderFilterRow(
    experienceLevelFilters,
    "All levels",
    summary.byExperienceLevel,
    selectedExperienceLevel,
    (value) => {
      selectedExperienceLevel = value;
      loadListings(searchInput.value.trim());
    },
    (entry) => entry.value,
  );
}

async function loadListings(search) {
  const url = new URL("/api/listings", window.location.origin);
  if (search) {
    url.searchParams.set("search", search);
  }
  if (selectedSource) {
    url.searchParams.set("source", selectedSource);
  }
  if (selectedEmploymentType) {
    url.searchParams.set("employmentType", selectedEmploymentType);
  }
  if (selectedExperienceLevel) {
    url.searchParams.set("experienceLevel", selectedExperienceLevel);
  }
  if (freshnessSelect.value) {
    url.searchParams.set("postedWithinDays", freshnessSelect.value);
  }
  url.searchParams.set("sort", sortSelect.value);

  const response = await fetch(url);
  if (!response.ok) {
    resultCount.textContent = "Failed to load listings.";
    return;
  }

  const data = await response.json();
  renderStats(data.summary);
  renderListings(data.listings);
  resultCount.textContent = `${data.total.toLocaleString()} result${data.total === 1 ? "" : "s"}`;
}

freshnessSelect.addEventListener("change", () => loadListings(searchInput.value.trim()));
sortSelect.addEventListener("change", () => loadListings(searchInput.value.trim()));

let debounceHandle;
searchInput.addEventListener("input", () => {
  clearTimeout(debounceHandle);
  debounceHandle = setTimeout(() => loadListings(searchInput.value.trim()), 250);
});

function setAutoScrapeStatus(text, isError) {
  autoScrapeStatus.textContent = text;
  autoScrapeStatus.classList.toggle("error", Boolean(isError));
}

async function scrapeUrl(targetUrl) {
  const response = await fetch("/api/auto-scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: targetUrl }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Scrape failed.");
  }
  return data;
}

function buildKnownSitePill(site) {
  const pill = document.createElement("button");
  pill.type = "button";
  pill.className = "known-site-pill";
  pill.title = `Re-scrape ${site.hostname} (no LLM call — selectors are already known)`;

  const icon = document.createElement("span");
  icon.className = "known-site-pill-icon";
  icon.textContent = "↻";
  icon.setAttribute("aria-hidden", "true");
  pill.appendChild(icon);
  pill.appendChild(document.createTextNode(site.hostname));

  pill.addEventListener("click", async () => {
    pill.disabled = true;
    setAutoScrapeStatus(`Updating ${site.hostname}…`, false);
    try {
      const data = await scrapeUrl(site.searchUrl);
      setAutoScrapeStatus(
        `${site.hostname}: ${data.scraped} scraped, ${data.upserted} upserted, ${data.skipped} skipped.`,
        false,
      );
      loadListings(searchInput.value.trim());
    } catch (error) {
      setAutoScrapeStatus(error instanceof Error ? error.message : "Update failed.", true);
    } finally {
      pill.disabled = false;
    }
  });

  return pill;
}

async function loadKnownSites() {
  const response = await fetch("/api/auto-sites");
  if (!response.ok) {
    return;
  }
  const data = await response.json();
  const sites = data.sites ?? [];

  knownSites.hidden = sites.length === 0;
  knownSitesPills.replaceChildren();
  for (const site of sites) {
    knownSitesPills.appendChild(buildKnownSitePill(site));
  }
}

autoScrapeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const targetUrl = autoScrapeUrlInput.value.trim();
  if (!targetUrl) {
    return;
  }

  autoScrapeSubmit.disabled = true;
  setAutoScrapeStatus("Scraping… this can take up to a minute the first time a site is seen.", false);

  try {
    const data = await scrapeUrl(targetUrl);
    setAutoScrapeStatus(
      `${data.scraped} scraped, ${data.upserted} upserted, ${data.skipped} skipped.`,
      false,
    );
    autoScrapeUrlInput.value = "";
    loadListings(searchInput.value.trim());
    loadKnownSites();
  } catch (error) {
    setAutoScrapeStatus(error instanceof Error ? error.message : "Scrape failed.", true);
  } finally {
    autoScrapeSubmit.disabled = false;
  }
});

loadListings("");
loadKnownSites();
