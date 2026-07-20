import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileContactSidebar } from '@/features/dashboard/organisms/profile-contact-sidebar/ProfileContactSidebar';

const mockState = vi.hoisted(() => ({
  close: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  setPreviewData: vi.fn(),
  refetchDspMatches: vi.fn(),
  dspMatches: [] as Record<string, unknown>[],
  dspMatchesLoading: false,
  dspMatchesError: null as Error | null,
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
    data: mockState.dspMatches,
    isLoading: mockState.dspMatchesLoading,
    error: mockState.dspMatchesError,
    refetch: mockState.refetchDspMatches,
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

const suggestedMatch = {
  id: 'match-1',
  providerId: 'deezer',
  externalArtistName: 'Tim White',
  externalArtistUrl: null,
  externalArtistImageUrl: null,
  confidenceScore: 0.92,
  matchingIsrcCount: 12,
};

describe('ProfileContactSidebar scroll contract', () => {
  beforeEach(() => {
    mockState.dspMatches = [];
    mockState.dspMatchesLoading = false;
    mockState.dspMatchesError = null;
    mockState.refetchDspMatches.mockReset();
  });

  it('uses child-owned scrolling without the legacy full-height wrapper', () => {
    const { container } = render(<ProfileContactSidebar />);

    // The rail opens in the preview (bento) mode; the editing tabs live behind
    // the "Edit profile" button.
    fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));

    const shellBody = container.querySelector('[data-scroll-strategy="child"]');
    const tabbedCard = screen.getByTestId('profile-contact-tabbed-card');
    const scrollRegion = screen.getByTestId(
      'profile-contact-tabbed-card-scroll-region'
    );

    expect(shellBody).toBeInTheDocument();
    expect(shellBody).not.toHaveClass('overflow-y-auto');
    expect(tabbedCard.closest('.min-h-full')).toBeNull();
    expect(scrollRegion).toHaveAttribute('data-scroll-mode', 'internal');
    expect(scrollRegion).toHaveClass('overflow-y-auto');
  });

  it('keeps loading, empty, populated, and error suggestion transitions at the fixed scroll tail', () => {
    mockState.dspMatchesLoading = true;

    const view = render(<ProfileContactSidebar />);
    fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));
    fireEvent.click(screen.getByTestId('drawer-tab-dsp'));
    fireEvent.click(screen.getByRole('button', { name: 'Add Music link' }));

    const tabbedCard = screen.getByTestId('profile-contact-tabbed-card');
    const scrollRegion = screen.getByTestId(
      'profile-contact-tabbed-card-scroll-region'
    );
    const linkInput = screen.getByRole('textbox', { name: 'Add link' });
    expect(tabbedCard).toHaveClass('min-h-0', 'flex-1', 'overflow-hidden');
    const rerenderState = () => {
      view.rerender(<ProfileContactSidebar />);
      expect(
        screen.getByTestId('profile-contact-tabbed-card-scroll-region')
      ).toBe(scrollRegion);
      expect(scrollRegion).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
      expect(scrollRegion).toContainElement(linkInput);
    };

    rerenderState();
    expect(screen.queryByTestId('suggested-dsp-matches')).toBeNull();

    mockState.dspMatchesLoading = false;
    rerenderState();
    expect(screen.queryByTestId('suggested-dsp-matches')).toBeNull();

    mockState.dspMatches = [suggestedMatch];
    rerenderState();
    const populatedSuggestions = screen.getByTestId('suggested-dsp-matches');
    expect(populatedSuggestions).toHaveAttribute('data-state', 'ready');
    expect(scrollRegion.lastElementChild).toBe(populatedSuggestions);

    mockState.dspMatches = [];
    mockState.dspMatchesLoading = true;
    rerenderState();
    expect(screen.queryByTestId('suggested-dsp-matches')).toBeNull();

    mockState.dspMatchesLoading = false;
    mockState.dspMatchesError = new Error('Network error');
    rerenderState();
    const errorSuggestions = screen.getByTestId('suggested-dsp-matches');
    expect(errorSuggestions).toHaveAttribute('data-state', 'error');
    expect(scrollRegion.lastElementChild).toBe(errorSuggestions);
  });
});
