import {
  type FeaturedCreator,
  getFeaturedCreators,
} from '@/lib/featured-creators';
import { SeeItInActionCarousel } from './SeeItInActionCarousel';

const FALLBACK_HANDLES = [
  'billie-eilish',
  'dua-lipa',
  'taylor-swift',
  'the-1975',
  'ed-sheeran',
  'lady-gaga',
  'john-mayer',
  'coldplay',
  'maneskin',
  'placeholder',
] as const;

const FALLBACK_AVATARS: FeaturedCreator[] = FALLBACK_HANDLES.map(
  (handle, i) => ({
    id: `fallback-${i + 1}`,
    handle,
    name: 'Artist',
    src: `/images/avatars/${handle}.jpg`,
  })
);

const MIN_CREATORS = 10;

/**
 * Server component that fetches featured creators from the database.
 * Falls back to example avatars when fewer than MIN_CREATORS are available.
 * Data is cached for 1 week via unstable_cache in getFeaturedCreators.
 */
export async function SeeItInAction() {
  // Fetch from DB (cached 1 week via unstable_cache)
  const dbCreators = await getFeaturedCreators();

  // Fill gaps with fallbacks if fewer than minimum
  let creators: FeaturedCreator[] = dbCreators;
  if (dbCreators.length < MIN_CREATORS) {
    const needed = MIN_CREATORS - dbCreators.length;
    const usedIds = new Set(dbCreators.map(c => c.id));
    const fallbacks = FALLBACK_AVATARS.filter(f => !usedIds.has(f.id)).slice(
      0,
      needed
    );
    creators = [...dbCreators, ...fallbacks];
  }

  return <SeeItInActionCarousel creators={creators} />;
}
