export const DEMO_SHOWCASE_SURFACE_IDS = [
  'analytics',
  'earnings',
  'links',
  'settings',
  'onboarding-handle',
  'onboarding-dsp',
  'onboarding-profile-review',
] as const;

export type DemoShowcaseSurfaceId = (typeof DEMO_SHOWCASE_SURFACE_IDS)[number];
