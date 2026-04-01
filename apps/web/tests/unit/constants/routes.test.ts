import { describe, expect, it } from 'vitest';
import { APP_ROUTES, isDemoRoutePath } from '@/constants/routes';

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
