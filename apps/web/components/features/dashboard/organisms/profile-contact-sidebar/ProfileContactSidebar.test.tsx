import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FetchError } from '@/lib/queries/fetch';
import { queryKeys } from '@/lib/queries/keys';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { ProfileContactSidebar } from './ProfileContactSidebar';

type DeferredMutationCall = {
  variables: Record<string, unknown>;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
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
    profileEditVersion: 1,
    links: [
      {
        id: 'link-a',
        title: 'Alpha',
        url: 'https://alpha.example',
        platform: 'alpha',
        isVisible: true,
        version: 1,
      },
      {
        id: 'link-b',
        title: 'Beta',
        url: 'https://beta.example',
        platform: 'beta',
        isVisible: true,
        version: 1,
      },
      {
        id: 'link-c',
        title: 'Gamma',
        url: 'https://gamma.example',
        platform: 'gamma',
        isVisible: true,
        version: 1,
      },
    ],
    profilePath: '/artist',
    dspConnections: {
      spotify: { connected: false, artistName: null },
      appleMusic: { connected: false, artistName: null },
    },
  },
  profileCalls: [] as DeferredMutationCall[],
  removeCalls: [] as DeferredMutationCall[],
  useRealProfileMutation: false,
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
    selectedProfile: {
      id: 'profile-1',
      settings: {},
      profileEditVersion: 1,
    },
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
      <button type='button' onClick={() => onBioChange('Bio C')}>
        Set bio C
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

const detectedAlphaLink: DetectedLink = {
  ...detectedLink,
  platform: {
    ...detectedLink.platform,
    id: 'alpha',
    name: 'Alpha',
  },
  normalizedUrl: 'https://alpha.example/newer',
  originalUrl: 'https://alpha.example/newer',
  suggestedTitle: 'Alpha',
};

vi.mock('./SidebarLinkInput', () => ({
  SidebarLinkInput: ({ onAdd }: { onAdd: (link: DetectedLink) => void }) => (
    <div>
      <button type='button' onClick={() => onAdd(detectedLink)}>
        Add Delta
      </button>
      <button type='button' onClick={() => onAdd(detectedAlphaLink)}>
        Add Alpha
      </button>
    </div>
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

vi.mock('@/lib/queries', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/queries')>('@/lib/queries');
  return {
    ...actual,
    useDeletePressPhotoMutation: () => ({ mutateAsync: vi.fn() }),
    useDspMatchesQuery: () => ({ data: [] }),
    usePressPhotosQuery: () => ({ data: [] }),
    usePressPhotoUploadMutation: () => ({ mutateAsync: vi.fn() }),
    useProfileMonetizationSummary: () => ({ data: null }),
    useProfileSaveMutation: () => {
      if (mockState.useRealProfileMutation) {
        return actual.useProfileSaveMutation();
      }
      return {
        mutateAsync: (variables: Record<string, unknown>) =>
          new Promise((resolve, reject) => {
            mockState.profileCalls.push({ variables, resolve, reject });
          }),
      };
    },
    useRemoveSocialLinkMutation: () => ({
      mutateAsync: (variables: Record<string, unknown>) =>
        new Promise((resolve, reject) => {
          mockState.removeCalls.push({ variables, resolve, reject });
        }),
    }),
  };
});

vi.mock('@/features/dashboard/organisms/dsp-matches/hooks', () => ({
  useDspMatchActions: () => ({
    confirmMatch: vi.fn(),
    rejectMatch: vi.fn(),
    isMatchConfirming: () => false,
    isMatchRejecting: () => false,
  }),
}));

function renderEditingSidebar() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(queryKeys.user.profile(), {
    ...mockState.initialPreviewData,
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ProfileContactSidebar />
    </QueryClientProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
  return { ...view, queryClient };
}

function openAboutTab() {
  fireEvent.click(screen.getByRole('button', { name: 'About' }));
}

function linkTitles() {
  return within(screen.getByTestId('links'))
    .getAllByTestId(/^link-/)
    .map(link => within(link).getByText(/Alpha|Beta|Gamma|Delta/).textContent);
}

async function resolveProfileCall(
  index: number,
  profileEditVersion: number,
  bio: string | null = 'Original bio'
) {
  await act(async () => {
    mockState.profileCalls[index]?.resolve({
      profile: {
        ...mockState.initialPreviewData,
        bio,
        profileEditVersion,
      },
    });
    await Promise.resolve();
  });
}

async function rejectProfileCall(index: number) {
  await act(async () => {
    mockState.profileCalls[index]?.reject(new Error('save failed'));
    await Promise.resolve();
  });
}

async function resolveRemoveCall(index: number, version = 2) {
  await act(async () => {
    mockState.removeCalls[index]?.resolve({ ok: true, version });
    await Promise.resolve();
  });
}

async function rejectRemoveCall(index: number) {
  await act(async () => {
    mockState.removeCalls[index]?.reject(new Error('remove failed'));
    await Promise.resolve();
  });
}

describe('ProfileContactSidebar optimistic mutation sequencing', () => {
  beforeEach(() => {
    mockState.profileCalls.length = 0;
    mockState.removeCalls.length = 0;
    mockState.toastSuccess.mockReset();
    mockState.toastError.mockReset();
    mockState.useRealProfileMutation = false;
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

    await resolveProfileCall(0, 2, 'Bio A');

    expect(status).toHaveAttribute('data-state', 'saved');
    expect(screen.getByTestId('profile-contact-tabbed-card')).toBe(card);
    expect(screen.getByTestId('profile-rail-mutation-status')).toBe(status);
  });

  it('serializes one request at a time and coalesces queued values to the newest intent', async () => {
    const user = userEvent.setup();
    renderEditingSidebar();
    openAboutTab();

    await user.click(screen.getByRole('button', { name: 'Set bio A' }));
    await user.click(screen.getByRole('button', { name: 'Set bio B' }));
    await user.click(screen.getByRole('button', { name: 'Set bio C' }));

    expect(mockState.profileCalls).toHaveLength(1);
    expect(screen.getByTestId('bio-value')).toHaveTextContent('Bio C');

    await resolveProfileCall(0, 2, 'Bio A');
    await waitFor(() => expect(mockState.profileCalls).toHaveLength(2));
    expect(mockState.profileCalls[1]?.variables).toEqual({
      expectedVersion: 2,
      updates: { bio: 'Bio C' },
    });
    await resolveProfileCall(1, 3, 'Bio C');

    expect(screen.getByTestId('bio-value')).toHaveTextContent('Bio C');
    expect(screen.getByTestId('profile-rail-mutation-status')).toHaveAttribute(
      'data-state',
      'saved'
    );
    expect(mockState.toastError).not.toHaveBeenCalled();
  });

  it('uses real TanStack mutateAsync settlement without a stuck status or stale cache', async () => {
    mockState.useRealProfileMutation = true;
    const requests: Array<{
      body: {
        expectedVersion?: number;
        updates: { bio?: string };
      };
      resolve: (response: Response) => void;
    }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(
          String(init?.body)
        ) as (typeof requests)[number]['body'];
        return new Promise<Response>(resolve => {
          requests.push({ body, resolve });
        });
      })
    );

    const user = userEvent.setup();
    const { queryClient } = renderEditingSidebar();
    openAboutTab();

    await user.click(screen.getByRole('button', { name: 'Set bio A' }));
    await user.click(screen.getByRole('button', { name: 'Set bio B' }));
    await user.click(screen.getByRole('button', { name: 'Set bio C' }));

    expect(requests).toHaveLength(1);
    expect(requests[0]?.body).toEqual({
      expectedVersion: 1,
      updates: { bio: 'Bio A' },
    });

    await act(async () => {
      requests[0]?.resolve(
        Response.json({
          profile: {
            ...mockState.initialPreviewData,
            bio: 'Bio A',
            profileEditVersion: 2,
          },
        })
      );
      await Promise.resolve();
    });
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]?.body).toEqual({
      expectedVersion: 2,
      updates: { bio: 'Bio C' },
    });

    await act(async () => {
      requests[1]?.resolve(
        Response.json({
          profile: {
            ...mockState.initialPreviewData,
            bio: 'Bio C',
            profileEditVersion: 3,
          },
        })
      );
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(
        screen.getByTestId('profile-rail-mutation-status')
      ).toHaveAttribute('data-state', 'saved')
    );
    expect(screen.getByTestId('bio-value')).toHaveTextContent('Bio C');
    expect(queryClient.getQueryData(queryKeys.user.profile())).toMatchObject({
      bio: 'Bio C',
      profileEditVersion: 3,
    });
  });

  it('advances the profile CAS token after a cross-tab conflict before draining the latest intent', async () => {
    mockState.useRealProfileMutation = true;
    const requests: Array<{
      body: {
        expectedVersion?: number;
        updates: { bio?: string };
      };
      resolve: (response: Response) => void;
    }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(
          String(init?.body)
        ) as (typeof requests)[number]['body'];
        return new Promise<Response>(resolve => {
          requests.push({ body, resolve });
        });
      })
    );
    const user = userEvent.setup();
    const { queryClient } = renderEditingSidebar();
    openAboutTab();

    await user.click(screen.getByRole('button', { name: 'Set bio A' }));
    await user.click(screen.getByRole('button', { name: 'Set bio B' }));
    expect(requests).toHaveLength(1);

    await act(async () => {
      requests[0]?.resolve(
        Response.json(
          {
            error: 'Conflict: Profile has been modified by another request',
            code: 'VERSION_CONFLICT',
            expectedVersion: 1,
            currentVersion: 2,
          },
          { status: 409 }
        )
      );
      await Promise.resolve();
    });
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]?.body).toEqual({
      expectedVersion: 2,
      updates: { bio: 'Bio B' },
    });

    await act(async () => {
      requests[1]?.resolve(
        Response.json({
          profile: {
            ...mockState.initialPreviewData,
            bio: 'Bio B',
            profileEditVersion: 3,
          },
        })
      );
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(
        screen.getByTestId('profile-rail-mutation-status')
      ).toHaveAttribute('data-state', 'saved')
    );
    expect(screen.getByTestId('bio-value')).toHaveTextContent('Bio B');
    expect(queryClient.getQueryData(queryKeys.user.profile())).toMatchObject({
      bio: 'Bio B',
      profileEditVersion: 3,
    });
  });

  it('continues to the newest queued intent when the in-flight save fails', async () => {
    const user = userEvent.setup();
    renderEditingSidebar();
    openAboutTab();

    await user.click(screen.getByRole('button', { name: 'Set bio A' }));
    await user.click(screen.getByRole('button', { name: 'Set bio B' }));
    await rejectProfileCall(0);
    await waitFor(() => expect(mockState.profileCalls).toHaveLength(2));
    await resolveProfileCall(1, 2, 'Bio B');

    expect(screen.getByTestId('bio-value')).toHaveTextContent('Bio B');
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(mockState.toastError).not.toHaveBeenCalled();
  });

  it('returns to the last confirmed value when the newest queued save fails', async () => {
    const user = userEvent.setup();
    renderEditingSidebar();
    openAboutTab();

    await user.click(screen.getByRole('button', { name: 'Set bio A' }));
    await user.click(screen.getByRole('button', { name: 'Set bio B' }));
    await resolveProfileCall(0, 2, 'Bio A');
    await waitFor(() => expect(mockState.profileCalls).toHaveLength(2));
    await rejectProfileCall(1);

    expect(screen.getByTestId('bio-value')).toHaveTextContent('Bio A');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('retries a conflicted profile save with the authoritative server version', async () => {
    const user = userEvent.setup();
    renderEditingSidebar();
    openAboutTab();

    await user.click(screen.getByRole('button', { name: 'Set bio A' }));
    await act(async () => {
      mockState.profileCalls[0]?.reject(
        new FetchError('Conflict', 409, undefined, {
          code: 'VERSION_CONFLICT',
          currentVersion: 2,
          expectedVersion: 1,
        })
      );
      await Promise.resolve();
    });
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(mockState.profileCalls[1]?.variables).toEqual({
      expectedVersion: 2,
      updates: { bio: 'Bio A' },
    });
    await resolveProfileCall(1, 3, 'Bio A');
    expect(screen.getByTestId('profile-rail-mutation-status')).toHaveAttribute(
      'data-state',
      'saved'
    );
  });

  it('rolls back only the failed field and retries its intended value', async () => {
    const user = userEvent.setup();
    renderEditingSidebar();
    openAboutTab();

    await user.click(screen.getByRole('button', { name: 'Set bio A' }));
    await user.click(screen.getByRole('button', { name: 'Set location' }));
    await rejectProfileCall(0);
    await waitFor(() => expect(mockState.profileCalls).toHaveLength(2));

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
    expect(mockState.profileCalls).toHaveLength(2);
    await resolveProfileCall(1, 2);
    await waitFor(() => expect(mockState.profileCalls).toHaveLength(3));
    expect(mockState.profileCalls[2]?.variables).toEqual({
      expectedVersion: 2,
      updates: { bio: 'Bio A' },
    });
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
    await resolveRemoveCall(1);
    await rejectRemoveCall(0);

    expect(linkTitles()).toEqual(['Alpha', 'Gamma']);

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mockState.removeCalls[2]?.variables).toEqual({
      profileId: 'profile-1',
      linkId: 'link-a',
      expectedVersion: 1,
    });
    expect(linkTitles()).toEqual(['Gamma']);
  });

  it('retries a conflicted removal with the authoritative link version', async () => {
    const user = userEvent.setup();
    renderEditingSidebar();

    await user.click(screen.getByRole('button', { name: 'Remove link-a' }));
    await act(async () => {
      mockState.removeCalls[0]?.reject(
        new FetchError('Conflict', 409, undefined, {
          code: 'VERSION_CONFLICT',
          currentVersion: 2,
          expectedVersion: 1,
        })
      );
      await Promise.resolve();
    });
    expect(linkTitles()).toEqual(['Alpha', 'Beta', 'Gamma']);

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mockState.removeCalls[1]?.variables).toEqual({
      profileId: 'profile-1',
      linkId: 'link-a',
      expectedVersion: 2,
    });
    await resolveRemoveCall(1, 3);
    expect(linkTitles()).toEqual(['Beta', 'Gamma']);
    expect(screen.getByTestId('profile-rail-mutation-status')).toHaveAttribute(
      'data-state',
      'saved'
    );
  });

  it('waits for a same-platform remove and re-adds with the returned version', async () => {
    const user = userEvent.setup();
    const requests: Array<{
      body: Record<string, unknown>;
      resolve: (response: Response) => void;
    }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Promise<Response>(resolve => {
          requests.push({ body, resolve });
        });
      })
    );
    renderEditingSidebar();

    await user.click(screen.getByRole('button', { name: 'Remove link-a' }));
    await user.click(screen.getByRole('button', { name: 'Add Social link' }));
    await user.click(screen.getByRole('button', { name: 'Add Alpha' }));

    expect(requests).toHaveLength(0);
    expect(mockState.removeCalls[0]?.variables).toEqual({
      profileId: 'profile-1',
      linkId: 'link-a',
      expectedVersion: 1,
    });

    await resolveRemoveCall(0, 2);
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.body).toMatchObject({
      profileId: 'profile-1',
      platform: 'alpha',
      expectedVersion: 2,
    });

    await act(async () => {
      requests[0]?.resolve(
        Response.json({ linkId: 'link-a', version: 3, outcome: 'updated' })
      );
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(
        screen.getByTestId('profile-rail-mutation-status')
      ).toHaveAttribute('data-state', 'saved')
    );
    expect(linkTitles()).toEqual(['Beta', 'Gamma', 'Alpha']);
  });

  it('refreshes a conflicted link token before the queued same-platform re-add', async () => {
    const user = userEvent.setup();
    const requests: Array<{
      body: Record<string, unknown>;
      resolve: (response: Response) => void;
    }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Promise<Response>(resolve => {
          requests.push({ body, resolve });
        });
      })
    );
    renderEditingSidebar();

    await user.click(screen.getByRole('button', { name: 'Remove link-a' }));
    await user.click(screen.getByRole('button', { name: 'Add Social link' }));
    await user.click(screen.getByRole('button', { name: 'Add Alpha' }));

    await act(async () => {
      mockState.removeCalls[0]?.reject(
        new FetchError('Conflict', 409, undefined, {
          code: 'VERSION_CONFLICT',
          currentVersion: 2,
          expectedVersion: 1,
        })
      );
      await Promise.resolve();
    });
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.body).toMatchObject({
      profileId: 'profile-1',
      platform: 'alpha',
      expectedVersion: 2,
    });

    await act(async () => {
      requests[0]?.resolve(
        Response.json({ linkId: 'link-a', version: 3, outcome: 'updated' })
      );
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(
        screen.getByTestId('profile-rail-mutation-status')
      ).toHaveAttribute('data-state', 'saved')
    );
    expect(linkTitles()).toEqual(['Beta', 'Gamma', 'Alpha']);
    expect(mockState.toastError).not.toHaveBeenCalled();
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
        json: async () => ({ linkId: 'link-d', version: 1 }),
      } as Response);
      await Promise.resolve();
    });
    await rejectRemoveCall(0);

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
    await rejectProfileCall(0);
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
    await rejectProfileCall(0);
    expect(status).toHaveAttribute('data-state', 'error');
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(screen.getByTestId('profile-contact-tabbed-card')).toBe(card);
    expect(screen.getByTestId('profile-rail-mutation-status')).toBe(status);
    expect(screen.getByTestId('bio-value').parentElement).toBe(aboutContent);
    expect(status).toHaveClass('h-7', 'shrink-0', 'overflow-hidden');
  });
});
