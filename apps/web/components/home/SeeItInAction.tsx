import { getFeaturedCreators } from '@/lib/featured-creators';
import { fillWithFallbacks } from './featured-creators-fallback';
import { SeeItInActionCarousel } from './SeeItInActionCarousel';

/**
 * Server component that fetches featured creators from the database.
 * Falls back to example avatars when fewer than MIN_CREATORS are available.
 * Data is cached for 1 week via unstable_cache in getFeaturedCreators.
 */
export async function SeeItInAction() {
  const dbCreators = await getFeaturedCreators();
  const creators = fillWithFallbacks(dbCreators);
  return <SeeItInActionCarousel creators={creators} />;
}
