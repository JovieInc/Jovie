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

/**
 * Fill gaps with fallback avatars up to a custom minimum.
 * Used by SeeItInActionSafe which only needs 3 creators.
 */
export function fillToMinimum(
  creators: FeaturedCreator[],
  minimum = 3
): FeaturedCreator[] {
  if (creators.length >= minimum) return creators;
  const needed = minimum - creators.length;
  const usedHandles = new Set(creators.map(c => c.handle));
  const fallbacks = FALLBACK_AVATARS.filter(
    f => !usedHandles.has(f.handle)
  ).slice(0, needed);
  return [...creators, ...fallbacks];
}
