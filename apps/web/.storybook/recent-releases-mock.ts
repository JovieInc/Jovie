/**
 * Storybook mock for '@/lib/recent-releases'.
 *
 * The real module reads CHANGELOG.md through node:fs, which crashes
 * Storybook's browser Vite build, so the mock serves fixture releases.
 */
import type { CompactRelease } from '../lib/recent-releases';

export type { CompactRelease } from '../lib/recent-releases';

const FIXTURE_RELEASES: readonly CompactRelease[] = [
  {
    version: '26.10.0',
    date: '2026-10-01',
    highlights: [
      'Launch notifications for every release',
      'Faster public profiles',
    ],
  },
  {
    version: '26.9.16',
    date: '2026-09-28',
    highlights: ['Claim your profile link from the homepage'],
  },
  {
    version: '26.9.15',
    date: '2026-09-24',
    highlights: ['Smart links for scheduled releases'],
  },
];

export function readRecentReleases(count = 3): CompactRelease[] {
  return FIXTURE_RELEASES.slice(0, count);
}
