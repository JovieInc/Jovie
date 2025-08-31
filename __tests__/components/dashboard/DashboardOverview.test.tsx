import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/dashboard/actions';

vi.mock('@/app/dashboard/actions', () => ({
  getDashboardData: vi.fn(),
}));

import { DashboardOverview } from '@/components/dashboard/DashboardOverview';

vi.mock('@/components/dashboard/organisms/DashboardSplitView', () => ({
  DashboardSplitView: ({ artist }: any) => (
    <div data-testid='split-view'>{artist.name}</div>
  ),
}));

describe('DashboardOverview profile switching', () => {
  const profile1 = {
    id: 'profile-1',
    userId: 'user-1',
    username: 'artist-one',
    usernameNormalized: 'artist-one',
    displayName: 'Artist One',
    avatarUrl: null,
    bio: null,
    theme: null,
    settings: {},
    spotifyId: null,
    spotifyUrl: null,
    appleMusicUrl: null,
    youtubeUrl: null,
    isPublic: true,
    isVerified: false,
    isFeatured: false,
    marketingOptOut: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as const;

  const profile2 = {
    ...profile1,
    id: 'profile-2',
    username: 'artist-two',
    usernameNormalized: 'artist-two',
    displayName: 'Artist Two',
  } as const;

  const initialData: DashboardData = {
    user: { id: 'user-1' },
    creatorProfiles: [profile1, profile2],
    selectedProfile: profile1,
    needsOnboarding: false,
    sidebarCollapsed: false,
  };

  it('switches between profiles using the selector', () => {
    render(<DashboardOverview initialData={initialData} />);

    expect(screen.getByText('Welcome back, Artist One')).toBeInTheDocument();

    const selector = screen.getByLabelText('Select profile');
    fireEvent.change(selector, { target: { value: 'profile-2' } });

    expect(screen.getByText('Welcome back, Artist Two')).toBeInTheDocument();
    expect(screen.getByTestId('split-view').textContent).toBe('Artist Two');
  });
});
