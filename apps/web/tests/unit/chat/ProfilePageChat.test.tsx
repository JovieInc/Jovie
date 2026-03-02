import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { ProfilePageChat } from '@/app/app/(shell)/dashboard/profile/ProfilePageChat';
import { fastRender } from '@/tests/utils/fast-render';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/app/dashboard/profile',
}));

vi.mock('@/components/jovie/JovieChat', () => ({
  JovieChat: (props: {
    profileId?: string;
    displayName?: string;
    avatarUrl?: string | null;
    username?: string;
  }) =>
    React.createElement('div', {
      'data-testid': 'jovie-chat',
      'data-profile-id': props.profileId,
      'data-display-name': props.displayName ?? '',
      'data-avatar-url': props.avatarUrl ?? '',
      'data-username': props.username ?? '',
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
    avatarUrl: 'https://example.com/avatar.png',
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
    totalCount: 6,
    steps: [],
  },
};

function renderProfilePageChat(data: DashboardData = baseDashboardData) {
  return fastRender(
    <DashboardDataProvider value={data}>
      <ProfilePageChat />
    </DashboardDataProvider>
  );
}

describe('ProfilePageChat', () => {
  it('passes selected profile identity props to JovieChat', () => {
    const { getByTestId } = renderProfilePageChat();

    const chat = getByTestId('jovie-chat');
    expect(chat.getAttribute('data-profile-id')).toBe('profile-1');
    expect(chat.getAttribute('data-display-name')).toBe('Test Artist');
    expect(chat.getAttribute('data-avatar-url')).toBe(
      'https://example.com/avatar.png'
    );
    expect(chat.getAttribute('data-username')).toBe('testartist');
  });

  it('shows skeleton state when no selected profile is available', () => {
    const { queryByTestId, container } = renderProfilePageChat({
      ...baseDashboardData,
      selectedProfile: null,
    });

    expect(queryByTestId('jovie-chat')).toBeNull();

    // Verify skeleton elements are rendered
    const skeletons = container.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThanOrEqual(2); // message area + input bar skeletons
  });

  it('shows error recovery UI when dashboard load error exists', () => {
    const { queryByTestId, container } = renderProfilePageChat({
      ...baseDashboardData,
      selectedProfile: null,
      dashboardLoadError: {
        stage: 'core_fetch',
        message: 'DB timeout',
        code: 'QUERY_TIMEOUT',
        errorType: 'QueryTimeoutError',
      },
    });

    expect(queryByTestId('jovie-chat')).toBeNull();

    // Should show error message, not skeleton
    expect(container.textContent).toContain(
      'We hit a problem loading your profile. Please retry in a moment.'
    );

    // Should have a retry button
    const retryButton = container.querySelector('button');
    expect(retryButton).not.toBeNull();
    expect(retryButton?.textContent).toContain('Retry');
  });
});
