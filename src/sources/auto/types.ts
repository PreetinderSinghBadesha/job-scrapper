export interface DiscoveredSelectors {
  readonly cardSelector: string;
  readonly titleSelector: string | null;
  readonly companySelector: string | null;
  readonly locationSelector: string | null;
  readonly urlSelector: string | null;
  readonly dateSelector: string | null;
  readonly tagsSelector: string | null;
  readonly employmentTypeSelector: string | null;
  readonly experienceSelector: string | null;
}

export interface CachedSite {
  readonly searchUrl: string;
  readonly selectors: DiscoveredSelectors;
}
