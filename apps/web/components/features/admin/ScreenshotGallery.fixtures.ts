import type { ScreenshotInfo } from '@/lib/admin/types';
import { CANONICAL_SURFACES } from '@/lib/canonical-surfaces';

const surface = CANONICAL_SURFACES[0];

const IMAGE =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="%23888"/></svg>';

export function makeScreenshot(
  overrides: Partial<ScreenshotInfo> = {}
): ScreenshotInfo {
  return {
    id: 'home-desktop',
    title: 'Homepage Desktop',
    group: 'marketing',
    groupLabel: 'Marketing',
    route: '/',
    viewport: 'desktop',
    theme: 'default',
    consumers: ['admin', 'marketing-export'],
    capturedAt: '2026-09-01T12:00:00.000Z',
    gitSha: 'abcdef1234567890',
    imagePath: 'home-desktop.png',
    sizeBytes: 204_800,
    url: IMAGE,
    publicUrl: 'https://example.com/home-desktop.png',
    canonicalSurfaceId: surface.id,
    canonicalSurfaceLabel: surface.label,
    canonicalSurfaceReviewRoute: surface.reviewRoute,
    ...overrides,
  };
}

export const SCREENSHOT_SET: readonly ScreenshotInfo[] = [
  makeScreenshot(),
  makeScreenshot({
    id: 'home-mobile',
    title: 'Homepage Mobile',
    viewport: 'mobile',
  }),
  makeScreenshot({
    id: 'settings-desktop',
    title: 'Settings Desktop',
    group: 'settings',
    groupLabel: 'Settings',
    consumers: ['admin'],
    canonicalSurfaceId: undefined,
    canonicalSurfaceLabel: undefined,
    canonicalSurfaceReviewRoute: undefined,
    publicUrl: undefined,
    gitSha: null,
  }),
];
