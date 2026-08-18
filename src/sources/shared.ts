export const DAY_MS = 24 * 60 * 60 * 1000;

export function resolveUrl(href: string | undefined, origin: string): string | null {
  if (!href) {
    return null;
  }
  try {
    return new URL(href, origin).toString();
  } catch {
    return null;
  }
}

function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Parses phrases like "today", "yesterday", "3 days ago", "2 weeks ago".
 */
export function parseWordyRelativeDate(raw: string, referenceDate: Date = new Date()): string | null {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "") {
    return null;
  }

  let daysAgo: number | null = null;
  if (normalized === "today") {
    daysAgo = 0;
  } else if (normalized === "yesterday") {
    daysAgo = 1;
  } else {
    const match = /^(\d+)\s+(day|week|month|year)s?\s+ago$/.exec(normalized);
    if (match) {
      const amount = Number(match[1]);
      const unit = match[2];
      const unitToDays: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };
      daysAgo = amount * (unitToDays[unit as string] ?? 0);
    }
  }

  if (daysAgo === null) {
    return null;
  }
  return toDateOnlyString(new Date(referenceDate.getTime() - daysAgo * DAY_MS));
}

/**
 * Parses short-form phrases like "1d", "3w", "2mo", "5h".
 */
export function parseShortRelativeDate(raw: string, referenceDate: Date = new Date()): string | null {
  const normalized = raw.trim().toLowerCase();
  const match = /^(\d+)\s*(h|d|w|mo|y)$/.exec(normalized);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const unitToDays: Record<string, number> = { h: 0, d: 1, w: 7, mo: 30, y: 365 };
  const daysAgo = amount * (unitToDays[unit as string] ?? 0);
  return toDateOnlyString(new Date(referenceDate.getTime() - daysAgo * DAY_MS));
}
