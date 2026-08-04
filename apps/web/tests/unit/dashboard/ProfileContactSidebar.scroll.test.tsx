import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileContactSidebar } from '@/features/dashboard/organisms/profile-contact-sidebar/ProfileContactSidebar';

const mockState = vi.hoisted(() => ({
  close: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  setPreviewData: vi.fn(),
  previewData: {
    username: 'tim',
    displayName: 'Tim White',
    avatarUrl: null,
    bio: 'Bio',
    genres: ['pop'],
    location: 'Los Angeles, CA',
    hometown: 'New Brunswick, NJ',
    activeSinceYear: 2019,
    links: [],
    profilePath: '/tim',
    dspConnections: {
      spotify: {
        connected: true,
        artistName: 'Tim White',
      },
      appleMusic: {
        connected: false,
        artistName: null,
      },
    },
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/dashboard/profile',
  useRouter: () => ({
    push: mockState.push,
    replace: mockState.replace,
  }),
  useSearchParams: () => ({
    get: () => null,
    toString: () => '',
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  DashboardDataContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
    Consumer: () => null,
    displayName: 'DashboardDataContext',
  },
  useDashboardData: () => ({
    selectedProfile: {
      id: 'profile-1',
      settings: {},
    },
  }),
}));

vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  usePreviewPanelState: () => ({
    isOpen: true,
    close: mockState.close,
  }),
  usePreviewPanelData: () => ({
    previewData: mockState.previewData,
    setPreviewData: mockState.setPreviewData,
  }),
}));

vi.mock('@/components/organisms/profile-sidebar/ProfileSidebarHeader', () => ({
  useProfileHeaderParts: () => ({
    overflowActions: [],
  }),
}));

vi.mock('@/lib/queries', () => ({
  useDeletePressPhotoMutation: () => ({
    mutateAsync: vi.fn(),
  }),
  useDashboardAnalyticsQuery: () => ({
    data: {
      profile_views: 0,
      total_clicks: 0,
    },
    isLoading: false,
    isFetching: false,
    isError: false,
  }),
  useDspMatchesQuery: () => ({
    data: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  usePressPhotosQuery: () => ({
    data: [],
  }),
  usePressPhotoUploadMutation: () => ({
    mutateAsync: vi.fn(),
  }),
  useProfileMonetizationSummary: () => ({
    data: null,
  }),
  useProfileSaveMutation: () => ({
    mutate: vi.fn(),
  }),
  useRemoveSocialLinkMutation: () => ({
    mutate: vi.fn(),
  }),
}));

vi.mock('@/features/dashboard/organisms/dsp-matches/hooks', () => ({
  useDspMatchActions: () => ({
    confirmMatch: vi.fn(),
    rejectMatch: vi.fn(),
    isMatchConfirming: () => false,
    isMatchRejecting: () => false,
  }),
}));

describe('ProfileContactSidebar scroll contract', () => {
  beforeEach(() => {
    mockState.close.mockReset();
    mockState.push.mockReset();
  });

  it('uses a compact read-only summary instead of mounting the phone preview', () => {
    render(<ProfileContactSidebar />);

    expect(screen.getByTestId('profile-preview-summary')).toBeInTheDocument();
    expect(
      screen.getByTestId('profile-preview-entity-header')
    ).toHaveTextContent('Tim White');
    expect(screen.getByTestId('profile-preview-summary')).toHaveClass(
      'min-h-0',
      'overflow-x-hidden',
      'overflow-y-auto'
    );
    expect(
      screen.getByTestId('profile-smart-link-control')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Manage In Presence' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Your Live Profile')).toBeNull();
  });

  it('hands profile management back to Presence and closes the chat rail', () => {
    render(<ProfileContactSidebar />);

    fireEvent.click(screen.getByRole('button', { name: 'Manage In Presence' }));

    expect(mockState.close).toHaveBeenCalledTimes(1);
    expect(mockState.push).toHaveBeenCalledWith('/app/profiles');
  });
});
