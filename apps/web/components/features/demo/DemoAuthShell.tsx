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
 * - ClientProviders wraps everything with ClerkProvider so that sidebar
 *   components (UserButton, SidebarUpgradeBanner) that use Clerk/billing
 *   hooks degrade gracefully instead of crashing
 * - Releases query is pre-seeded in the QueryClient cache so DashboardNav
 *   badge renders correctly
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { AuthShellWrapper } from '@/components/organisms/AuthShellWrapper';
import { ClientProviders } from '@/components/providers/ClientProviders';
import { publicEnv } from '@/lib/env-public';
import { queryKeys } from '@/lib/queries';
import { DEMO_DASHBOARD_DATA } from './mock-dashboard-data';
import { DEMO_RELEASE_VIEW_MODELS } from './mock-release-data';

/**
 * Creates a QueryClient pre-seeded with demo data.
 * - Releases query is populated so DashboardNav shows the badge count.
 * - All queries are configured to never retry or refetch (static demo data).
 */
function createDemoQueryClient(profileId: string): QueryClient {
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

  return client;
}

// Noop server action stand-in for sidebar collapse persistence
async function noopPersist() {}

interface DemoAuthShellProps {
  readonly children: React.ReactNode;
  /** Pre-built DashboardData from a DB-fetched FeaturedCreator. Falls back to Tim White. */
  readonly dashboardData?: DashboardData;
}

export function DemoAuthShell({ children, dashboardData }: DemoAuthShellProps) {
  const data = dashboardData ?? DEMO_DASHBOARD_DATA;
  const profileId = data.selectedProfile?.id ?? '';

  // Stable QueryClient instance per component mount
  const demoQueryClient = useMemo(
    () => createDemoQueryClient(profileId),
    [profileId]
  );

  return (
    <ClientProviders
      publishableKey={publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      skipCoreProviders
    >
      <QueryClientProvider client={demoQueryClient}>
        <DashboardDataProvider value={data}>
          <AuthShellWrapper
            persistSidebarCollapsed={noopPersist}
            sidebarDefaultOpen
          >
            {children}
          </AuthShellWrapper>
        </DashboardDataProvider>
      </QueryClientProvider>
    </ClientProviders>
  );
}
