import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ADMIN_INTERVIEWS_PAGE = resolve(
  process.cwd(),
  'app/app/(shell)/admin/interviews/page.tsx'
);
const ADMIN_PLATFORM_CONNECTIONS_PAGE = resolve(
  process.cwd(),
  'app/app/(shell)/admin/platform-connections/page.tsx'
);
const ADMIN_PLAYLISTS_PAGE = resolve(
  process.cwd(),
  'app/app/(shell)/admin/playlists/page.tsx'
);

describe('admin child route auth normalization', () => {
  it('keeps read-only admin child pages on the parent admin layout gate', () => {
    for (const filePath of [
      ADMIN_INTERVIEWS_PAGE,
      ADMIN_PLATFORM_CONNECTIONS_PAGE,
    ]) {
      const source = readFileSync(filePath, 'utf8');

      expect(source).not.toContain('getCachedAuth');
      expect(source).not.toContain('checkAdminRole');
      expect(source).not.toContain('requireAdminOrRedirect');
      expect(source).not.toMatch(/\brequireAdmin\(\)/);
    }
  });

  it('keeps admin platform route data outside the page module', () => {
    const source = readFileSync(ADMIN_PLATFORM_CONNECTIONS_PAGE, 'utf8');

    expect(source).toContain('loadAdminPlatformConnectionsData');
    expect(source).not.toContain('getCachedCurrentUser');
    expect(source).not.toContain('@/lib/admin/platform-connections');
    expect(source).not.toContain('REQUIRED_PLAYLIST_SPOTIFY_SCOPES');
    expect(source).not.toContain('readExternalAccountScopes');
    expect(source).not.toContain('readAccountLabel');
  });

  it('keeps admin playlist data and actions outside the page module', () => {
    const source = readFileSync(ADMIN_PLAYLISTS_PAGE, 'utf8');

    expect(source).toContain('loadAdminPlaylists');
    expect(source).toContain('approvePlaylist');
    expect(source).toContain('rejectPlaylist');
    expect(source).not.toContain('getCachedAuth');
    expect(source).not.toContain('@/lib/db');
    expect(source).not.toContain('joviePlaylists');
    expect(source).not.toContain('joviePlaylistTracks');
    expect(source).not.toContain('generateCoverArt');
    expect(source).not.toContain('publishToSpotify');
    expect(source).not.toContain('captureError');
    expect(source).not.toMatch(/\brequireAdmin\(\)/);
  });
});
