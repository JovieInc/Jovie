import { describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { HeaderProfileProgress } from '@/components/dashboard/atoms/HeaderProfileProgress';
import { fastRender } from '@/tests/utils/fast-render';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const baseDashboardData: DashboardData = {
  user: { id: 'user_123' },
  creatorProfiles: [],
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
  profileCompletion: {
    percentage: 57,
    completedCount: 4,
    totalCount: 7,
    steps: [
      {
        id: 'avatar',
        label: 'Add a profile photo',
        description: 'A recognizable photo makes your page feel personal.',
        href: '/app/settings/artist-profile',
      },
    ],
  },
};

function renderProgress(overrides: Partial<DashboardData> = {}) {
  return fastRender(
    <DashboardDataProvider value={{ ...baseDashboardData, ...overrides }}>
      <HeaderProfileProgress />
    </DashboardDataProvider>
  );
}

describe('HeaderProfileProgress', () => {
  it('renders progress when profile setup is incomplete', () => {
    const { getByLabelText, getByText } = renderProgress();

    expect(getByLabelText(/Profile 57% complete/)).toBeDefined();
    expect(getByText('57%')).toBeDefined();
  });

  it('does not crash when profileCompletion is missing', () => {
    const { queryByRole } = renderProgress({
      profileCompletion:
        undefined as unknown as DashboardData['profileCompletion'],
    });

    expect(queryByRole('button')).toBeNull();
  });
});
