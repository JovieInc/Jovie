import { describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { ProfileCompletionRedirect } from '@/app/app/(shell)/ProfileCompletionRedirect';
import { fastRender } from '@/tests/utils/fast-render';

const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

const baseDashboardData: DashboardData = {
  user: { id: 'user_123' },
  creatorProfiles: [
    {
      id: 'profile-1',
      displayName: 'Test Artist',
      username: 'testartist',
    } as DashboardData['creatorProfiles'][0],
  ],
  selectedProfile: {
    id: 'profile-1',
    displayName: 'Test Artist',
    username: 'testartist',
    usernameNormalized: 'testartist',
    avatarUrl: 'https://example.com/avatar.jpg',
    isPublic: true,
    onboardingCompletedAt: new Date('2026-03-19T17:56:33.757Z'),
  } as DashboardData['selectedProfile'],
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: false,
  hasMusicLinks: false,
  isAdmin: false,
  tippingStats: {
    tipClicks: 0,
    qrTipClicks: 0,
    linkTipClicks: 0,
    tipsSubmitted: 0,
    totalReceivedCents: 0,
    monthReceivedCents: 0,
  },
  profileCompletion: {
    percentage: 40,
    completedCount: 2,
    totalCount: 5,
    steps: [],
    profileIsLive: false,
  },
};

function renderGuard(value: DashboardData) {
  return fastRender(
    <DashboardDataProvider value={value}>
      <ProfileCompletionRedirect />
    </DashboardDataProvider>
  );
}

describe('ProfileCompletionRedirect', () => {
  it('does not redirect when onboarding is complete', () => {
    mockReplace.mockClear();
    renderGuard(baseDashboardData);

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects when selected profile is missing', () => {
    mockReplace.mockClear();
    renderGuard({ ...baseDashboardData, selectedProfile: null });

    expect(mockReplace).toHaveBeenCalledWith('/onboarding');
  });

  it('redirects when needsOnboarding is true', () => {
    mockReplace.mockClear();
    renderGuard({
      ...baseDashboardData,
      needsOnboarding: true,
    });

    expect(mockReplace).toHaveBeenCalledWith('/onboarding');
  });

  it('does NOT redirect when avatar URL is blank (avatar is soft requirement)', () => {
    mockReplace.mockClear();
    renderGuard({
      ...baseDashboardData,
      selectedProfile: {
        ...baseDashboardData.selectedProfile!,
        avatarUrl: null,
      },
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does NOT redirect when selectedProfile is null due to dashboardLoadError', () => {
    mockReplace.mockClear();
    renderGuard({
      ...baseDashboardData,
      selectedProfile: null,
      dashboardLoadError: {
        stage: 'core_fetch',
        message: 'QueryTimeoutError: timed out',
        code: 'QUERY_TIMEOUT',
        errorType: 'QueryTimeoutError',
      },
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does NOT redirect when selectedProfile is null due to cache error', () => {
    mockReplace.mockClear();
    renderGuard({
      ...baseDashboardData,
      selectedProfile: null,
      dashboardLoadError: {
        stage: 'core_cache',
        message: 'Connection terminated unexpectedly',
        code: null,
        errorType: 'NeonDbError',
      },
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('still redirects when profile is genuinely missing (no error)', () => {
    mockReplace.mockClear();
    renderGuard({
      ...baseDashboardData,
      selectedProfile: null,
      dashboardLoadError: undefined,
    });

    expect(mockReplace).toHaveBeenCalledWith('/onboarding');
  });

  it('does NOT redirect admins when their profile is incomplete', () => {
    mockReplace.mockClear();
    renderGuard({
      ...baseDashboardData,
      isAdmin: true,
      selectedProfile: {
        ...baseDashboardData.selectedProfile!,
        isPublic: false,
      },
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });
});
