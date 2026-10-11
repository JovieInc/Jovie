import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const {
  getAppFlagValueMock,
  loadAppShellRouteContextMock,
  loadProfilesWorkspaceDataMock,
  redirectMock,
  requireAppShellDashboardUserIdMock,
} = vi.hoisted(() => ({
  getAppFlagValueMock: vi.fn(),
  loadAppShellRouteContextMock: vi.fn(),
  loadProfilesWorkspaceDataMock: vi.fn(),
  redirectMock: vi.fn(),
  requireAppShellDashboardUserIdMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('@/lib/flags/server', () => ({
  getAppFlagValue: getAppFlagValueMock,
}));

vi.mock('@/app/app/(shell)/app-shell-route-context', () => ({
  loadAppShellRouteContext: loadAppShellRouteContextMock,
  requireAppShellDashboardUserId: requireAppShellDashboardUserIdMock,
}));

vi.mock('@/app/app/(shell)/profiles/data', () => ({
  loadProfilesWorkspaceData: loadProfilesWorkspaceDataMock,
}));

vi.mock('@/app/app/(shell)/profiles/ProfilesWorkspace', () => ({
  ProfilesWorkspace: () => null,
}));

describe('Presence route separation', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders Presence from the active identity context', async () => {
    loadAppShellRouteContextMock.mockResolvedValue({
      ok: true,
      userId: 'clerk-user',
      dashboardData: { user: { id: 'database-user' } },
      activeIdentityId: 'identity-1',
      profileId: 'identity-1',
    });
    requireAppShellDashboardUserIdMock.mockReturnValue('database-user');
    loadProfilesWorkspaceDataMock.mockResolvedValue({
      profileId: 'identity-1',
    });
    const { default: PresencePage } = await import(
      '../../../app/app/(shell)/presence/page'
    );

    const result = (await PresencePage()) as {
      readonly props: {
        readonly data: { readonly profileId: string };
      };
    };

    expect(loadAppShellRouteContextMock).toHaveBeenCalledWith(
      expect.objectContaining({ route: APP_ROUTES.PRESENCE })
    );
    expect(loadProfilesWorkspaceDataMock).toHaveBeenCalledWith({
      clerkUserId: 'clerk-user',
      databaseUserId: 'database-user',
      profileId: 'identity-1',
    });
    expect(result.props.data.profileId).toBe('identity-1');
  });

  it('redirects the legacy profiles route to Presence', async () => {
    getAppFlagValueMock.mockResolvedValue(true);
    const { default: ProfilesPage } = await import(
      '../../../app/app/(shell)/profiles/page'
    );

    await ProfilesPage();

    expect(redirectMock).toHaveBeenCalledWith(APP_ROUTES.PRESENCE);
  });

  it('redirects the legacy dashboard presence route to Presence', async () => {
    getAppFlagValueMock.mockResolvedValue(true);
    const { default: LegacyPresencePage } = await import(
      '../../../app/app/(shell)/dashboard/presence/page'
    );

    await LegacyPresencePage();

    expect(redirectMock).toHaveBeenCalledWith(APP_ROUTES.PRESENCE);
  });

  it('keeps both compatibility routes on the ungated settings fallback', async () => {
    getAppFlagValueMock.mockResolvedValue(false);
    const [{ default: ProfilesPage }, { default: LegacyPresencePage }] =
      await Promise.all([
        import('../../../app/app/(shell)/profiles/page'),
        import('../../../app/app/(shell)/dashboard/presence/page'),
      ]);

    await ProfilesPage();
    await LegacyPresencePage();

    expect(redirectMock).toHaveBeenNthCalledWith(
      1,
      `${APP_ROUTES.SETTINGS_PROFILE}?tab=music`
    );
    expect(redirectMock).toHaveBeenNthCalledWith(
      2,
      `${APP_ROUTES.SETTINGS_PROFILE}?tab=music`
    );
  });
});
