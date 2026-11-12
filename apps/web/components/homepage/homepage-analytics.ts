import { HOMEPAGE_FEATURED_ARTIST } from '@/data/demoArtists';
import { trackFunnelStep } from '@/lib/analytics/signup-funnel-client';

/**
 * Every homepage event says which artist the page featured, so the featured
 * slot can rotate by what converts (Tim, 2026-11-12).
 */
export const HOMEPAGE_FEATURED_ARTIST_SLUG = HOMEPAGE_FEATURED_ARTIST.slug;

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

  void import('../../lib/analytics')
    .then(({ track }) => {
      track(event, {
        featured_artist: HOMEPAGE_FEATURED_ARTIST_SLUG,
        ...properties,
      });
    })
    .catch(() => {});
}
