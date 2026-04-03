import { describe, expect, it } from 'vitest';
import {
  isReleasesShellRoute,
  resolveAppShellRequestPath,
} from '@/app/app/(shell)/shell-route-matches';
import { APP_ROUTES } from '@/constants/routes';

describe('resolveAppShellRequestPath', () => {
  const releasesDashboardGroupPath = `/app/(shell)/${APP_ROUTES.DASHBOARD_RELEASES.split(
    '/'
  )
    .filter(Boolean)
    .slice(1)
    .join('/')}`;

  it('uses next-url when it is available', () => {
    expect(
      resolveAppShellRequestPath(
        `${APP_ROUTES.DASHBOARD_RELEASES}?tab=links`,
        APP_ROUTES.DASHBOARD
      )
    ).toBe(APP_ROUTES.DASHBOARD_RELEASES);
  });

  it('falls back to x-matched-path when next-url is missing', () => {
    expect(
      resolveAppShellRequestPath(null, APP_ROUTES.DASHBOARD_RELEASES)
    ).toBe(APP_ROUTES.DASHBOARD_RELEASES);
  });

  it('strips route groups from x-matched-path when they are present', () => {
    expect(resolveAppShellRequestPath(null, releasesDashboardGroupPath)).toBe(
      APP_ROUTES.DASHBOARD_RELEASES
    );
  });

  it('accepts absolute header values', () => {
    expect(
      resolveAppShellRequestPath(
        null,
        `https://jov.ie${APP_ROUTES.DASHBOARD_RELEASES}?tab=links`
      )
    ).toBe(APP_ROUTES.DASHBOARD_RELEASES);
  });

  it('returns null when no path-like header is present', () => {
    expect(resolveAppShellRequestPath(null, null)).toBeNull();
  });
});

describe('isReleasesShellRoute', () => {
  it('matches the releases dashboard route', () => {
    expect(isReleasesShellRoute(APP_ROUTES.DASHBOARD_RELEASES)).toBe(true);
  });

  it('matches nested releases subroutes', () => {
    expect(
      isReleasesShellRoute(`${APP_ROUTES.DASHBOARD_RELEASES}/abc/tasks`)
    ).toBe(true);
  });
});
