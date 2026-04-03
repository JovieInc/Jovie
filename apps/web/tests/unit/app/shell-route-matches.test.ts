import { describe, expect, it } from 'vitest';
import {
  isReleasesShellRoute,
  resolveAppShellRequestPath,
} from '@/app/app/(shell)/shell-route-matches';

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

  it('accepts absolute header values', () => {
    expect(
      resolveAppShellRequestPath(
        null,
        'https://jov.ie/app/dashboard/releases?tab=links'
      )
    ).toBe('/app/dashboard/releases');
  });

  it('returns null when no path-like header is present', () => {
    expect(resolveAppShellRequestPath(null, null)).toBeNull();
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
