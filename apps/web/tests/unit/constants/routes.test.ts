import { describe, expect, it } from 'vitest';
import {
  APP_ROUTES,
  buildReleaseTasksRoute,
  isDemoRoutePath,
} from '@/constants/routes';

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
