import { describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { ProfileCompletionCard } from '@/components/dashboard/molecules/ProfileCompletionCard';
import { fastRender } from '@/tests/utils/fast-render';

vi.mock('@/lib/error-tracking', () => ({
  captureWarning: vi.fn(),
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
      {
        id: 'tip-jar',
        label: 'Set up your tip jar',
        description: 'Turn attention into support with a fast tipping link.',
        href: '/app/dashboard/earnings',
      },
    ],
  },
};

function renderCard(overrides: Partial<DashboardData> = {}) {
  return fastRender(
    <DashboardDataProvider value={{ ...baseDashboardData, ...overrides }}>
      <ProfileCompletionCard />
    </DashboardDataProvider>
  );
}

describe('ProfileCompletionCard', () => {
  it('renders progress and next steps when profile is incomplete', () => {
    const { getByText } = renderCard();

    expect(getByText('Your profile is 57% complete')).toBeDefined();
    expect(getByText('Add a profile photo')).toBeDefined();
    expect(getByText('Set up your tip jar')).toBeDefined();
  });

  it('does not crash when profileCompletion is missing', () => {
    const { queryByText } = renderCard({
      profileCompletion:
        undefined as unknown as DashboardData['profileCompletion'],
    });

    expect(queryByText(/Your profile is/)).toBeNull();
  });

  it('does not render when profile is fully complete', () => {
    const { queryByText } = renderCard({
      profileCompletion: {
        percentage: 100,
        completedCount: 7,
        totalCount: 7,
        steps: [],
      },
    });

    expect(queryByText(/Your profile is/)).toBeNull();
  });
});
