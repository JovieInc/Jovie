import type { FeaturedCreator } from '@/lib/featured-creators';

const FALLBACK_CREATOR_DATA = [
  {
    handle: 'billie-eilish',
    name: 'Billie Eilish',
    tagline: 'HIT ME HARD AND SOFT',
  },
  { handle: 'dua-lipa', name: 'Dua Lipa', tagline: 'Radical Optimism' },
  { handle: 'taylor-swift', name: 'Taylor Swift', tagline: 'The Eras Tour' },
  {
    handle: 'the-1975',
    name: 'The 1975',
    tagline: 'Being Funny in a Foreign Language',
  },
  { handle: 'ed-sheeran', name: 'Ed Sheeran', tagline: 'Autumn Variations' },
  { handle: 'lady-gaga', name: 'Lady Gaga', tagline: 'Mayhem' },
  { handle: 'john-mayer', name: 'John Mayer', tagline: 'Sob Rock' },
  { handle: 'coldplay', name: 'Coldplay', tagline: 'Moon Music' },
  { handle: 'maneskin', name: 'Maneskin', tagline: 'RUSH!' },
] as const;

export const FALLBACK_HANDLES = FALLBACK_CREATOR_DATA.map(c => c.handle);

export const FALLBACK_AVATARS: FeaturedCreator[] = FALLBACK_CREATOR_DATA.map(
  (creator, i) => ({
    id: `fallback-${i + 1}`,
    handle: creator.handle,
    name: creator.name,
    src: `/images/avatars/${creator.handle}.jpg`,
    tagline: creator.tagline,
    genres: [],
    latestReleaseTitle: null,
    latestReleaseType: null,
  })
);

export const MIN_CREATORS = 9;

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
