import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { ProfileContactSidebar } from './ProfileContactSidebar';

type MutationOptions = {
  onSuccess?: () => void;
  onError?: () => void;
};

const mockState = vi.hoisted(() => ({
  initialPreviewData: {
    username: 'artist',
    displayName: 'Artist',
    avatarUrl: null,
    bio: 'Original bio',
    genres: ['pop'],
    location: 'Los Angeles, CA',
    hometown: 'Chicago, IL',
    activeSinceYear: 2019,
    links: [
      {
        id: 'link-a',
        title: 'Alpha',
        url: 'https://alpha.example',
        platform: 'alpha',
        isVisible: true,
      },
      {
        id: 'link-b',
        title: 'Beta',
        url: 'https://beta.example',
        platform: 'beta',
        isVisible: true,
      },
      {
        id: 'link-c',
        title: 'Gamma',
        url: 'https://gamma.example',
        platform: 'gamma',
        isVisible: true,
      },
    ],
    profilePath: '/artist',
    dspConnections: {
      spotify: { connected: false, artistName: null },
      appleMusic: { connected: false, artistName: null },
    },
  },
  profileCalls: [] as Array<{
    variables: Record<string, unknown>;
    options: MutationOptions;
  }>,
  removeCalls: [] as Array<{
    variables: { profileId: string; linkId: string };
    options: MutationOptions;
  }>,
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/dashboard/profile',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => ({ get: () => null, toString: () => '' }),
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => ({
    selectedProfile: { id: 'profile-1', settings: {} },
  }),
}));

vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    usePreviewPanelState: () => ({ isOpen: true, close: vi.fn() }),
    usePreviewPanelData: () => {
      const [previewData, setPreviewData] = React.useState(() => ({
        ...mockState.initialPreviewData,
        genres: [...mockState.initialPreviewData.genres],
        links: mockState.initialPreviewData.links.map(link => ({ ...link })),
      }));
      return { previewData, setPreviewData };
    },
  };
});

vi.mock('@/components/feedback', () => ({
  toast: {
    success: mockState.toastSuccess,
    error: mockState.toastError,
  },
}));

vi.mock('@/components/atoms/AppIconButton', () => ({
  AppIconButton: ({
    children,
    ariaLabel,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    ariaLabel: string;
  }) => (
    <button type='button' aria-label={ariaLabel} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/molecules/drawer', () => ({
  EntitySidebarShell: ({ children }: { children: React.ReactNode }) => (
    <aside>{children}</aside>
  ),
  DrawerTabbedCard: ({
    children,
    tabs,
    testId,
  }: {
    children: React.ReactNode;
    tabs: React.ReactNode;
    testId: string;
  }) => (
    <section data-testid={testId}>
      {tabs}
      <div data-testid={`${testId}-scroll-region`}>{children}</div>
    </section>
  ),
  DrawerTabs: ({
    onValueChange,
    actions,
  }: {
    onValueChange: (value: string) => void;
    actions?: React.ReactNode;
  }) => (
    <nav>
      <button type='button' onClick={() => onValueChange('social')}>
        Social
      </button>
      <button type='button' onClick={() => onValueChange('about')}>
        About
      </button>
      {actions}
    </nav>
  ),
}));

vi.mock('@/components/organisms/profile-sidebar/ProfileSidebarHeader', () => ({
  useProfileHeaderParts: () => ({ overflowActions: [] }),
}));

vi.mock('./ProfileContactSidebarSections', () => ({
  ProfileBentoView: ({ onEditProfile }: { onEditProfile: () => void }) => (
    <button type='button' onClick={onEditProfile}>
      Edit profile
    </button>
  ),
  ProfileSidebarHeaderCard: () => <header>Profile header</header>,
}));

vi.mock('./ProfileAboutTab', () => ({
  ProfileAboutTab: ({
    bio,
    location,
    onBioChange,
    onLocationChange,
  }: {
    bio: string | null;
    location: string | null;
    onBioChange: (value: string) => void;
    onLocationChange: (value: string | null) => void;
  }) => (
    <div>
      <output data-testid='bio-value'>{bio}</output>
      <output data-testid='location-value'>{location}</output>
      <button type='button' onClick={() => onBioChange('Bio A')}>
        Set bio A
      </button>
      <button type='button' onClick={() => onBioChange('Bio B')}>
        Set bio B
      </button>
      <button type='button' onClick={() => onLocationChange('Seattle, WA')}>
        Set location
      </button>
    </div>
  ),
}));

vi.mock('./ProfileLinkList', () => ({
  ProfileLinkList: ({
    links,
    onRemoveLink,
  }: {
    links: Array<{ id: string; title: string }>;
    onRemoveLink: (id: string) => void;
  }) => (
    <div data-testid='links'>
      {links.map(link => (
        <div key={link.id} data-testid={`link-${link.id}`}>
          <span>{link.title}</span>
          <button type='button' onClick={() => onRemoveLink(link.id)}>
            Remove {link.id}
          </button>
        </div>
      ))}
    </div>
  ),
}));

const detectedLink: DetectedLink = {
  platform: {
    id: 'delta',
    name: 'Delta',
    category: 'social',
    icon: 'delta',
    color: '#000000',
    placeholder: 'https://delta.example/artist',
  },
  normalizedUrl: 'https://delta.example/artist',
  originalUrl: 'https://delta.example/artist',
  suggestedTitle: 'Delta',
  isValid: true,
};

vi.mock('./SidebarLinkInput', () => ({
  SidebarLinkInput: ({ onAdd }: { onAdd: (link: DetectedLink) => void }) => (
    <button type='button' onClick={() => onAdd(detectedLink)}>
      Add Delta
    </button>
  ),
}));

vi.mock('./SuggestedDspMatches', () => ({
  SuggestedDspMatches: () => null,
}));

vi.mock('@/features/dashboard/molecules/ProfilePaySurface', () => ({
  ProfilePaySurface: () => null,
}));

vi.mock('@/features/dashboard/molecules/useEmailSignatureMenuAction', () => ({
  useEmailSignatureMenuAction: () => ({ action: {}, modal: null }),
}));

vi.mock('@/lib/queries', () => ({
  useDeletePressPhotoMutation: () => ({ mutateAsync: vi.fn() }),
  useDspMatchesQuery: () => ({ data: [] }),
  usePressPhotosQuery: () => ({ data: [] }),
  usePressPhotoUploadMutation: () => ({ mutateAsync: vi.fn() }),
  useProfileMonetizationSummary: () => ({ data: null }),
  useProfileSaveMutation: () => ({
    mutate: (variables: Record<string, unknown>, options: MutationOptions) => {
      mockState.profileCalls.push({ variables, options });
    },
  }),
  useRemoveSocialLinkMutation: () => ({
    mutate: (
      variables: { profileId: string; linkId: string },
      options: MutationOptions
    ) => {
      mockState.removeCalls.push({ variables, options });
    },
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

function renderEditingSidebar() {
  const view = render(<ProfileContactSidebar />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
  return view;
}

function openAboutTab() {
  fireEvent.click(screen.getByRole('button', { name: 'About' }));
}

function linkTitles() {
  return within(screen.getByTestId('links'))
    .getAllByTestId(/^link-/)
    .map(link => within(link).getByText(/Alpha|Beta|Gamma|Delta/).textContent);
}

describe('ProfileContactSidebar optimistic mutation sequencing', () => {
  beforeEach(() => {
    mockState.profileCalls.length = 0;
    mockState.removeCalls.length = 0;
    mockState.toastSuccess.mockReset();
    mockState.toastError.mockReset();
    vi.unstubAllGlobals();
  });

  it('paints a deferred bio save immediately and exposes a stable live status slot', async () => {
    const user = userEvent.setup();
    renderEditingSidebar();
    openAboutTab();

    const card = screen.getByTestId('profile-contact-tabbed-card');
    const status = screen.getByTestId('profile-rail-mutation-status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveClass('h-7', 'shrink-0', 'overflow-hidden');

    await user.click(screen.getByRole('button', { name: 'Set bio A' }));

    expect(screen.getByTestId('bio-value')).toHaveTextContent('Bio A');
    expect(status).toHaveAttribute('data-state', 'saving');
    expect(mockState.profileCalls).toHaveLength(1);

    act(() => mockState.profileCalls[0]?.options.onSuccess?.());

    expect(status).toHaveAttribute('data-state', 'saved');
    expect(screen.getByTestId('profile-contact-tabbed-card')).toBe(card);
    expect(screen.getByTestId('profile-rail-mutation-status')).toBe(status);
  });

  it('keeps B when B succeeds before an older A request fails', async () => {
    const user = userEvent.setup();
    renderEditingSidebar();
    openAboutTab();

    await user.click(screen.getByRole('button', { name: 'Set bio A' }));
    await user.click(screen.getByRole('button', { name: 'Set bio B' }));

    act(() => mockState.profileCalls[1]?.options.onSuccess?.());
    act(() => mockState.profileCalls[0]?.options.onError?.());

    expect(screen.getByTestId('bio-value')).toHaveTextContent('Bio B');
    expect(screen.getByTestId('profile-rail-mutation-status')).toHaveAttribute(
      'data-state',
      'saved'
    );
    expect(mockState.toastError).not.toHaveBeenCalled();
  });

  it.each([
    ['A then B failures', [0, 1]],
    ['B then A failures', [1, 0]],
  ] as const)('returns to the confirmed baseline for %s', async (_label, completionOrder) => {
    const user = userEvent.setup();
    renderEditingSidebar();
    openAboutTab();

    await user.click(screen.getByRole('button', { name: 'Set bio A' }));
    await user.click(screen.getByRole('button', { name: 'Set bio B' }));
    for (const index of completionOrder) {
      act(() => mockState.profileCalls[index]?.options.onError?.());
    }

    expect(screen.getByTestId('bio-value')).toHaveTextContent('Original bio');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('reconciles to A when B fails before the older A request succeeds', async () => {
    const user = userEvent.setup();
    renderEditingSidebar();
    openAboutTab();

    await user.click(screen.getByRole('button', { name: 'Set bio A' }));
    await user.click(screen.getByRole('button', { name: 'Set bio B' }));
    act(() => mockState.profileCalls[1]?.options.onError?.());
    act(() => mockState.profileCalls[0]?.options.onSuccess?.());

    expect(screen.getByTestId('bio-value')).toHaveTextContent('Bio A');
  });

  it('rolls back only the failed field and retries its intended value', async () => {
    const user = userEvent.setup();
    renderEditingSidebar();
    openAboutTab();

    await user.click(screen.getByRole('button', { name: 'Set bio A' }));
    await user.click(screen.getByRole('button', { name: 'Set location' }));
    act(() => mockState.profileCalls[0]?.options.onError?.());

    expect(screen.getByTestId('bio-value')).toHaveTextContent('Original bio');
    expect(screen.getByTestId('location-value')).toHaveTextContent(
      'Seattle, WA'
    );
    expect(screen.getByTestId('profile-rail-mutation-status')).toHaveAttribute(
      'data-state',
      'error'
    );

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(screen.getByTestId('bio-value')).toHaveTextContent('Bio A');
    expect(mockState.profileCalls[2]?.variables).toEqual({
      updates: { bio: 'Bio A' },
    });
    act(() => mockState.profileCalls[2]?.options.onSuccess?.());
    expect(screen.getByTestId('profile-rail-mutation-status')).toHaveAttribute(
      'data-state',
      'saving'
    );
  });

  it('restores only A when concurrent removals complete B-success then A-failure', async () => {
    const user = userEvent.setup();
    renderEditingSidebar();

    await user.click(screen.getByRole('button', { name: 'Remove link-a' }));
    await user.click(screen.getByRole('button', { name: 'Remove link-b' }));
    act(() => mockState.removeCalls[1]?.options.onSuccess?.());
    act(() => mockState.removeCalls[0]?.options.onError?.());

    expect(linkTitles()).toEqual(['Alpha', 'Gamma']);

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mockState.removeCalls[2]?.variables).toEqual({
      profileId: 'profile-1',
      linkId: 'link-a',
    });
    expect(linkTitles()).toEqual(['Gamma']);
  });

  it('preserves a completed add when an earlier remove rolls back', async () => {
    const user = userEvent.setup();
    let resolveFetch: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>(resolve => {
            resolveFetch = resolve;
          })
      )
    );
    renderEditingSidebar();

    await user.click(screen.getByRole('button', { name: 'Remove link-a' }));
    await user.click(screen.getByRole('button', { name: 'Add Social link' }));
    await user.click(screen.getByRole('button', { name: 'Add Delta' }));
    expect(linkTitles()).toEqual(['Beta', 'Gamma', 'Delta']);

    await act(async () => {
      resolveFetch?.({
        ok: true,
        json: async () => ({ linkId: 'link-d' }),
      } as Response);
      await Promise.resolve();
    });
    act(() => mockState.removeCalls[0]?.options.onError?.());

    expect(linkTitles()).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta']);
  });

  it('settles quietly when a removed pending add later fails confirmation', async () => {
    const user = userEvent.setup();
    let rejectFetch: ((error: Error) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((_resolve, reject) => {
            rejectFetch = reject;
          })
      )
    );
    renderEditingSidebar();

    await user.click(screen.getByRole('button', { name: 'Add Social link' }));
    await user.click(screen.getByRole('button', { name: 'Add Delta' }));
    await user.click(screen.getByRole('button', { name: /^Remove temp-/ }));
    expect(linkTitles()).toEqual(['Alpha', 'Beta', 'Gamma']);
    mockState.toastSuccess.mockClear();
    mockState.toastError.mockClear();

    await act(async () => {
      rejectFetch?.(new Error('confirm failed'));
      await Promise.resolve();
    });

    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.getByTestId('profile-rail-mutation-status')).toHaveAttribute(
      'data-state',
      'saved'
    );
    expect(mockState.toastSuccess).not.toHaveBeenCalled();
    expect(mockState.toastError).not.toHaveBeenCalled();
  });

  it('cancels late UI effects after unmount and remounts from source truth once', async () => {
    const user = userEvent.setup();
    const view = renderEditingSidebar();
    openAboutTab();
    await user.click(screen.getByRole('button', { name: 'Set bio A' }));
    expect(mockState.profileCalls).toHaveLength(1);

    view.unmount();
    act(() => mockState.profileCalls[0]?.options.onError?.());
    expect(mockState.toastError).not.toHaveBeenCalled();

    renderEditingSidebar();
    openAboutTab();
    expect(screen.getByTestId('bio-value')).toHaveTextContent('Original bio');
    expect(mockState.profileCalls).toHaveLength(1);
  });

  it('keeps the same card and fixed-height status node through error and retry', async () => {
    const user = userEvent.setup();
    renderEditingSidebar();
    openAboutTab();
    const card = screen.getByTestId('profile-contact-tabbed-card');
    const status = screen.getByTestId('profile-rail-mutation-status');
    const aboutContent = screen.getByTestId('bio-value').parentElement;

    await user.click(screen.getByRole('button', { name: 'Set bio A' }));
    act(() => mockState.profileCalls[0]?.options.onError?.());
    expect(status).toHaveAttribute('data-state', 'error');
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(screen.getByTestId('profile-contact-tabbed-card')).toBe(card);
    expect(screen.getByTestId('profile-rail-mutation-status')).toBe(status);
    expect(screen.getByTestId('bio-value').parentElement).toBe(aboutContent);
    expect(status).toHaveClass('h-7', 'shrink-0', 'overflow-hidden');
  });
});
