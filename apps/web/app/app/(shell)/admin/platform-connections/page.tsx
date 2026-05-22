import type { Metadata } from 'next';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { PlatformConnectionsClient } from './PlatformConnectionsClient';
import { loadAdminPlatformConnectionsData } from './platform-connections-data';

export const metadata: Metadata = { title: 'Platform Connections — Admin' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PlatformConnectionsTab = 'spotify' | 'engine';

const TAB_OPTIONS = [
  { value: 'spotify' as const, label: 'Spotify Publisher' },
  { value: 'engine' as const, label: 'Playlist Engine' },
] as const;

export default async function AdminPlatformConnectionsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ tab?: string }>;
}>) {
  const { tab = 'spotify' } = await searchParams;
  const currentTab = (
    ['spotify', 'engine'].includes(tab) ? tab : 'spotify'
  ) as PlatformConnectionsTab;

  const data = await loadAdminPlatformConnectionsData();

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
