import { trackFunnelStep } from '@/lib/analytics/signup-funnel-client';

/**
 * Every homepage event says which artist the page featured, so the featured
 * slot can rotate by what converts (Tim, 2026-11-12).
 *
 * A literal, not HOMEPAGE_FEATURED_ARTIST.slug: this module ships to the
 * client, and importing the artist records would bundle their opt-in words
 * and catalogs. homepage-analytics.featured-artist.test.ts fails if it drifts
 * from the artist the page actually features.
 */
export const HOMEPAGE_FEATURED_ARTIST_SLUG = 'tim-white';

/** Only `/` features the artist; tracked links elsewhere carry no tag. */
function featuredArtistTag(): { featured_artist?: string } {
  return typeof window !== 'undefined' && window.location.pathname === '/'
    ? { featured_artist: HOMEPAGE_FEATURED_ARTIST_SLUG }
    : {};
}

export function trackHomepageEvent(
  event: string,
  properties?: Record<string, unknown>
) {
  // The primary submit may immediately hard-navigate; emit before the lazy import.
  if (event === 'homepage_prompt_submitted') {
    trackFunnelStep({
      funnel: 'artist_signup',
      step: 'cta_click',
      surface: 'homepage',
    });
  }

  // Read the page now: a link click can navigate before the chunk loads.
  const tagged = { ...featuredArtistTag(), ...properties };
  void import('../../lib/analytics')
    .then(({ track }) => {
      track(event, tagged);
    })
    .catch(() => {});
}
