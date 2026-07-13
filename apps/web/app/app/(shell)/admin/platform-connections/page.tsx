import type { Metadata } from 'next';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { captureError } from '@/lib/error-tracking';
import { PlatformConnectionsClient } from './PlatformConnectionsClient';
import {
  type AdminPlatformConnectionsData,
  loadAdminPlatformConnectionsData,
} from './platform-connections-data';

export const metadata: Metadata = { title: 'Platform Connections — Admin' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PlatformConnectionsTab = 'spotify' | 'engine';

const TAB_OPTIONS = [
  { value: 'spotify' as const, label: 'Spotify Publisher' },
  { value: 'engine' as const, label: 'Playlist Engine' },
] as const;

const FALLBACK_PLATFORM_CONNECTIONS_DATA: AdminPlatformConnectionsData = {
  spotifyStatus: {
    connected: false,
    healthy: false,
    source: 'missing',
    clerkUserId: null,
    accountLabel: null,
    approvedScopes: [],
    missingScopes: [],
    updatedAt: null,
    updatedByUserId: null,
    error: null,
  },
  engineSettings: {
    enabled: false,
    intervalValue: 3,
    intervalUnit: 'days',
    lastGeneratedAt: null,
    nextEligibleAt: null,
  },
  currentUser: {
    hasSpotify: false,
    label: null,
    missingScopes: [],
  },
};

export default async function AdminPlatformConnectionsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ tab?: string }>;
}>) {
  const { tab = 'spotify' } = await searchParams;
  const currentTab = (
    ['spotify', 'engine'].includes(tab) ? tab : 'spotify'
  ) as PlatformConnectionsTab;

  let data = FALLBACK_PLATFORM_CONNECTIONS_DATA;
  try {
    data = await loadAdminPlatformConnectionsData();
  } catch (error) {
    await captureError(
      'Admin platform connections failed to load optional settings',
      error,
      {
        route: 'admin/platform-connections',
      }
    );
  }

  return (
    <AdminPage
      title='Platform Connections'
      description='Manage internal publisher connections and playlist generation controls.'
      tabs={{
        param: 'tab',
        value: currentTab,
        options: TAB_OPTIONS,
      }}
      testId='admin-platform-connections'
      viewTestId={`admin-platform-connections-${currentTab}`}
    >
      <PlatformConnectionsClient
        currentTab={currentTab}
        spotifyStatus={data.spotifyStatus}
        engineSettings={data.engineSettings}
        currentUser={data.currentUser}
      />
    </AdminPage>
  );
}
