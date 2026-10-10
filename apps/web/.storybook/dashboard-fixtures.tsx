import type { Decorator } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { ReactNode } from 'react';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { PreviewPanelProvider } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import { TableMetaProvider } from '@/contexts/TableMetaContext';
import { AudiencePanelProvider } from '@/features/dashboard/organisms/AudiencePanelContext';
import { queryKeys } from '@/lib/queries/keys';
import type { AiCrawlerAnalyticsResponse } from '@/types/ai-crawler-analytics';

/**
 * Shared Storybook fixtures for the heavier `features/dashboard` organisms
 * that read `DashboardDataContext`, `PreviewPanelContext`, `RightPanelContext`,
 * and/or react-query. One module so every story seeds the same shapes the
 * same way, instead of every story re-deriving its own partial fixture.
 *
 * Server actions ('use server' modules) cannot run in Storybook's browser
 * Vite build; those are aliased to stub modules in `.storybook/main.ts`
 * (dashboard-actions-mock.ts, release-task-actions-mock.ts, etc.) rather
 * than handled here — this module only covers client-side React context and
 * react-query state.
 *
 * Pairs with `signed-in-session.tsx` (the #19194 signed-in Better Auth
 * fixture) for stories that also need an authenticated session.
 */

export const DASHBOARD_FIXTURE_PROFILE_ID = 'story-profile';
export const DASHBOARD_FIXTURE_USER_ID = 'story-user';

/**
 * Partial, story-realistic `selectedProfile`. `CreatorProfile` is the full
 * Drizzle row type (`typeof creatorProfiles.$inferSelect`) with dozens of
 * DB columns; matching every field is unnecessary for UI stories, so we
 * cast at the boundary the same way the existing AccountSettingsSection and
 * DashboardAudienceTable stories already do.
 */
export const DASHBOARD_FIXTURE_PROFILE = {
  id: DASHBOARD_FIXTURE_PROFILE_ID,
  handle: 'sashawaves',
  name: 'Sasha Waves',
  image_url: null,
  spotify_id: 'spotify-artist-1',
  apple_music_id: null,
  settings: {},
  // Real rows always carry createdAt; profile-to-artist adapters serialize it.
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
} as unknown as DashboardData['selectedProfile'];

export const DEFAULT_DASHBOARD_DATA: DashboardData = {
  user: { id: DASHBOARD_FIXTURE_USER_ID },
  creatorProfiles: [DASHBOARD_FIXTURE_PROFILE].filter(
    Boolean
  ) as DashboardData['creatorProfiles'],
  selectedProfile: DASHBOARD_FIXTURE_PROFILE,
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: true,
  hasMusicLinks: true,
  isAdmin: false,
  tippingStats: {
    tipClicks: 0,
    qrTipClicks: 0,
    linkTipClicks: 0,
    tipsSubmitted: 0,
    totalReceivedCents: 0,
    monthReceivedCents: 0,
  },
  profileCompletion: {
    percentage: 100,
    completedCount: 4,
    totalCount: 4,
    steps: [],
    profileIsLive: true,
  },
} as DashboardData;

/** Measured zero-state AI crawler analytics ("Waiting for first AI crawl"). */
export const DASHBOARD_FIXTURE_AI_CRAWLERS: AiCrawlerAnalyticsResponse = {
  totalRequests: 0,
  weeklyRequests: 0,
  crawlers: [],
  dailyTrend: [],
  syncedAt: '2026-09-01T12:00:00.000Z',
  isPro: true,
  isTeaser: false,
};

/** Fresh QueryClient tuned for stories: no retries, no background refetch.
 * Seeds dashboard queries that shell surfaces read on mount so stories render
 * without a network. */
export function createDashboardQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
  client.setQueryData(
    queryKeys.dashboard.aiCrawlers(),
    DASHBOARD_FIXTURE_AI_CRAWLERS
  );
  return client;
}

/** Wraps `children` with the full dashboard provider stack for direct reuse
 * outside the decorator array (e.g. inside a custom `render`). */
export function DashboardStoryProviders({
  children,
  dashboardData = DEFAULT_DASHBOARD_DATA,
  queryClient,
}: {
  readonly children: ReactNode;
  readonly dashboardData?: DashboardData;
  readonly queryClient?: QueryClient;
}) {
  return (
    <QueryClientProvider client={queryClient ?? createDashboardQueryClient()}>
      <DashboardDataProvider value={dashboardData}>
        <PreviewPanelProvider>
          <RightPanelProvider>
            <HeaderActionsProvider>
              <TableMetaProvider>
                <AudiencePanelProvider>{children}</AudiencePanelProvider>
              </TableMetaProvider>
            </HeaderActionsProvider>
          </RightPanelProvider>
        </PreviewPanelProvider>
      </DashboardDataProvider>
    </QueryClientProvider>
  );
}

/**
 * Decorator bundling the common dashboard provider stack (react-query +
 * DashboardDataProvider + PreviewPanelProvider + RightPanelProvider +
 * HeaderActionsProvider + TableMetaProvider + AudiencePanelProvider) with
 * the default fixture data. Combine with `withSignedInSession` from
 * `signed-in-session.tsx` when a story also needs an authenticated session.
 */
export const withDashboardProviders: Decorator = Story => (
  <DashboardStoryProviders>
    <Story />
  </DashboardStoryProviders>
);

/**
 * Decorator for components that read URL search-param state via `nuqs`
 * (e.g. `useQueryState`/`useQueryStates`), such as DashboardAudienceClient.
 * `nuqs` v2 requires an explicit adapter; `NuqsTestingAdapter` is the
 * package's own in-memory adapter for exactly this (no real Next.js router
 * needed). `hasMemory: true` so filter/sort interactions in a story
 * actually update visually instead of freezing at the initial params.
 */
export const withNuqsTestingAdapter: Decorator = Story => (
  <NuqsTestingAdapter hasMemory>
    <Story />
  </NuqsTestingAdapter>
);

/** Same as `withDashboardProviders`, for a profile still mid-onboarding. */
export const withOnboardingDashboardProviders: Decorator = Story => (
  <DashboardStoryProviders
    dashboardData={{
      ...DEFAULT_DASHBOARD_DATA,
      needsOnboarding: true,
      hasSocialLinks: false,
      hasMusicLinks: false,
      profileCompletion: {
        percentage: 25,
        completedCount: 1,
        totalCount: 4,
        steps: [],
        profileIsLive: false,
      },
    }}
  >
    <Story />
  </DashboardStoryProviders>
);
