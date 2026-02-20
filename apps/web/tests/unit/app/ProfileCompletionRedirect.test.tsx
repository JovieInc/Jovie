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
};

function renderGuard(value: DashboardData) {
  return fastRender(
    <DashboardDataProvider value={value}>
      <ProfileCompletionRedirect />
    </DashboardDataProvider>
  );
}

describe('ProfileCompletionRedirect', () => {
  it('does not redirect when profile has both username and display name', () => {
    mockReplace.mockClear();
    renderGuard(baseDashboardData);

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects when selected profile is missing', () => {
    mockReplace.mockClear();
    renderGuard({ ...baseDashboardData, selectedProfile: null });

    expect(mockReplace).toHaveBeenCalledWith('/onboarding');
  });

  it('redirects when username is blank', () => {
    mockReplace.mockClear();
    renderGuard({
      ...baseDashboardData,
      selectedProfile: {
        ...baseDashboardData.selectedProfile!,
        username: '   ',
      },
    });

    expect(mockReplace).toHaveBeenCalledWith('/onboarding');
  });

  it('redirects when display name is blank', () => {
    mockReplace.mockClear();
    renderGuard({
      ...baseDashboardData,
      selectedProfile: {
        ...baseDashboardData.selectedProfile!,
        displayName: '   ',
      },
    });

    expect(mockReplace).toHaveBeenCalledWith('/onboarding');
  });
});
