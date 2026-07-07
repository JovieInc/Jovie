import 'server-only';

import {
  getPlaylistEngineSettings,
  getPlaylistSpotifyStatus,
  readAccountLabel,
  readExternalAccountScopes,
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

export async function loadAdminPlatformConnectionsData(): Promise<AdminPlatformConnectionsData> {
  const [spotifyStatus, engineSettings] = await Promise.all([
    getPlaylistSpotifyStatus(),
    getPlaylistEngineSettings(),
  ]);

  // Clerk-era surface: `user.externalAccounts` was a Clerk User resource
  // field. The Better Auth-backed `JovieUser` shape does not model OAuth
  // external accounts as sub-resources, so this is null post-cutover.
  // Spotify connection status moves to a Better Auth account-based reader
  // in a later commit of the migration.
  const currentSpotifyAccount = null;
  const approvedScopes = readExternalAccountScopes(currentSpotifyAccount);
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
      hasSpotify: Boolean(currentSpotifyAccount),
      label: readAccountLabel(currentSpotifyAccount),
      missingScopes,
    },
  };
}
