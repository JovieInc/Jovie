import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AdminWorkspacePage } from '@/components/features/admin/layout/AdminWorkspacePage';
import {
  getPlaylistEngineSettings,
  getPlaylistSpotifyStatus,
  isSpotifyAccount,
  readAccountLabel,
  readExternalAccountScopes,
} from '@/lib/admin/platform-connections';
import { isAdmin as checkAdminRole } from '@/lib/admin/roles';
import { getCachedAuth, getCachedCurrentUser } from '@/lib/auth/cached';
import { REQUIRED_PLAYLIST_SPOTIFY_SCOPES } from '@/lib/spotify/system-account';
import { PlatformConnectionsClient } from './PlatformConnectionsClient';

export const metadata: Metadata = { title: 'Platform Connections — Admin' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PlatformConnectionsTab = 'spotify' | 'engine';

const TAB_OPTIONS = [
  { value: 'spotify' as const, label: 'Spotify Publisher' },
  { value: 'engine' as const, label: 'Playlist Engine' },
] as const;

async function requireAdmin(): Promise<void> {
  const { userId } = await getCachedAuth();
  if (!userId || !(await checkAdminRole(userId))) {
    notFound();
  }
}

export default async function AdminPlatformConnectionsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ tab?: string }>;
}>) {
  await requireAdmin();
  const { tab = 'spotify' } = await searchParams;
  const currentTab = (
    ['spotify', 'engine'].includes(tab) ? tab : 'spotify'
  ) as PlatformConnectionsTab;

  const [spotifyStatus, engineSettings, user] = await Promise.all([
    getPlaylistSpotifyStatus(),
    getPlaylistEngineSettings(),
    getCachedCurrentUser(),
  ]);

  const currentSpotifyAccount =
    user?.externalAccounts.find(isSpotifyAccount) ?? null;
  const approvedScopes = readExternalAccountScopes(currentSpotifyAccount);
  const missingScopes = REQUIRED_PLAYLIST_SPOTIFY_SCOPES.filter(
    scope => !approvedScopes.includes(scope)
  );

  return (
    <AdminWorkspacePage
      title='Platform Connections'
      description='Manage internal publisher connections and playlist generation controls.'
      primaryParam='tab'
      primaryValue={currentTab}
      primaryOptions={TAB_OPTIONS}
      testId='admin-platform-connections'
      viewTestId={`admin-platform-connections-${currentTab}`}
    >
      <PlatformConnectionsClient
        currentTab={currentTab}
        spotifyStatus={{
          ...spotifyStatus,
          updatedAt: spotifyStatus.updatedAt?.toISOString() ?? null,
        }}
        engineSettings={{
          ...engineSettings,
          lastGeneratedAt:
            engineSettings.lastGeneratedAt?.toISOString() ?? null,
          nextEligibleAt: engineSettings.nextEligibleAt?.toISOString() ?? null,
        }}
        currentUser={{
          hasSpotify: Boolean(currentSpotifyAccount),
          label: readAccountLabel(currentSpotifyAccount),
          missingScopes,
        }}
      />
    </AdminWorkspacePage>
  );
}
