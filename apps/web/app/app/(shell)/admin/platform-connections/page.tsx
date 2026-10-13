import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminReadUnavailable } from '@/components/features/admin/AdminReadUnavailable';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
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

export default async function AdminPlatformConnectionsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ tab?: string }>;
}>) {
  await requireCurrentAdminPageAccess();

  const { tab = 'spotify' } = await searchParams;
  const currentTab = (
    ['spotify', 'engine'].includes(tab) ? tab : 'spotify'
  ) as PlatformConnectionsTab;

  let data: AdminPlatformConnectionsData | null = null;
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
      <p className='mb-4 text-sm text-secondary'>
        <Link
          href='/app/ov/integrations'
          className='text-primary underline underline-offset-4'
        >
          Manage account integrations
        </Link>{' '}
        through the shared Settings connection flow.
      </p>
      {data === null ? (
        <AdminReadUnavailable message='Publisher connection and playlist settings could not be read. Their status is unknown; changes are unavailable until the current settings can be verified.' />
      ) : (
        <PlatformConnectionsClient
          currentTab={currentTab}
          spotifyStatus={data.spotifyStatus}
          engineSettings={data.engineSettings}
          currentUser={data.currentUser}
        />
      )}
    </AdminPage>
  );
}
