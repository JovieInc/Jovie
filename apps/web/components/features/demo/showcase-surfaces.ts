export const DEMO_SHOWCASE_SURFACE_IDS = [
  'analytics',
  'earnings',
  'links',
  'releases',
  'settings',
  'public-profile',
  'release-landing',
  'release-presave',
  'release-tasks',
  'artist-profile-mode-release',
  'artist-profile-mode-shows',
  'artist-profile-mode-pay',
  'artist-profile-mode-subscribe',
  'artist-profile-mode-links',
  'onboarding-handle',
  'onboarding-dsp',
  'onboarding-profile-review',
] as const;

export type DemoShowcaseSurfaceId = (typeof DEMO_SHOWCASE_SURFACE_IDS)[number];
