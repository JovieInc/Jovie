import { describe, expect, it } from 'vitest';
import {
  isChatShellRoute,
  isReleasesShellRoute,
  resolveAppShellRequestPath,
  shouldRedirectToOnboarding,
  shouldUseEssentialShellData,
} from '@/app/app/(shell)/shell-route-matches';
import { APP_ROUTES } from '@/constants/routes';

describe('resolveAppShellRequestPath', () => {
  it('uses next-url when it is available', () => {
    expect(
      resolveAppShellRequestPath(
        '/app/dashboard/releases?tab=links',
        '/app/dashboard'
      )
    ).toBe('/app/dashboard/releases');
  });

  it('falls back to x-matched-path when next-url is missing', () => {
    expect(resolveAppShellRequestPath(null, '/app/dashboard/releases')).toBe(
      '/app/dashboard/releases'
    );
  });

  it('strips route groups from x-matched-path when they are present', () => {
    expect(
      resolveAppShellRequestPath(null, '/app/(shell)/dashboard/releases')
    ).toBe('/app/dashboard/releases');
  });

  it('accepts absolute header values', () => {
    expect(
      resolveAppShellRequestPath(
        null,
        'https://jov.ie/app/dashboard/releases?tab=links'
      )
    ).toBe('/app/dashboard/releases');
  });

  it('falls back to the dashboard path when no path-like header is present', () => {
    expect(resolveAppShellRequestPath(null, null)).toBe(APP_ROUTES.DASHBOARD);
  });
});

describe('isReleasesShellRoute', () => {
  it('matches the releases dashboard route', () => {
    expect(isReleasesShellRoute('/app/dashboard/releases')).toBe(true);
  });

  it('matches nested releases subroutes', () => {
    expect(isReleasesShellRoute('/app/dashboard/releases/abc/tasks')).toBe(
      true
    );
  });
});

describe('isChatShellRoute', () => {
  it('matches the dashboard root', () => {
    expect(isChatShellRoute(APP_ROUTES.DASHBOARD)).toBe(true);
  });

  it('matches the chat route', () => {
    expect(isChatShellRoute(APP_ROUTES.CHAT)).toBe(true);
  });

  it('matches chat thread subroutes', () => {
    expect(isChatShellRoute(`${APP_ROUTES.CHAT}/thread-abc`)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isChatShellRoute(null)).toBe(false);
  });

  it('returns false for non-chat routes', () => {
    expect(isChatShellRoute('/app/settings')).toBe(false);
  });
});

describe('shouldUseEssentialShellData', () => {
  it('returns true for chat routes', () => {
    expect(shouldUseEssentialShellData(APP_ROUTES.CHAT)).toBe(true);
  });

  it('returns true for releases routes', () => {
    expect(shouldUseEssentialShellData('/app/dashboard/releases')).toBe(true);
  });

  it('returns true for dashboard root', () => {
    expect(shouldUseEssentialShellData(APP_ROUTES.DASHBOARD)).toBe(true);
  });

  it('returns false for null', () => {
    expect(shouldUseEssentialShellData(null)).toBe(false);
  });

  it('returns false for non-lightweight routes', () => {
    expect(shouldUseEssentialShellData('/app/settings')).toBe(false);
  });
});

describe('shouldRedirectToOnboarding', () => {
  it('returns true for lightweight shell routes', () => {
    expect(shouldRedirectToOnboarding(APP_ROUTES.CHAT)).toBe(true);
    expect(shouldRedirectToOnboarding('/app/dashboard/releases')).toBe(true);
  });

  it('returns false for null', () => {
    expect(shouldRedirectToOnboarding(null)).toBe(false);
  });

  it('returns false for non-lightweight routes', () => {
    expect(shouldRedirectToOnboarding('/app/settings')).toBe(false);
  });
});
