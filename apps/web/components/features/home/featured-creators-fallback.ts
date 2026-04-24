import type { FeaturedCreator } from '@/lib/featured-creators';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

const FALLBACK_CREATOR_DATA = [
  {
    handle: TIM_WHITE_PROFILE.handle,
    name: TIM_WHITE_PROFILE.name,
    tagline: 'The Deep End',
    src: TIM_WHITE_PROFILE.avatarSrc,
  },
] as const;

export const FALLBACK_AVATARS: FeaturedCreator[] = FALLBACK_CREATOR_DATA.map(
  (creator, i) => ({
    id: `fallback-${i + 1}`,
    handle: creator.handle,
    name: creator.name,
    src: creator.src,
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
