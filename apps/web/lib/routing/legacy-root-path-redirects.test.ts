import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  LEGACY_ROOT_PATH_REDIRECTS,
  resolveLegacyRootPathRedirect,
} from './legacy-root-path-redirects';

describe('legacy root path redirects (JOV-3054)', () => {
  it('maps /login to the canonical sign-in route', () => {
    expect(LEGACY_ROOT_PATH_REDIRECTS['/login']).toBe(APP_ROUTES.SIGNIN);
    expect(resolveLegacyRootPathRedirect('/login')).toBe(APP_ROUTES.SIGNIN);
  });

  it('maps /request-access to the onboarding front door', () => {
    expect(LEGACY_ROOT_PATH_REDIRECTS['/request-access']).toBe(
      APP_ROUTES.START
    );
    expect(resolveLegacyRootPathRedirect('/request-access')).toBe(
      APP_ROUTES.START
    );
  });

  it('returns null for unrelated paths', () => {
    expect(resolveLegacyRootPathRedirect('/signin')).toBeNull();
    expect(resolveLegacyRootPathRedirect('/timwhite')).toBeNull();
  });
});
