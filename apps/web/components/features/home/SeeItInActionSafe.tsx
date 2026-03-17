import { getFeaturedCreators } from '@/lib/featured-creators';
import {
  FALLBACK_AVATARS,
  fillWithFallbacks,
} from './featured-creators-fallback';
import { SeeItInActionCarousel } from './SeeItInActionCarousel';

/**
 * Safe wrapper for SeeItInAction that catches errors during SSR.
 * Prevents the entire page from crashing if database fetch fails.
 * Falls back to static avatars if any error occurs.
 */
export async function SeeItInActionSafe() {
  try {
    const dbCreators = await getFeaturedCreators();
    const creators = fillWithFallbacks(dbCreators);
    return <SeeItInActionCarousel creators={creators} />;
  } catch (error) {
    console.error('[Homepage] SeeItInAction failed:', error);

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
        console.error('[Homepage] Failed to log to Sentry:', sentryError);
      }
    }

    return <SeeItInActionCarousel creators={FALLBACK_AVATARS} />;
  }
}
