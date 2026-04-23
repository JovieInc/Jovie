import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
  DashboardDataContext: { Provider: ({ children }: { children: React.ReactNode }) => children, Consumer: () => null, displayName: 'DashboardDataContext' },
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

describe('ProfileContactSidebar scroll contract', () => {
  it('uses child-owned scrolling without the legacy full-height wrapper', () => {
    const { container } = render(<ProfileContactSidebar />);

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
});
