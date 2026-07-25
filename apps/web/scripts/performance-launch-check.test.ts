import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildStandaloneServerLaunch } from './performance-launch-check';

describe('launch performance server', () => {
  it('keeps library loaders parallel and reuses the resolved profile context', () => {
    const libraryPageSource = readFileSync(
      resolve(process.cwd(), 'app/app/(shell)/library/page.tsx'),
      'utf8'
    );

    expect(libraryPageSource).toContain('loadReleaseMatrixForProfile');
    expect(libraryPageSource).toContain(
      'loadArtistHandleForProfile(profileId).then'
    );
    expect(libraryPageSource).not.toContain(
      'const artistHandle = await loadArtistHandleForProfile(profileId)'
    );
  });

  it('preserves the dynamic loopback origin for Better Auth', () => {
    const baseUrl = 'http://127.0.0.1:42137';
    const launch = buildStandaloneServerLaunch(baseUrl, {});

    expect(launch.args).toContain('--preserve-env=BETTER_AUTH_URL');
    expect(launch.args).not.toContain(
      '--preserve-env=BETTER_AUTH_URL,DATABASE_URL'
    );
    expect(launch.env).toMatchObject({
      BETTER_AUTH_URL: baseUrl,
      E2E_USE_TEST_AUTH_BYPASS: '1',
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
      PORT: '42137',
    });
  });

  it('preserves only an explicitly supplied performance database', () => {
    const databaseUrl = 'postgresql://perf-user@127.0.0.1:55432/jovie_uas_perf';
    const launch = buildStandaloneServerLaunch('http://127.0.0.1:42138', {
      DATABASE_URL: databaseUrl,
    });

    expect(launch.args).toContain(
      '--preserve-env=BETTER_AUTH_URL,DATABASE_URL'
    );
    expect(launch.env.DATABASE_URL).toBe(databaseUrl);
  });
});
