import type { FeaturedCreator } from '@/lib/featured-creators';

const FALLBACK_CREATOR_DATA = [
  { handle: 'tim-white', name: 'Tim White', tagline: 'Afterglow (Deluxe)' },
  { handle: 'nova-lane', name: 'Nova Lane', tagline: 'Midnight Frequencies' },
  {
    handle: 'kai-rivers',
    name: 'Kai Rivers',
    tagline: 'Still Waters Run Deep',
  },
  { handle: 'sable-cross', name: 'Sable Cross', tagline: 'Velvet Chains' },
  { handle: 'maren-echo', name: 'Maren Echo', tagline: 'Half-Light Sessions' },
  { handle: 'jules-voss', name: 'Jules Voss', tagline: 'Concrete Garden' },
  { handle: 'rio-santos', name: 'Rio Santos', tagline: 'Sol y Sombra' },
  { handle: 'eli-wolfe', name: 'Eli Wolfe', tagline: 'Ghost Notes' },
  { handle: 'dani-park', name: 'Dani Park', tagline: 'Color Theory' },
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
