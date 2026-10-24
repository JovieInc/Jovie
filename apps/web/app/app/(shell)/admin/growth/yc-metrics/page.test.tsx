import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_LEGACY_REDIRECT_MAP } from '@/constants/admin-navigation';
import { APP_ROUTES } from '@/constants/routes';

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('@/lib/admin/page-access', () => ({
  requireCurrentAdminPageAccess: vi.fn().mockResolvedValue(undefined),
}));

describe('YcMetricsPage', () => {
  beforeEach(() => {
    redirectMock.mockReset();
  });

  it('redirects to the destination the legacy redirect map declares', async () => {
    const { default: YcMetricsPage } = await import('./page');
    await YcMetricsPage();

    expect(redirectMock).toHaveBeenCalledWith(
      ADMIN_LEGACY_REDIRECT_MAP[APP_ROUTES.ADMIN_GROWTH_YC_METRICS].href
    );
  });
});
