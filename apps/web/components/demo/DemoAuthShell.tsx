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
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { ClientProviders } from '@/components/providers/ClientProviders';
import { publicEnv } from '@/lib/env-public';
import { queryKeys } from '@/lib/queries/keys';
import { AuthShellWrapper } from '../organisms/AuthShellWrapper';
import { DEMO_DASHBOARD_DATA } from './mock-dashboard-data';
import { DEMO_RELEASE_VIEW_MODELS } from './mock-release-data';

const DEMO_PROFILE_ID = DEMO_DASHBOARD_DATA.selectedProfile?.id ?? '';

/**
 * Creates a QueryClient pre-seeded with demo data.
 * - Releases query is populated so DashboardNav shows the badge count.
 * - All queries are configured to never retry or refetch (static demo data).
 */
function createDemoQueryClient(): QueryClient {
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
    queryKeys.releases.matrix(DEMO_PROFILE_ID),
    DEMO_RELEASE_VIEW_MODELS
  );

  return client;
}

// Noop server action stand-in for sidebar collapse persistence
async function noopPersist() {}

export function DemoAuthShell({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  // Stable QueryClient instance per component mount
  const demoQueryClient = useMemo(() => createDemoQueryClient(), []);

  return (
    <ClientProviders
      publishableKey={publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      skipCoreProviders
    >
      <QueryClientProvider client={demoQueryClient}>
        <DashboardDataProvider value={DEMO_DASHBOARD_DATA}>
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
