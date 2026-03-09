import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ProfileContactSidebar } from '@/components/dashboard/organisms/profile-contact-sidebar/ProfileContactSidebar';

vi.mock('@jovie/ui', () => ({
  Label: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
  SegmentControl: ({
    options,
    value,
    onValueChange,
  }: {
    options: Array<{ value: string; label: string }>;
    value: string;
    onValueChange: (value: string) => void;
  }) => (
    <div>
      {options.map(option => (
        <button
          key={option.value}
          type='button'
          aria-pressed={value === option.value}
          onClick={() => onValueChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('@/app/app/(shell)/dashboard/actions/creator-profile', () => ({
  updateAllowProfilePhotoDownloads: vi.fn(),
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => ({
    selectedProfile: { id: 'p_1', settings: {} },
  }),
}));

const previewData = {
  username: 'artist',
  displayName: 'Artist',
  avatarUrl: null,
  bio: '',
  genres: [],
  profilePath: '/artist',
  dspConnections: [],
  links: [],
};

vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  usePreviewPanelState: () => ({ isOpen: true, close: vi.fn() }),
  usePreviewPanelData: () => ({
    previewData,
    setPreviewData: vi.fn(),
  }),
}));

vi.mock('@/components/dashboard/atoms/CopyLinkInput', () => ({
  CopyLinkInput: () => <div>copy</div>,
}));

vi.mock(
  '@/components/dashboard/organisms/links/utils/platform-category',
  () => ({
    getPlatformCategory: () => 'social',
  })
);

vi.mock('@/components/molecules/drawer', () => ({
  DrawerAsyncToggle: () => <div>toggle</div>,
  EntitySidebarShell: ({
    tabs,
    children,
  }: {
    tabs: ReactNode;
    children: ReactNode;
  }) => (
    <div>
      <div>{tabs}</div>
      <div>{children}</div>
    </div>
  ),
}));

vi.mock('@/lib/queries/useProfileMutation', () => ({
  useProfileSaveMutation: () => ({ mutate: vi.fn() }),
  useAvatarMutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/lib/queries/useRemoveSocialLinkMutation', () => ({
  useRemoveSocialLinkMutation: () => ({ mutate: vi.fn() }),
}));

vi.mock(
  '@/components/dashboard/organisms/profile-contact-sidebar/ProfileAboutTab',
  () => ({
    ProfileAboutTab: () => <div>about-tab</div>,
  })
);
vi.mock(
  '@/components/dashboard/organisms/profile-contact-sidebar/ProfileAnalyticsSummary',
  () => ({
    ProfileAnalyticsSummary: () => <div>analytics</div>,
  })
);
vi.mock(
  '@/components/dashboard/organisms/profile-contact-sidebar/ProfileContactHeader',
  () => ({
    ProfileContactHeader: () => <div>header</div>,
  })
);
vi.mock(
  '@/components/dashboard/organisms/profile-contact-sidebar/ProfileLinkList',
  () => ({
    ProfileLinkList: () => <div>links</div>,
  })
);
vi.mock(
  '@/components/dashboard/organisms/profile-contact-sidebar/ProfileSidebarHeader',
  () => ({
    useProfileHeaderParts: () => ({ title: 'title', actions: null }),
  })
);
vi.mock(
  '@/components/dashboard/organisms/profile-contact-sidebar/SidebarLinkInput',
  () => ({
    SidebarLinkInput: () => <div>sidebar-input</div>,
  })
);

describe('ProfileContactSidebar', () => {
  it('always renders the tab action slot and shows add button on link tabs', () => {
    render(<ProfileContactSidebar />);

    expect(screen.getByTestId('profile-tab-action-slot')).toBeInTheDocument();
    expect(screen.getByLabelText('Add Social link')).toBeInTheDocument();
  });

  it('keeps the tab action slot when switching to About and hides add button', () => {
    render(<ProfileContactSidebar />);

    fireEvent.click(screen.getByRole('button', { name: 'About' }));

    expect(screen.getByTestId('profile-tab-action-slot')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Add .* link/)).not.toBeInTheDocument();
  });
});
