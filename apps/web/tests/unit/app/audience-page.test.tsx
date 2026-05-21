import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('audience app shell route', () => {
  it('uses the shared route context without reloading dashboard shell data locally', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/app/(shell)/audience/page.tsx'),
      'utf8'
    );

    expect(source).toContain('loadAppShellRouteContext');
    expect(source).toContain('loadAuthenticatedAppShellUserId');
    expect(source).toContain('requireAppShellDashboardUserId');
    expect(source).toContain('authenticatedUserId: userId');
    expect(source).not.toContain('buildAppShellSignInUrl');
    expect(source).not.toContain('getCachedAuth');
    expect(source).not.toContain('getDashboardShellData');
    expect(source).not.toContain('dashboardLoadError');
    expect(source).not.toMatch(/\bgetDashboardData(?:Essential)?\(/);
  });
});
