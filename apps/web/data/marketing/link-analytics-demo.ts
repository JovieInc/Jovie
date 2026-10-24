import type {
  Release,
  ReleaseSidebarAnalytics,
} from '@/components/organisms/release-sidebar/types';

/** Illustrative clicks, not customer results. All dates and totals share this fixture. */
export const LINK_ANALYTICS_DEMO_NOW = '2026-10-23T16:00:00.000Z';

export const LINK_ANALYTICS_DEMO_RELEASE: Release = {
  profileId: 'profile-northline',
  id: 'release-harbor',
  title: 'Harbor',
  status: 'released',
  slug: 'harbor',
  smartLinkPath: '/northline/harbor',
  providers: [],
  releaseType: 'single',
  isExplicit: false,
  totalTracks: 1,
};

const dailyClicks = [
  74, 74, 74, 74, 74, 74, 74, 74, 74, 74, 74, 74, 74, 74, 74, 74, 74, 74, 74,
  74, 74, 74, 88, 10, 14, 16, 18, 20, 22, 26,
] as const;

export const LINK_ANALYTICS_DEMO_DAYS = dailyClicks.map((clicks, index) => ({
  date: new Date(Date.UTC(2026, 8, 24 + index)).toISOString(),
  clicks,
}));

export const LINK_ANALYTICS_DEMO: ReleaseSidebarAnalytics = {
  totalClicks: 1842,
  last7DaysClicks: 126,
  lastClickAt: '2026-10-23T15:04:00.000Z',
  providerClicks: [
    { provider: 'spotify', clicks: 940 },
    { provider: 'apple_music', clicks: 580 },
    { provider: 'youtube', clicks: 322 },
  ],
};

export const LINK_ANALYTICS_DEMO_RECENT = [
  { provider: 'Spotify', at: LINK_ANALYTICS_DEMO.lastClickAt! },
  { provider: 'Apple Music', at: '2026-10-23T14:52:00.000Z' },
  { provider: 'YouTube', at: '2026-10-23T14:31:00.000Z' },
] as const;
