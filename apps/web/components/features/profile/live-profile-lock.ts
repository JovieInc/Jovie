/**
 * Journeys locked on the public profile screens in the canonical pen file.
 * The live /[username] route renders these through StaticArtistPage and
 * ProfileCompactTemplate. Legacy full-page templates stay in the repo and
 * are not this route.
 */
export const LIVE_PROFILE_JOURNEYS = [
  'home',
  'music',
  'shows',
  'about',
  'get-updates',
  'share',
  'pay',
  'custom-amount',
  'contact',
  'menu',
  'credits',
  'cookie-consent',
  'cookie-preferences',
] as const;

export type LiveProfileJourney = (typeof LIVE_PROFILE_JOURNEYS)[number];

export const LIVE_PROFILE_ROUTE = {
  page: 'StaticArtistPage',
  template: 'ProfileCompactTemplate',
  legacyTemplates: [
    'PublicProfileTemplate',
    'PublicProfileTemplateV2',
    'AnimatedArtistPage',
  ],
} as const;

export function assertLiveProfileRoute(): void {
  if (LIVE_PROFILE_ROUTE.template !== 'ProfileCompactTemplate') {
    throw new Error('Live profile route drifted from ProfileCompactTemplate');
  }
  const legacy: readonly string[] = LIVE_PROFILE_ROUTE.legacyTemplates;
  if (
    legacy.includes(LIVE_PROFILE_ROUTE.page) ||
    legacy.includes(LIVE_PROFILE_ROUTE.template)
  ) {
    throw new Error('Live profile route is a legacy template');
  }
}
