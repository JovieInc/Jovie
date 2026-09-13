import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUserEntitlementsMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: getCurrentUserEntitlementsMock,
}));

import { resolveAppShellModeFromPathname } from '@/lib/app-shell/mode';
import {
  APP_SHELL_WORKSPACES,
  canAccessAppShellWorkspace,
} from '@/lib/app-shell/workspaces';
import { requireAdminHudApiAccess } from './require-admin-hud-api';

describe('requireAdminHudApiAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects anonymous requests with a non-cacheable 401', async () => {
    getCurrentUserEntitlementsMock.mockResolvedValue({
      isAuthenticated: false,
      isAdmin: false,
    });

    const response = await requireAdminHudApiAccess();

    expect(response?.status).toBe(401);
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    await expect(response?.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('rejects authenticated customer users with a non-cacheable 403', async () => {
    getCurrentUserEntitlementsMock.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: false,
    });

    const response = await requireAdminHudApiAccess();

    expect(response?.status).toBe(403);
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    await expect(response?.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('admits an authenticated admin and returns no denial response', async () => {
    getCurrentUserEntitlementsMock.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: true,
    });

    await expect(requireAdminHudApiAccess()).resolves.toBeNull();
    expect(getCurrentUserEntitlementsMock).toHaveBeenCalledOnce();
  });
});

describe('Ovie app-mode ownership', () => {
  it('keeps customer and Ovie routes distinct and role-gates the Ovie workspace', () => {
    expect(resolveAppShellModeFromPathname('/app')).toBe('customer');
    expect(resolveAppShellModeFromPathname('/app/ov/people')).toBe('ov');

    const ovWorkspace = APP_SHELL_WORKSPACES.find(
      workspace => workspace.id === 'ov'
    );
    if (!ovWorkspace) throw new Error('Ovie workspace contract missing');

    expect(canAccessAppShellWorkspace(ovWorkspace, { isAdmin: false })).toBe(
      false
    );
    expect(canAccessAppShellWorkspace(ovWorkspace, { isAdmin: true })).toBe(
      true
    );
  });
});
