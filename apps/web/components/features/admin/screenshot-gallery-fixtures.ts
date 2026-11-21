import type { ScreenshotInfo } from '@/lib/admin/types';

export function screenshotFixture(
  overrides: Partial<ScreenshotInfo> = {}
): ScreenshotInfo {
  return {
    id: 'homepage-desktop',
    title: 'Homepage Desktop',
    group: 'marketing',
    groupLabel: 'Marketing',
    route: '/',
    viewport: 'desktop',
    theme: 'default',
    consumers: ['admin', 'marketing-export'],
    capturedAt: '2026-10-01T12:00:00.000Z',
    gitSha: 'abcdef1234567890',
    imagePath: 'homepage-desktop.png',
    canonicalSurfaceId: 'homepage',
    canonicalSurfaceLabel: 'Homepage',
    canonicalSurfaceReviewRoute: '/',
    sizeBytes: 204800,
    url: '/api/admin/screenshots/homepage-desktop',
    ...overrides,
  };
}

export function screenshotFixtureSet(): readonly ScreenshotInfo[] {
  return [
    screenshotFixture(),
    screenshotFixture({
      id: 'profile-mobile',
      title: 'Public Profile Mobile',
      viewport: 'mobile',
      canonicalSurfaceId: 'public-profile',
      canonicalSurfaceLabel: 'Public Profile',
      canonicalSurfaceReviewRoute: '/demo/showcase/public-profile',
      group: 'public-profile',
      groupLabel: 'Public Profile',
    }),
    screenshotFixture({
      id: 'settings-desktop',
      title: 'Settings Desktop',
      group: 'settings',
      groupLabel: 'Settings',
      consumers: ['admin'],
      canonicalSurfaceId: undefined,
      canonicalSurfaceLabel: undefined,
      canonicalSurfaceReviewRoute: undefined,
    }),
  ];
}
