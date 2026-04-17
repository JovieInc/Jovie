export const DEMO_SHOWCASE_SURFACE_IDS = [
  'analytics',
  'earnings',
  'links',
  'releases',
  'settings',
  'public-profile',
  'release-landing',
  'release-tracked-links',
  'release-presave',
  'release-tasks',
  'tim-white-profile',
  'onboarding-handle',
  'onboarding-dsp',
  'onboarding-profile-review',
] as const;

export type DemoShowcaseSurfaceId = (typeof DEMO_SHOWCASE_SURFACE_IDS)[number];
