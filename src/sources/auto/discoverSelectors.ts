import type { DiscoveredSelectors } from "./types.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "z-ai/glm-5.2:free";
const MAX_OUTPUT_TOKENS = 2048;

const PROMPT_PREFIX =
  "This is simplified HTML from a job listings search page. Identify CSS selectors that describe " +
  "the repeated job card container, plus selectors relative to a card for its title, company, " +
  "location, detail-page link, posted date, tag chips, employment type, and experience level.\n\n" +
  "Respond with ONLY a JSON object (no markdown fences, no commentary) with exactly these keys:\n" +
  '- "cardSelector": string. A CSS selector matching every individual job listing container on the page. ' +
  "It must match more than one element. Required.\n" +
  '- "titleSelector": string or null. CSS selector, relative to a card, for the job title text.\n' +
  '- "companySelector": string or null. CSS selector, relative to a card, for the company/employer name.\n' +
  '- "locationSelector": string or null. CSS selector, relative to a card, for the job location text.\n' +
  '- "urlSelector": string or null. CSS selector, relative to a card, for the anchor element whose href ' +
  "points to that job's own detail page.\n" +
  '- "dateSelector": string or null. CSS selector, relative to a card, for posted-date text.\n' +
  '- "tagsSelector": string or null. CSS selector, relative to a card, matching each tag/skill chip ' +
  "element (may match multiple per card).\n" +
  '- "employmentTypeSelector": string or null. CSS selector, relative to a card, for text naming the ' +
  'employment type (e.g. "Full-time", "Part-time", "Contract", "Internship"), if shown.\n' +
  '- "experienceSelector": string or null. CSS selector, relative to a card, for text naming the required ' +
  'experience or seniority (e.g. "3+ years", "Senior"), if shown.\n\n' +
  "Use null (not an empty string) for any field not present on the page.\n\nHTML:\n";

export interface SelectorDiscoveryClient {
  discover(html: string): Promise<DiscoveredSelectors>;
}

function readNullableString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`Expected "${field}" to be a string or null`);
  }
  return value.trim() === "" ? null : value;
}

export function validateSelectors(input: unknown): DiscoveredSelectors {
  if (typeof input !== "object" || input === null) {
    throw new Error("Selector discovery response was not an object");
  }

  const record = input as Record<string, unknown>;
  const cardSelector = record["cardSelector"];
  if (typeof cardSelector !== "string" || cardSelector.trim() === "") {
    throw new Error('Selector discovery response is missing a valid "cardSelector"');
  }

  return {
    cardSelector,
    titleSelector: readNullableString(record["titleSelector"], "titleSelector"),
    companySelector: readNullableString(record["companySelector"], "companySelector"),
    locationSelector: readNullableString(record["locationSelector"], "locationSelector"),
    urlSelector: readNullableString(record["urlSelector"], "urlSelector"),
    dateSelector: readNullableString(record["dateSelector"], "dateSelector"),
    tagsSelector: readNullableString(record["tagsSelector"], "tagsSelector"),
    employmentTypeSelector: readNullableString(record["employmentTypeSelector"], "employmentTypeSelector"),
    experienceSelector: readNullableString(record["experienceSelector"], "experienceSelector"),
  };
}

function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Selector discovery response did not contain a JSON object: ${text.slice(0, 200)}`);
  }
  return candidate.slice(start, end + 1);
}

export function createOpenRouterSelectorDiscoveryClient(
  apiKey: string,
  model: string = DEFAULT_MODEL,
): SelectorDiscoveryClient {
  return {
    async discover(html: string): Promise<DiscoveredSelectors> {
      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: PROMPT_PREFIX + html }],
          max_tokens: MAX_OUTPUT_TOKENS,
          temperature: 0,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`OpenRouter request failed (${response.status}): ${body.slice(0, 300)}`);
      }

      const payload = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = payload.choices?.[0]?.message?.content;
      if (text === undefined || text.trim() === "") {
        throw new Error("Selector discovery response did not include any text output");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(extractJsonObject(text));
      } catch {
        throw new Error(`Selector discovery response was not valid JSON: ${text.slice(0, 200)}`);
      }

      return validateSelectors(parsed);
    },
  };
}
