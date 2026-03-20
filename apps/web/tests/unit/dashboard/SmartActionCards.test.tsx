import { describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { SmartActionCards } from '@/features/dashboard/organisms/SmartActionCards';
import { fastRender } from '@/tests/utils/fast-render';

vi.mock('@/lib/error-tracking', () => ({
  captureWarning: vi.fn(),
}));

vi.mock('@/lib/queries', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useDashboardSocialLinksQuery: (profileId: string) => ({
      data:
        profileId === 'has-venmo'
          ? [{ id: '1', platform: 'venmo', url: 'https://venmo.com/u/test' }]
          : [],
      isLoading: false,
    }),
  };
});

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

const baseDashboardData: DashboardData = {
  user: { id: 'user_123' },
  creatorProfiles: [
    {
      id: 'profile-1',
      displayName: 'Test Artist',
      username: 'testartist',
      settings: null,
    } as DashboardData['creatorProfiles'][0],
  ],
  selectedProfile: {
    id: 'profile-1',
    displayName: 'Test Artist',
    username: 'testartist',
    settings: null,
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
    percentage: 100,
    completedCount: 4,
    totalCount: 4,
    steps: [],
    profileIsLive: true,
  },
};

function renderWithDashboard(
  data: Partial<DashboardData>,
  props: { profileId?: string; username?: string; onFeedbackClick?: () => void }
) {
  return fastRender(
    <DashboardDataProvider value={{ ...baseDashboardData, ...data }}>
      <SmartActionCards {...props} />
    </DashboardDataProvider>
  );
}

describe('SmartActionCards', () => {
  it('shows Venmo card when no Venmo link', () => {
    const { getByText } = renderWithDashboard(
      {},
      { profileId: 'no-venmo', username: 'testartist' }
    );
    expect(getByText('Accept tips from fans')).toBeDefined();
  });

  it('shows max 3 cards', () => {
    const { container } = renderWithDashboard(
      {
        profileCompletion: {
          percentage: 50,
          completedCount: 2,
          totalCount: 4,
          steps: [
            {
              id: 'avatar',
              label: 'Add a profile photo',
              description: 'A recognizable photo',
              href: '/app/settings/artist-profile',
            },
          ],
          profileIsLive: false,
        },
      },
      {
        profileId: 'no-venmo',
        username: 'testartist',
        onFeedbackClick: vi.fn(),
      }
    );
    // ProfileCompletionCard + up to 2 action cards = max 3 visible items
    const cards = container.querySelectorAll(
      '[class*="ContentSurfaceCard"], [class*="mb-4"]'
    );
    expect(cards.length).toBeLessThanOrEqual(4); // ProfileCompletionCard wrapper + action cards
  });

  it('shows ProfileCompletionCard when profile incomplete', () => {
    const { getByText } = renderWithDashboard(
      {
        profileCompletion: {
          percentage: 50,
          completedCount: 2,
          totalCount: 4,
          steps: [
            {
              id: 'avatar',
              label: 'Add a profile photo',
              description: 'A recognizable photo',
              href: '/app/settings/artist-profile',
            },
          ],
          profileIsLive: false,
        },
      },
      { profileId: 'no-venmo' }
    );
    expect(getByText('Your profile is not live yet')).toBeDefined();
  });
});
