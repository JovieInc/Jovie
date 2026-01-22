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
 * Safe wrapper for SeeItInAction that catches errors during SSR.
 * Prevents the entire page from crashing if database fetch fails.
 * Falls back to static avatars if any error occurs.
 */
export async function SeeItInActionSafe() {
  try {
    // Fetch from DB (cached via unstable_cache in getFeaturedCreators)
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
  } catch (error) {
    // Log error but render fallback instead of crashing the page
    console.error('[Homepage] SeeItInAction failed:', error);

    // Server-side Sentry logging (only available server-side)
    if (typeof window === 'undefined') {
      try {
        const Sentry = await import('@sentry/nextjs');
        Sentry.captureException(error, {
          tags: {
            context: 'homepage_see_it_in_action',
            critical: 'true',
          },
          extra: {
            message: 'Featured creators fetch failed, using fallback avatars',
          },
        });
      } catch (sentryError) {
        // Sentry itself failed, just log to console
        console.error('[Homepage] Failed to log to Sentry:', sentryError);
      }
    }

    // Return fallback component with static avatars (no DB access)
    return <SeeItInActionCarousel creators={FALLBACK_AVATARS} />;
  }
}
