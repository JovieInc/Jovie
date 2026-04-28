'use client';

/**
 * DemoAuthShell — wraps the real authenticated app shell with mocked data.
 *
 * Provides the same visual chrome as the real dashboard (UnifiedSidebar,
 * DashboardHeader, DashboardNav) without requiring authentication.
 *
 * Approach:
 * - DashboardDataProvider is fed with mock data (DEMO_DASHBOARD_DATA)
 * - AuthShellWrapper provides the real shell providers (TableMeta, RightPanel,
 *   PreviewPanel, HeaderActions, KeyboardShortcuts)
 * - NuqsProvider mirrors the app-level URL state adapter used by /app
 *   so release and audience tables can safely read query param state on /demo
 * - TooltipProvider mirrors the app-level CoreProviders boundary used by /app
 *   so the dashboard shell can render tooltip-bearing chrome on /demo routes
 * - ClerkSafeDefaultsProvider supplies no-auth Clerk values without mounting
 *   ClerkProvider, which keeps /demo fully local and avoids proxy noise
 * - Releases query is pre-seeded in the QueryClient cache so DashboardNav
 *   badge renders correctly
 */

import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { AuthShellWrapper } from '@/components/organisms/AuthShellWrapper';
import { NuqsProvider } from '@/components/providers/NuqsProvider';
import { ClerkSafeDefaultsProvider } from '@/hooks/useClerkSafe';
import { queryKeys } from '@/lib/queries';
import type { BillingStatusData } from '@/lib/queries/useBillingStatusQuery';
import type { ChatUsageData } from '@/lib/queries/useChatUsageQuery';
import { DEMO_DASHBOARD_DATA } from './mock-dashboard-data';
import { DEMO_RELEASE_VIEW_MODELS } from './mock-release-data';

/**
 * Creates a QueryClient pre-seeded with demo data.
 * - Releases query is populated so DashboardNav shows the badge count.
 * - All queries are configured to never retry or refetch (static demo data).
 */
type DemoQuerySeeder = (
  client: QueryClient,
  dashboardData: DashboardData
) => void;

function createDemoQueryClient(
  profileId: string,
  dashboardData: DashboardData,
  seedQueryClient?: DemoQuerySeeder
): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });

  // Pre-seed the releases query so the sidebar badge shows the count
  client.setQueryData(
    queryKeys.releases.matrix(profileId),
    DEMO_RELEASE_VIEW_MODELS
  );
  client.setQueryData<BillingStatusData>(queryKeys.billing.status(), {
    isPro: true,
    plan: 'max',
    hasStripeCustomer: true,
    stripeSubscriptionId: 'demo-subscription',
    stale: false,
    staleReason: null,
    trialStartedAt: null,
    trialEndsAt: null,
    trialNotificationsSent: 0,
  });
  client.setQueryData<ChatUsageData>(queryKeys.chat.usage(), {
    plan: 'max',
    dailyLimit: 1000,
    used: 128,
    remaining: 872,
    isExhausted: false,
    warningThreshold: 5,
    isNearLimit: false,
  });
  seedQueryClient?.(client, dashboardData);

  return client;
}

// Noop server action stand-in for sidebar collapse persistence
async function noopPersist() {}

interface DemoAuthShellProps {
  readonly children: React.ReactNode;
  /** Pre-built DashboardData from a DB-fetched FeaturedCreator. Falls back to the internal demo persona. */
  readonly dashboardData?: DashboardData;
  readonly seedQueryClient?: DemoQuerySeeder;
}

export function DemoAuthShell({
  children,
  dashboardData,
  seedQueryClient,
}: DemoAuthShellProps) {
  const data = dashboardData ?? DEMO_DASHBOARD_DATA;
  const profileId = data.selectedProfile?.id ?? '';

  // Stable QueryClient instance per component mount
  const demoQueryClient = useMemo(
    () => createDemoQueryClient(profileId, data, seedQueryClient),
    [data, profileId, seedQueryClient]
  );

  return (
    <ClerkSafeDefaultsProvider>
      <QueryClientProvider client={demoQueryClient}>
        <NuqsProvider>
          <TooltipProvider delayDuration={1200}>
            <DashboardDataProvider value={data}>
              <AuthShellWrapper
                persistSidebarCollapsed={noopPersist}
                sidebarDefaultOpen
              >
                {children}
              </AuthShellWrapper>
            </DashboardDataProvider>
          </TooltipProvider>
        </NuqsProvider>
      </QueryClientProvider>
    </ClerkSafeDefaultsProvider>
  );
}
