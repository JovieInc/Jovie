import { describe, expect, it } from 'vitest';
import { buildStandaloneServerLaunch } from './performance-launch-check';

describe('launch performance server', () => {
  it('preserves the dynamic loopback origin for Better Auth', () => {
    const baseUrl = 'http://127.0.0.1:42137';
    const launch = buildStandaloneServerLaunch(baseUrl);

    expect(launch.args).toContain('--preserve-env=BETTER_AUTH_URL');
    expect(launch.env).toMatchObject({
      BETTER_AUTH_URL: baseUrl,
      E2E_USE_TEST_AUTH_BYPASS: '1',
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
      PORT: '42137',
    });
  });
});
