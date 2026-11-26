import { SEARCH_QUERY_COST_USD } from './constants';

/**
 * JOV-12539 sample Tim approved on 2026-11-14. This is the only size that
 * may be turned on without asking again. SerpAPI list price is
 * SEARCH_QUERY_COST_USD.serpapi, so 100 searches cost at most $1.50 a day.
 * Send columns stay out of this patch. Outreach remains closed by the
 * Instantly flag and the audience-delivery denial.
 */
export const SAMPLE_LEAD_DISCOVERY_PATCH = {
  enabled: true,
  discoveryEnabled: true,
  dailyQueryBudget: 100,
  autoIngestEnabled: false,
} as const;

export const SAMPLE_LEAD_DISCOVERY_COLUMNS = [
  'enabled',
  'discovery_enabled',
  'daily_query_budget',
  'auto_ingest_enabled',
] as const;

/** Seed only when no keyword is enabled. Never re-enable one an admin turned off. */
export function shouldSeedDiscoveryKeywords(enabledCount: number): boolean {
  return enabledCount === 0;
}

const MUSIC_ARTIST_QUERY =
  /music|artist|spotify|feature\.fm|ffm\.|rapper|singer|songwriter|\bdj\b/i;

export function hasEnabledMusicArtistQuery(
  keywords: readonly { readonly query: string; readonly enabled: boolean }[]
): boolean {
  return keywords.some(
    keyword => keyword.enabled && MUSIC_ARTIST_QUERY.test(keyword.query)
  );
}

/** List-price ceiling for the approved daily search budget. No billing logic. */
export function sampleLeadDiscoveryDailyCeilingUsd(
  budget: number = SAMPLE_LEAD_DISCOVERY_PATCH.dailyQueryBudget
): number {
  return budget * SEARCH_QUERY_COST_USD.serpapi;
}
