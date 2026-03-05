import { db } from '@/lib/db';
import { discoveryKeywords } from '@/lib/db/schema/leads';

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
 * Inserts Feature.fm seed keywords into the discovery_keywords table.
 * Uses onConflictDoNothing so it's safe to call multiple times.
 */
export async function seedFeatureFmKeywords() {
  const inserted = await db
    .insert(discoveryKeywords)
    .values(FEATURE_FM_SEED_KEYWORDS.map(query => ({ query })))
    .onConflictDoNothing({ target: discoveryKeywords.query })
    .returning();

  return {
    inserted: inserted.length,
    total: FEATURE_FM_SEED_KEYWORDS.length,
    skipped: FEATURE_FM_SEED_KEYWORDS.length - inserted.length,
  };
}
