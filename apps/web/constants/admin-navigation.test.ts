import {
  getRedirectUrl,
  unstable_getResponseFromNextConfig,
} from 'next/experimental/testing/server';
import { describe, expect, it } from 'vitest';
import {
  ADMIN_LEGACY_REDIRECT_MAP,
  ADMIN_NAV_REGISTRY,
  ADMIN_SETTINGS_TOOL_IDS,
} from './admin-navigation';
import { APP_ROUTES } from './routes';

describe('founder certification navigation', () => {
  it('offers one certification workspace without flag or registry review tools', () => {
    expect(
      ADMIN_NAV_REGISTRY.find(item => item.id === 'certifications')?.href
    ).toBe(APP_ROUTES.ADMIN_CERTIFICATIONS);
    for (const id of ['feature_registry', 'features']) {
      expect(ADMIN_SETTINGS_TOOL_IDS).not.toContain(id);
      expect(ADMIN_NAV_REGISTRY.some(item => item.id === id)).toBe(false);
    }
  });
});

describe('Ovie Inbox navigation', () => {
  it('folds the legacy Needs You workspace into Inbox', () => {
    expect(ADMIN_LEGACY_REDIRECT_MAP[APP_ROUTES.ADMIN_NEEDS_YOU]).toEqual({
      workspace: 'inbox',
      href: APP_ROUTES.ADMIN_INBOX,
    });
  });

  it.each([APP_ROUTES.ADMIN_NEEDS_YOU, '/app/admin/needs-you'])(
    'redirects %s to Inbox while retaining the requested decision',
    async pathname => {
      const nextConfigModule = await import('../next.config.js');
      const nextConfig = nextConfigModule.default ?? nextConfigModule;
      const response = await unstable_getResponseFromNextConfig({
        url: `https://jov.ie${pathname}?case=decision-123`,
        nextConfig: { redirects: nextConfig.redirects },
      });
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response)).toBe(
        `https://jov.ie${APP_ROUTES.ADMIN_INBOX}?case=decision-123`
      );
    }
  );
});
