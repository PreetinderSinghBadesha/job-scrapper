const statTotal = document.getElementById("stat-total");
const statCompanies = document.getElementById("stat-companies");
const statUpdated = document.getElementById("stat-updated");
const searchInput = document.getElementById("search");
const sourceFilters = document.getElementById("source-filters");
const resultCount = document.getElementById("result-count");
const cardGrid = document.getElementById("card-grid");
const emptyState = document.getElementById("empty-state");

const SOURCE_LABELS = {
  wellfound: "Wellfound",
  remoteok: "RemoteOK",
  weworkremotely: "We Work Remotely",
  yc: "Y Combinator",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

let selectedSource = "";

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

function buildSourcePill(label, count, value, isActive) {
  const pill = document.createElement("button");
  pill.type = "button";
  pill.className = "source-pill" + (isActive ? " active" : "");
  pill.textContent = count === null ? label : `${label} (${count.toLocaleString()})`;
  pill.addEventListener("click", () => {
    selectedSource = value;
    loadListings(searchInput.value.trim());
  });
  return pill;
}

function renderSourceFilters(bySource) {
  sourceFilters.replaceChildren();

  const totalCount = bySource.reduce((sum, entry) => sum + entry.total, 0);
  sourceFilters.appendChild(buildSourcePill("All sources", totalCount, "", selectedSource === ""));

  for (const entry of bySource) {
    sourceFilters.appendChild(
      buildSourcePill(sourceLabel(entry.source), entry.total, entry.source, selectedSource === entry.source),
    );
  }
}

function renderStats(summary) {
  statTotal.textContent = summary.totalListings.toLocaleString();
  statCompanies.textContent = summary.totalCompanies.toLocaleString();
  statUpdated.textContent = formatRelativeToNow(summary.lastUpdatedAt);
  renderSourceFilters(summary.bySource);
}

async function loadListings(search) {
  const url = new URL("/api/listings", window.location.origin);
  if (search) {
    url.searchParams.set("search", search);
  }
  if (selectedSource) {
    url.searchParams.set("source", selectedSource);
  }

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

let debounceHandle;
searchInput.addEventListener("input", () => {
  clearTimeout(debounceHandle);
  debounceHandle = setTimeout(() => loadListings(searchInput.value.trim()), 250);
});

loadListings("");
