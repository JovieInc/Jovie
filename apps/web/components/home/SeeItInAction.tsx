import { checkGate, FEATURE_FLAG_KEYS } from '@/lib/feature-flags/server';
import { getFeaturedCreators } from '@/lib/featured-creators';
import { fillWithFallbacks } from './featured-creators-fallback';
import { SeeItInActionCarousel } from './SeeItInActionCarousel';

/**
 * Server component that fetches featured creators from the database.
 * Falls back to example avatars when fewer than MIN_CREATORS are available.
 * Data is cached for 1 week via unstable_cache in getFeaturedCreators.
 * Gated behind the SHOW_SEE_IT_IN_ACTION feature flag.
 */
export async function SeeItInAction() {
  const isEnabled = await checkGate(
    null,
    FEATURE_FLAG_KEYS.SHOW_SEE_IT_IN_ACTION,
    false
  );
  if (!isEnabled) return null;

  const dbCreators = await getFeaturedCreators();
  const creators = fillWithFallbacks(dbCreators);
  return <SeeItInActionCarousel creators={creators} />;
}
