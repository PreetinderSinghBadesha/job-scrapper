const NOISY_TAG_PATTERN = /<(script|style|svg|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi;
// Faceted-search filter widgets (country/category checkbox lists etc.) can dwarf the
// actual listing markup — e.g. one real site buries its job cards past 250K characters
// behind a full list of every country as <input>/<label> pairs. None of these elements
// carry job-listing content, so they're safe to drop before truncating.
const FORM_WIDGET_TAG_PATTERN = /<(select|option|label)\b[^>]*>[\s\S]*?<\/\1>/gi;
const INPUT_TAG_PATTERN = /<input\b[^>]*\/?>/gi;
const COMMENT_PATTERN = /<!--[\s\S]*?-->/g;
const WHITESPACE_PATTERN = /\s+/g;

export function simplifyHtmlForPrompt(html: string, maxChars: number): string {
  const withoutNoise = html
    .replace(NOISY_TAG_PATTERN, "")
    .replace(FORM_WIDGET_TAG_PATTERN, "")
    .replace(INPUT_TAG_PATTERN, "")
    .replace(COMMENT_PATTERN, "");
  const collapsed = withoutNoise.replace(WHITESPACE_PATTERN, " ").trim();
  return collapsed.length > maxChars ? collapsed.slice(0, maxChars) : collapsed;
}
