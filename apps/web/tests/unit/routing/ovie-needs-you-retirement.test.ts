// @vitest-environment node

import { unstable_getResponseFromNextConfig } from 'next/experimental/testing/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const { requireAccess, requirePrivacyUnlock, renderHome } = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  requirePrivacyUnlock: vi.fn(),
  renderHome: vi.fn(() => 'Ovie Home'),
}));

vi.mock('@/lib/admin/page-access', () => ({
  requireCurrentAdminPageAccess: requireAccess,
}));
vi.mock('@/lib/ovie/privacy-lock/server', () => ({
  assertOviePrivacyUnlocked: requirePrivacyUnlock,
}));
vi.mock('@/app/app/(shell)/admin/chat/page', () => ({
  default: renderHome,
  metadata: {},
}));

import AdminHomePage from '@/app/app/(shell)/admin/page';

describe('Needs You retirement into Ovie Home', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAccess.mockResolvedValue('admin');
    requirePrivacyUnlock.mockResolvedValue(undefined);
  });

  it.each([APP_ROUTES.ADMIN_NEEDS_YOU, `${APP_ROUTES.LEGACY_ADMIN}/needs-you`])(
    'redirects %s directly to Home and preserves query parameters',
    async source => {
      const nextConfigModule = await import('../../../next.config.js');
      const nextConfig = nextConfigModule.default ?? nextConfigModule;
      const query = '?from=legacy';
      const response = await unstable_getResponseFromNextConfig({
        url: `https://jov.ie${source}${query}`,
        nextConfig: { redirects: nextConfig.redirects },
      });

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        `https://jov.ie${APP_ROUTES.OV}${query}`
      );
    }
  );

  it('rejects non-admins before checking privacy or rendering Home', async () => {
    requireAccess.mockRejectedValue(new Error('FORBIDDEN'));

    await expect(AdminHomePage()).rejects.toThrow('FORBIDDEN');

    expect(requirePrivacyUnlock).not.toHaveBeenCalled();
    expect(renderHome).not.toHaveBeenCalled();
  });

  it('rejects a locked admin before rendering Home', async () => {
    requirePrivacyUnlock.mockRejectedValue(new Error('LOCKED'));

    await expect(AdminHomePage()).rejects.toThrow('LOCKED');

    expect(requireAccess).toHaveBeenCalledOnce();
    expect(renderHome).not.toHaveBeenCalled();
  });

  it('renders the canonical Home after admin access and privacy unlock', async () => {
    await expect(AdminHomePage()).resolves.toBe('Ovie Home');

    expect(requireAccess).toHaveBeenCalledOnce();
    expect(requirePrivacyUnlock).toHaveBeenCalledOnce();
    expect(renderHome).toHaveBeenCalledOnce();
  });
});
