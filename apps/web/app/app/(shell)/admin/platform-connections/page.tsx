import type { Metadata } from 'next';
import { AdminWorkspacePage } from '@/components/features/admin/layout/AdminWorkspacePage';
import {
  getPlaylistEngineSettings,
  getPlaylistSpotifyStatus,
} from '@/lib/admin/platform-connections';
import { isAdmin as checkAdminRole } from '@/lib/admin/roles';
import { getCachedAuth, getCachedCurrentUser } from '@/lib/auth/cached';
import {
  REQUIRED_PLAYLIST_SPOTIFY_SCOPES,
  SPOTIFY_EXTERNAL_ACCOUNT_PROVIDERS,
} from '@/lib/spotify/system-account';
import { PlatformConnectionsClient } from './PlatformConnectionsClient';

export const metadata: Metadata = { title: 'Platform Connections — Admin' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PlatformConnectionsTab = 'spotify' | 'engine';

const TAB_OPTIONS = [
  { value: 'spotify' as const, label: 'Spotify Publisher' },
  { value: 'engine' as const, label: 'Playlist Engine' },
] as const;

function readScopes(account: unknown): string[] {
  if (!account || typeof account !== 'object') return [];
  const record = account as Record<string, unknown>;
  const values = [record.approvedScopes, record.scope, record.scopes];
  return values.flatMap(value => {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string');
    }
    if (typeof value === 'string') return value.split(/[,\s]+/).filter(Boolean);
    return [];
  });
}

function readAccountLabel(account: unknown): string | null {
  if (!account || typeof account !== 'object') return null;
  const record = account as Record<string, unknown>;
  for (const key of ['emailAddress', 'username', 'firstName']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function isSpotifyAccount(account: unknown): boolean {
  if (!account || typeof account !== 'object') return false;
  const provider = String((account as Record<string, unknown>).provider ?? '');
  return SPOTIFY_EXTERNAL_ACCOUNT_PROVIDERS.some(alias => provider === alias);
}

async function requireAdmin(): Promise<void> {
  const { userId } = await getCachedAuth();
  if (!userId || !(await checkAdminRole(userId))) {
    throw new Error('Unauthorized');
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
  const approvedScopes = readScopes(currentSpotifyAccount);
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
