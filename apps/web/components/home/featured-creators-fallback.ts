import type { FeaturedCreator } from '@/lib/featured-creators';

export const FALLBACK_HANDLES = [
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

export const FALLBACK_AVATARS: FeaturedCreator[] = FALLBACK_HANDLES.map(
  (handle, i) => ({
    id: `fallback-${i + 1}`,
    handle,
    name: 'Artist',
    src: `/images/avatars/${handle}.jpg`,
  })
);

export const MIN_CREATORS = 10;

/**
 * Fill gaps with fallback avatars if fewer than minimum creators available.
 */
export function fillWithFallbacks(
  dbCreators: FeaturedCreator[]
): FeaturedCreator[] {
  if (dbCreators.length >= MIN_CREATORS) {
    return dbCreators;
  }

  const needed = MIN_CREATORS - dbCreators.length;
  const usedIds = new Set(dbCreators.map(c => c.id));
  const fallbacks = FALLBACK_AVATARS.filter(f => !usedIds.has(f.id)).slice(
    0,
    needed
  );
  return [...dbCreators, ...fallbacks];
}
