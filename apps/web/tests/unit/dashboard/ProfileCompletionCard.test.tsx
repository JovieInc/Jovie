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
    percentage: 60,
    completedCount: 3,
    totalCount: 4,
    steps: [
      {
        id: 'avatar',
        label: 'Add a profile photo',
        description: 'A recognizable photo makes your page feel personal.',
        href: '/app/settings/artist-profile',
      },
      {
        id: 'email',
        label: 'Add your account email',
        description:
          'Email keeps your account recoverable and mission-critical.',
        href: '/app/dashboard/earnings',
      },
    ],
    profileIsLive: false,
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

    expect(getByText('Your profile is not live yet')).toBeDefined();
    expect(getByText('Add a profile photo')).toBeDefined();
    expect(getByText('Add your account email')).toBeDefined();
  });

  it('does not crash when profileCompletion is missing', () => {
    const { queryByText } = renderCard({
      profileCompletion:
        undefined as unknown as DashboardData['profileCompletion'],
    });

    expect(queryByText(/Your profile is|not live yet/)).toBeNull();
  });

  it('shows percentage messaging when profile is live', () => {
    const { getByText } = renderCard({
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
        profileIsLive: true,
      },
    });

    expect(getByText('Your profile is 80% complete')).toBeDefined();
  });

  it('hides dismiss button when profile is not live', () => {
    const { queryByLabelText } = renderCard();

    expect(queryByLabelText('Dismiss profile completion card')).toBeNull();
  });

  it('does not render when profile is fully complete', () => {
    const { queryByText } = renderCard({
      profileCompletion: {
        percentage: 100,
        completedCount: 4,
        totalCount: 4,
        steps: [],
        profileIsLive: false,
      },
    });

    expect(queryByText(/Your profile is/)).toBeNull();
  });
});
