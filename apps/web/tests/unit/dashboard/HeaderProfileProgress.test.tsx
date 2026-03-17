import { describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { HeaderProfileProgress } from '@/features/dashboard/atoms/HeaderProfileProgress';
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
    percentage: 80,
    completedCount: 4,
    totalCount: 4,
    steps: [
      {
        id: 'avatar',
        label: 'Add a profile photo',
        description: 'A recognizable photo makes your page feel personal.',
        href: '/app/settings/artist-profile',
      },
    ],
    profileIsLive: false,
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

    expect(getByLabelText(/Profile 80% complete/)).toBeDefined();
    expect(getByText('80%')).toBeDefined();
  });

  it('uses design token classes for compact ring styling', () => {
    const { container } = renderProgress();

    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('20');
    expect(svg?.getAttribute('height')).toBe('20');

    const circles = container.querySelectorAll('circle');
    expect(circles).toHaveLength(2);
    expect(circles[0]?.getAttribute('class')).toContain('text-border-subtle');
    expect(circles[1]?.getAttribute('class')).toContain('text-accent');
  });

  it('returns null when completionPercentage >= 100', () => {
    const { container } = renderProgress({
      profileCompletion: {
        ...baseDashboardData.profileCompletion,
        percentage: 100,
      },
    });

    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
  });

  it('does not crash when profileCompletion is missing', () => {
    const { queryByRole } = renderProgress({
      profileCompletion:
        undefined as unknown as DashboardData['profileCompletion'],
    });

    expect(queryByRole('button')).toBeNull();
  });
});
