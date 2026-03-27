import { unstable_cache } from 'next/cache';
import type { FeaturedCreator } from '@/lib/featured-creators';
import { getFeaturedCreators } from '@/lib/featured-creators';

/**
 * Static fallback when no featured creators are in the DB.
 * Uses Tim White — the canonical demo artist.
 */
const TIM_WHITE_FALLBACK: FeaturedCreator = {
  id: 'demo-tim-white',
  handle: 'timwhite',
  name: 'Tim White',
  src: '/images/avatars/tim-white.jpg',
  tagline: 'Artist',
  genres: ['Electronic', 'Dance'],
  latestReleaseTitle: 'Midnight Drive',
  latestReleaseType: 'single',
};

/**
 * Get the primary demo creator for the /demo route and homepage mockups.
 *
 * Pulls from the DB's featured creators (cached 24h via getFeaturedCreators).
 * Falls back to Tim White if the DB returns nothing.
 *
 * Usage (server component):
 *   const creator = await getDemoCreator();
 *   return <DemoShell creator={creator} />;
 */
async function queryDemoCreator(): Promise<FeaturedCreator> {
  const featured = await getFeaturedCreators();

  if (featured.length === 0) {
    return TIM_WHITE_FALLBACK;
  }

  // Pick the first featured creator (already shuffled weekly by getFeaturedCreators)
  return featured[0];
}

export const getDemoCreator = unstable_cache(
  queryDemoCreator,
  ['demo-creator'],
  {
    revalidate: 60 * 60, // 1 hour — pulls from the already-cached getFeaturedCreators
    tags: ['featured-creators'],
  }
);

/**
 * Get all featured creators for use in homepage sections
 * (carousel, example profiles, etc.)
 *
 * Re-exports getFeaturedCreators with the same cache.
 */
export { getFeaturedCreators as getDemoCreators } from '@/lib/featured-creators';

export { TIM_WHITE_FALLBACK };
