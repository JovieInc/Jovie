import { describe, expect, it } from 'vitest';
import {
  APP_ROUTES,
  buildLyricsRoute,
  buildReleaseTasksRoute,
  isDemoRoutePath,
  resolveLyricsReturnRoute,
} from '@/constants/routes';

describe('buildLyricsRoute', () => {
  it('builds the canonical lyrics path', () => {
    expect(buildLyricsRoute('track_1')).toBe('/app/lyrics/track_1');
  });

  it('encodes track ids and preserves a valid shell return route', () => {
    expect(
      buildLyricsRoute('track 1/alt', {
        from: '/app/chat/thread-1?panel=profile',
      })
    ).toBe(
      '/app/lyrics/track%201%2Falt?from=%2Fapp%2Fchat%2Fthread-1%3Fpanel%3Dprofile'
    );
  });

  it('drops invalid or self-referential return routes', () => {
    expect(
      buildLyricsRoute('track_1', {
        from: '/app/lyrics/track_2?from=%2Fapp%2Fchat',
      })
    ).toBe('/app/lyrics/track_1');
    expect(
      buildLyricsRoute('track_1', {
        from: 'https://example.com/phish',
      })
    ).toBe('/app/lyrics/track_1');
  });
});

describe('buildReleaseTasksRoute', () => {
  it('builds the canonical release tasks path', () => {
    expect(buildReleaseTasksRoute('release_1')).toBe(
      '/app/releases/release_1/tasks'
    );
  });

  it('encodes release ids for path-safe navigation', () => {
    expect(buildReleaseTasksRoute('release 1/alt')).toBe(
      '/app/releases/release%201%2Falt/tasks'
    );
  });
});

describe('resolveLyricsReturnRoute', () => {
  it('returns a safe in-app fallback when the route is missing or invalid', () => {
    expect(resolveLyricsReturnRoute(null)).toBe(APP_ROUTES.LIBRARY);
    expect(resolveLyricsReturnRoute('/app/lyrics/track-1')).toBe(
      APP_ROUTES.LIBRARY
    );
    expect(resolveLyricsReturnRoute('https://example.com/phish')).toBe(
      APP_ROUTES.LIBRARY
    );
  });

  it('preserves valid non-lyrics app routes with search params', () => {
    expect(resolveLyricsReturnRoute('/app/chat/thread-1?panel=profile')).toBe(
      '/app/chat/thread-1?panel=profile'
    );
  });
});

describe('isDemoRoutePath', () => {
  it('matches the demo landing route', () => {
    expect(isDemoRoutePath(APP_ROUTES.DEMO)).toBe(true);
  });

  it('matches nested demo showcase routes', () => {
    expect(isDemoRoutePath('/demo/showcase/settings')).toBe(true);
    expect(isDemoRoutePath('/demo/onboarding')).toBe(true);
  });

  it('rejects non-demo routes', () => {
    expect(isDemoRoutePath(APP_ROUTES.DASHBOARD)).toBe(false);
    expect(isDemoRoutePath('/onboarding')).toBe(false);
    expect(isDemoRoutePath(null)).toBe(false);
  });
});
