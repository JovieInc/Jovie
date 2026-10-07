import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  load: vi.fn(),
}));

vi.mock('@/lib/admin/page-access', () => ({
  requireCurrentAdminPageAccess: mocks.requireAccess,
}));

vi.mock('@/lib/ovie/company-presence/load.server', () => ({
  loadCompanyPresenceData: mocks.load,
}));

vi.mock('./CompanyPresenceWorkspace', () => ({
  CompanyPresenceWorkspace: () => null,
}));

import { APP_ROUTES } from '@/constants/routes';
import AdminPresencePage from './page';

describe('AdminPresencePage', () => {
  beforeEach(() => {
    mocks.requireAccess.mockReset();
    mocks.load.mockReset();
  });

  it('lives under the Ovie route prefix', () => {
    expect(APP_ROUTES.ADMIN_PRESENCE).toBe(`${APP_ROUTES.OV}/presence`);
  });

  it('never loads company data for non-admins', async () => {
    mocks.requireAccess.mockRejectedValue(new Error('NEXT_REDIRECT'));
    await expect(AdminPresencePage()).rejects.toThrow('NEXT_REDIRECT');
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('awaits the privacy gate before any company loader work', async () => {
    mocks.requireAccess.mockRejectedValue(new Error('OVIE_PRIVACY_LOCKED'));
    await expect(AdminPresencePage()).rejects.toThrow('OVIE_PRIVACY_LOCKED');
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('loads company presence data for admins', async () => {
    const data = { pages: [], sources: [], profilesUnavailable: false };
    mocks.requireAccess.mockResolvedValue('admin-user');
    mocks.load.mockResolvedValue(data);

    const element = await AdminPresencePage();
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(element.props).toEqual({
      data,
      scope: {
        actorId: 'admin-user',
        workspaceId: 'jovie-company',
        target: 'company',
      },
    });
  });
});
