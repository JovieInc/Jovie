import { db } from '@/lib/db';
import { discoveryKeywords } from '@/lib/db/schema/leads';
import { buildToolSearchQueries } from './search-evidence';

/**
 * Feature.fm-focused seed keywords for lead discovery.
 *
 * These target Linktree profiles that contain Feature.fm smart links,
 * indicating artists already paying for music marketing tools.
 *
 * Feature.fm domains:
 * - feature.fm — main domain
 * - ffm.to — short link domain
 * - ffm.bio — bio link domain
 */
export const FEATURE_FM_SEED_KEYWORDS = [
  'site:linktr.ee "ffm.to"',
  'site:linktr.ee "ffm.bio"',
  'site:linktr.ee "feature.fm"',
  'site:linktr.ee "ffm.to" spotify',
  'site:linktr.ee "ffm.to" music',
  'site:linktr.ee "ffm.bio" spotify',
  'site:linktr.ee "feature.fm" spotify',
  'site:linktr.ee "feature.fm" artist',
] as const;

/**
 * One query per paid tool or budget footprint the buyer pre-screen scores,
 * against Linktree and Beacons, e.g. `site:beacons.ai "laylo.com"`. A hit is
 * search evidence that the page links that tool; the page is never read.
 */
export const TOOL_SEARCH_SEED_KEYWORDS: readonly string[] =
  buildToolSearchQueries();

export const DISCOVERY_SEED_KEYWORDS: readonly string[] = [
  ...new Set([...FEATURE_FM_SEED_KEYWORDS, ...TOOL_SEARCH_SEED_KEYWORDS]),
];

/**
 * Inserts the Feature.fm and tool-search seed keywords into
 * discovery_keywords. onConflictDoNothing keeps it safe to call repeatedly
 * and never re-enables a keyword an admin turned off. Discovery rotates
 * through enabled keywords within the same per-run query cap, so seeding more
 * keywords never adds searches to a run.
 */
export async function seedDiscoveryKeywords() {
  const inserted = await db
    .insert(discoveryKeywords)
    .values(DISCOVERY_SEED_KEYWORDS.map(query => ({ query })))
    .onConflictDoNothing({ target: discoveryKeywords.query })
    .returning();

  return {
    inserted: inserted.length,
    total: DISCOVERY_SEED_KEYWORDS.length,
    skipped: DISCOVERY_SEED_KEYWORDS.length - inserted.length,
  };
}
