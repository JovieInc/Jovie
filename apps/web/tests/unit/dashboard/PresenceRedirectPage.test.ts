import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const {
  loadAppShellRouteContextMock,
  loadProfilesWorkspaceDataMock,
  redirectMock,
  requireAppShellDashboardUserIdMock,
} = vi.hoisted(() => ({
  loadAppShellRouteContextMock: vi.fn(),
  loadProfilesWorkspaceDataMock: vi.fn(),
  redirectMock: vi.fn(),
  requireAppShellDashboardUserIdMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
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

  it('redirects the legacy profiles route to Presence without a rollout provider', async () => {
    const { default: ProfilesPage } = await import(
      '../../../app/app/(shell)/profiles/page'
    );

    await ProfilesPage();

    expect(redirectMock).toHaveBeenCalledExactlyOnceWith(APP_ROUTES.PRESENCE);
  });

  it('redirects the legacy dashboard presence route to Presence without a rollout provider', async () => {
    const { default: LegacyPresencePage } = await import(
      '../../../app/app/(shell)/dashboard/presence/page'
    );

    await LegacyPresencePage();

    expect(redirectMock).toHaveBeenCalledExactlyOnceWith(APP_ROUTES.PRESENCE);
  });
});
