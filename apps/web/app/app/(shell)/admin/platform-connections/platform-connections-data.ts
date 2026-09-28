import 'server-only';

import {
  getPlaylistEngineSettings,
  getPlaylistSpotifyStatus,
  getSpotifyConnectorAccount,
} from '@/lib/admin/platform-connections';
import { REQUIRED_PLAYLIST_SPOTIFY_SCOPES } from '@/lib/spotify/system-account';

export interface AdminPlatformConnectionsData {
  readonly spotifyStatus: Omit<
    Awaited<ReturnType<typeof getPlaylistSpotifyStatus>>,
    'updatedAt'
  > & {
    readonly updatedAt: string | null;
  };
  readonly engineSettings: Omit<
    Awaited<ReturnType<typeof getPlaylistEngineSettings>>,
    'lastGeneratedAt' | 'nextEligibleAt'
  > & {
    readonly lastGeneratedAt: string | null;
    readonly nextEligibleAt: string | null;
  };
  readonly currentUser: {
    readonly hasSpotify: boolean;
    readonly label: string | null;
    readonly missingScopes: readonly string[];
  };
}

export async function loadAdminPlatformConnectionsData(
  userId: string
): Promise<AdminPlatformConnectionsData> {
  const [spotifyStatus, engineSettings, currentSpotifyAccount] =
    await Promise.all([
      getPlaylistSpotifyStatus(),
      getPlaylistEngineSettings(),
      getSpotifyConnectorAccount(userId),
    ]);

  const hasSpotify =
    !!currentSpotifyAccount && currentSpotifyAccount.status !== 'disabled';
  const approvedScopes = currentSpotifyAccount?.scopes ?? [];
  const missingScopes = REQUIRED_PLAYLIST_SPOTIFY_SCOPES.filter(
    scope => !approvedScopes.includes(scope)
  );

  return {
    spotifyStatus: {
      ...spotifyStatus,
      updatedAt: spotifyStatus.updatedAt?.toISOString() ?? null,
    },
    engineSettings: {
      ...engineSettings,
      lastGeneratedAt: engineSettings.lastGeneratedAt?.toISOString() ?? null,
      nextEligibleAt: engineSettings.nextEligibleAt?.toISOString() ?? null,
    },
    currentUser: {
      hasSpotify,
      label: hasSpotify
        ? (currentSpotifyAccount?.providerAccountId ?? null)
        : null,
      missingScopes,
    },
  };
}
