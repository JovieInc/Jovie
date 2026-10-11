import { trackFunnelStep } from '@/lib/analytics/signup-funnel-client';

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
      track(event, properties);
    })
    .catch(() => {});
}
