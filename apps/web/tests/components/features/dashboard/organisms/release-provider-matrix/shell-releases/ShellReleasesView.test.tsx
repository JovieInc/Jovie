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
import type { TableActionMenuProps } from '@/components/atoms/table-action-menu/types';
import { useImportPolling } from '@/components/features/dashboard/organisms/release-provider-matrix/hooks/useImportPolling';
import { ShellReleasesView } from '@/components/features/dashboard/organisms/release-provider-matrix/shell-releases/ShellReleasesView';
import { HeaderSearchSurfaceFromContext } from '@/components/shell/HeaderSearchSurfaceFromContext';
import {
  HeaderActionsProvider,
  useOptionalHeaderActions,
} from '@/contexts/HeaderActionsContext';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import type { ReleaseViewModel } from '@/lib/discography/types';

const { mockUseDspMatchesQuery, mockUsePlanGate, navigationState, testState } =
  vi.hoisted(() => ({
    testState: { realActionMenu: false },
    mockUseDspMatchesQuery: vi.fn(() => ({ data: [], isLoading: false })),
    mockUsePlanGate: vi.fn(() => ({
      isLoading: false,
      isError: false,
      smartLinksLimit: null as number | null,
      isPro: true,
      canCreateManualReleases: true,
      canGenerateAlbumArt: false,
      canGenerateReleasePlans: true,
      canEditSmartLinks: true,
      canAccessFutureReleases: true,
    })),
    navigationState: {
      searchParams: new URLSearchParams(),
    },
  }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => navigationState.searchParams,
  usePathname: () => '/app/dashboard/releases',
}));

vi.mock('@/contexts/TableMetaContext', () => ({
  useTableMeta: () => ({
    tableMeta: { rowCount: null, toggle: null, rightPanelWidth: null },
    setTableMeta: vi.fn(),
  }),
}));

vi.mock('@/lib/flags/client', () => ({
  useAppFlag: () => false,
}));

vi.mock('@/app/app/(shell)/dashboard/releases/actions', () => ({
  revertReleaseArtwork: vi.fn(),
  connectAppleMusicArtist: vi.fn(() =>
    Promise.resolve({ success: true, message: 'ok' })
  ),
  deleteRelease: vi.fn(() => Promise.resolve({ success: true })),
}));

vi.mock('@/app/app/(shell)/dashboard/releases/catalog-task-actions', () => ({
  instantiateReleaseTasksFromCatalog: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/app/app/(shell)/dashboard/releases/task-actions', () => ({
  instantiateReleaseTasks: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/chat/open-chat-with-prompt', () => ({
  openChatWithPrompt: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/hooks/useImportPolling',
  () => ({
    useImportPolling: vi.fn(() => ({ importedCount: 0, totalCount: 0 })),
  })
);

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/AppleMusicSyncBanner',
  () => ({
    AppleMusicSyncBanner: ({
      isLoading,
      matches,
    }: {
      readonly isLoading?: boolean;
      readonly matches?: Array<{ readonly status: string }>;
    }) =>
      isLoading ||
      matches?.some(match => match.status === 'confirmed') ? null : (
        <div data-testid='apple-music-sync-banner' />
      ),
  })
);

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/SmartLinkGateBanner',
  () => ({
    SmartLinkGateBanner: ({ mode }: { mode: string }) => (
      <div data-testid={`smart-link-gate-banner-${mode}`} />
    ),
  })
);

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/SpotifyConnectDialog',
  () => ({
    SpotifyConnectDialog: ({ open }: { open: boolean }) =>
      open ? (
        <div data-testid='spotify-connect-dialog'>
          <h2>Connect Spotify</h2>
          <label htmlFor='spotify-search'>
            Search Spotify artists or paste a link
          </label>
          <input id='spotify-search' />
        </div>
      ) : null,
  })
);

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/ReleasePlanWizard',
  () => ({
    ReleasePlanWizard: () => <div data-testid='release-plan-wizard' />,
  })
);

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/AddReleaseSidebar',
  () => ({
    AddReleaseSidebar: ({ isOpen }: { isOpen: boolean }) =>
      isOpen ? (
        <aside data-testid='add-release-sidebar'>Add release</aside>
      ) : null,
  })
);

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/NewReleaseHeaderAction',
  () => ({
    NewReleaseHeaderAction: ({
      canCreateManualReleases,
      isSyncing,
      onSyncSpotify,
      onCreateManual,
    }: {
      canCreateManualReleases: boolean;
      isSyncing: boolean;
      onSyncSpotify: () => void;
      onCreateManual: () => void;
    }) => (
      <div data-testid='new-release-header-action'>
        <button
          type='button'
          data-testid='sync-spotify-action'
          disabled={isSyncing}
          onClick={onSyncSpotify}
        >
          {isSyncing ? 'Syncing' : 'Sync'}
        </button>
        {canCreateManualReleases ? (
          <button
            type='button'
            data-testid='create-manual-action'
            onClick={onCreateManual}
          >
            New release
          </button>
        ) : null}
      </div>
    ),
  })
);

vi.mock('@/components/organisms/artist-search-palette', () => ({
  ArtistSearchCommandPalette: () => null,
}));

vi.mock('@/components/organisms/DialogLoadingSkeleton', () => ({
  DialogLoadingSkeleton: () => null,
}));

vi.mock('@/lib/queries', () => {
  const mutation = {
    isPending: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
  };

  return {
    prefetchReleaseTracks: vi.fn().mockResolvedValue(undefined),
    useFormatReleaseLyricsMutation: () => mutation,
    useRefreshReleaseMutation: () => mutation,
    useRescanIsrcLinksMutation: () => mutation,
    useResetProviderOverrideMutation: () => mutation,
    useSaveCanvasStatusMutation: () => mutation,
    useSavePrimaryIsrcMutation: () => mutation,
    useSaveProviderOverrideMutation: () => mutation,
    useSaveReleaseLyricsMutation: () => mutation,
    useSaveReleaseMetadataMutation: () => mutation,
    useSaveReleaseStatusMutation: () => mutation,
    useSaveReleaseTargetPlaylistsMutation: () => mutation,
    useSyncReleasesFromSpotifyMutation: () => mutation,
    useDspMatchesQuery: () => mockUseDspMatchesQuery(),
    usePlanGate: () => mockUsePlanGate(),
  };
});

vi.mock(
  '@/components/atoms/table-action-menu/TableActionMenu',
  async importOriginal => {
    const actual =
      await importOriginal<
        typeof import('@/components/atoms/table-action-menu/TableActionMenu')
      >();
    return {
      TableActionMenu: (props: TableActionMenuProps) =>
        testState.realActionMenu ? (
          <actual.TableActionMenu {...props} />
        ) : (
          <MockActionMenu {...props} />
        ),
    };
  }
);

function MockActionMenu({ children, items }: TableActionMenuProps) {
  return (
    <div>
      {children}
      <div data-testid='mock-release-actions'>
        {items
          .flatMap(item =>
            item.children && item.children.length > 0 ? item.children : [item]
          )
          .map(item => (
            <button
              key={item.id}
              type='button'
              onClick={event => {
                event.stopPropagation();
                item.onClick?.();
              }}
            >
              {item.label}
            </button>
          ))}
      </div>
    </div>
  );
}

vi.mock('@/components/organisms/release-sidebar', () => ({
  ReleaseSidebar: ({
    release,
    onClose,
    onReleaseChange,
    onDelete,
    onChangeStatus,
    isSmartLinkLocked,
    getSmartLinkLockReason,
    analyticsOverride,
    tracksOverride,
    showCredits,
  }: {
    release: ReleaseViewModel | null;
    onClose?: () => void;
    onReleaseChange?: (release: ReleaseViewModel) => void;
    onDelete?: (id: string) => void;
    onChangeStatus?: (
      release: ReleaseViewModel,
      status: ReleaseViewModel['status']
    ) => void;
    isSmartLinkLocked?: (id: string) => boolean;
    getSmartLinkLockReason?: (id: string) => 'scheduled' | 'cap' | null;
    analyticsOverride?: unknown;
    tracksOverride?: readonly unknown[];
    showCredits?: boolean;
  }) =>
    release ? (
      <aside
        data-testid='release-sidebar'
        data-has-delete={Boolean(onDelete)}
        data-has-status={Boolean(onChangeStatus)}
        data-has-smartlink-gate={Boolean(
          isSmartLinkLocked && getSmartLinkLockReason
        )}
        data-is-smartlink-locked={isSmartLinkLocked?.(release.id) ?? false}
        data-analytics={analyticsOverride ? 'override' : 'live'}
        data-has-tracks={tracksOverride ? 'true' : 'false'}
        data-show-credits={showCredits ? 'true' : 'false'}
      >
        <div>{release.title}</div>
        <input aria-label='Release title draft' defaultValue={release.title} />
        <button type='button' onClick={onClose}>
          Close
        </button>
        <button
          type='button'
          onClick={() => onReleaseChange?.({ ...release, title: 'Edited' })}
        >
          Save Edit
        </button>
      </aside>
    ) : null,
}));

vi.mock('@/hooks/useClipboard', () => ({
  copyToClipboard: vi.fn(() => Promise.resolve(true)),
}));

function fakeRelease(
  partial: Partial<ReleaseViewModel> & { id: string; title: string }
): ReleaseViewModel {
  return {
    profileId: 'p',
    artistNames: ['Bahamas'],
    status: 'released',
    artworkUrl: 'https://x.invalid/a.jpg',
    slug: partial.title.toLowerCase().replace(/\s+/g, '-'),
    smartLinkPath: `/${partial.title.toLowerCase().replace(/\s+/g, '-')}`,
    providers: [],
    releaseType: 'single',
    isExplicit: false,
    totalTracks: 1,
    ...partial,
  } as ReleaseViewModel;
}

const providerConfig = {
  spotify: { label: 'Spotify', accent: '#1db954' },
} as Parameters<typeof ShellReleasesView>[0]['providerConfig'];

const primaryProviders: Parameters<
  typeof ShellReleasesView
>[0]['primaryProviders'] = ['spotify'];

function RightPanelProbe() {
  const panel = useRightPanel();
  return <div data-testid='right-panel-probe'>{panel}</div>;
}

function HeaderActionsProbe() {
  const state = useOptionalHeaderActions();
  return (
    <div
      data-testid='header-actions-probe'
      data-search-total={state?.headerSearchAdapter?.totalCount}
    >
      <HeaderSearchSurfaceFromContext />
      {state?.headerActions}
    </div>
  );
}

function renderShell(
  releases: readonly ReleaseViewModel[],
  extraProps: Partial<Parameters<typeof ShellReleasesView>[0]> = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <HeaderActionsProvider>
        <RightPanelProvider>
          {/* Mimics the AuthShell header slot so the route's registered
              search adapter + header actions render in the DOM. */}
          <ShellReleasesView
            releases={releases}
            providerConfig={providerConfig}
            primaryProviders={primaryProviders}
            artistName='Bahamas'
            {...extraProps}
          />
          <HeaderActionsProbe />
          <RightPanelProbe />
        </RightPanelProvider>
      </HeaderActionsProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  testState.realActionMenu = false;
  navigationState.searchParams = new URLSearchParams();
  mockUseDspMatchesQuery.mockReturnValue({ data: [], isLoading: false });
  mockUsePlanGate.mockReturnValue({
    isLoading: false,
    isError: false,
    smartLinksLimit: null,
    isPro: true,
    canCreateManualReleases: true,
    canGenerateAlbumArt: false,
    canGenerateReleasePlans: true,
    canEditSmartLinks: true,
    canAccessFutureReleases: true,
  });
});

describe('ShellReleasesView', () => {
  it('preserves an open row menu and focus when import completion starts eligibility loading', async () => {
    testState.realActionMenu = true;
    const user = userEvent.setup();
    renderShell([fakeRelease({ id: 'r1', title: 'Lost in the Light' })], {
      spotifyConnected: true,
      initialImporting: true,
    });
    expect(screen.getByTestId('releases-matrix')).toBeInTheDocument();
    const row = screen.getByRole('listitem', { name: /Lost in the Light/ });
    const progress = screen.getByTestId('spotify-import-progress-banner');
    const progressSlot = screen.getByTestId('release-import-progress-slot');
    expect(progress).toHaveAttribute('aria-hidden', 'false');
    await user.click(
      screen.getByRole('button', {
        name: 'Release actions for Lost in the Light',
      })
    );
    const menu = screen.getByRole('menu');
    const focusedControl = document.activeElement;
    expect(menu).toContainElement(focusedControl as HTMLElement);

    mockUseDspMatchesQuery.mockReturnValue({ data: [], isLoading: true });
    act(() => {
      vi.mocked(useImportPolling).mock.calls.at(-1)?.[0].onImportComplete();
    });

    expect(row).toBeInTheDocument();
    expect(screen.getByRole('menu')).toBe(menu);
    expect(focusedControl).toHaveFocus();
    expect(screen.getByTestId('release-import-progress-slot')).toBe(
      progressSlot
    );
    expect(screen.getByTestId('spotify-import-progress-banner')).toBe(progress);
    expect(progress).toHaveAttribute('aria-hidden', 'true');

    mockUseDspMatchesQuery.mockReturnValue({ data: [], isLoading: false });
    act(() => {
      vi.mocked(useImportPolling)
        .mock.calls.at(-1)?.[0]
        .onReleasesUpdate([
          fakeRelease({ id: 'r1', title: 'Lost in the Light', totalTracks: 2 }),
        ]);
    });
    expect(screen.getByRole('menu')).toBe(menu);
    expect(focusedControl).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('preserves the drawer draft, selection and focus across import polling and completion', async () => {
    const user = userEvent.setup();
    renderShell([fakeRelease({ id: 'r1', title: 'Lost in the Light' })], {
      spotifyConnected: true,
      initialImporting: true,
    });
    await user.click(
      screen.getByRole('listitem', { name: /Lost in the Light/ })
    );
    const drawer = await screen.findByTestId('release-sidebar');
    const input = within(drawer).getByRole('textbox', {
      name: 'Release title draft',
    }) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, 'Unsaved draft');
    input.setSelectionRange(2, 7);

    mockUseDspMatchesQuery.mockReturnValue({ data: [], isLoading: true });
    act(() => {
      const callbacks = vi.mocked(useImportPolling).mock.calls.at(-1)?.[0];
      callbacks?.onReleasesUpdate([
        fakeRelease({ id: 'r1', title: 'Updated from Spotify' }),
      ]);
      callbacks?.onImportComplete();
    });

    expect(screen.getByTestId('release-sidebar')).toBe(drawer);
    expect(input).toHaveValue('Unsaved draft');
    expect(input).toHaveFocus();
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 7]);
    expect(
      screen.getByRole('listitem', { name: /Updated from Spotify/ })
    ).toHaveAttribute('data-selected', 'true');
  });

  it('waits to mount the list until Apple eligibility resolves, then commits banner and rows together', () => {
    mockUseDspMatchesQuery.mockReturnValue({ data: [], isLoading: true });
    const rendered = renderShell(
      [fakeRelease({ id: 'release-1', title: 'Wait for eligibility' })],
      { spotifyConnected: true }
    );

    expect(
      screen.queryByRole('listitem', { name: /Wait for eligibility/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('apple-music-sync-banner')
    ).not.toBeInTheDocument();

    mockUseDspMatchesQuery.mockReturnValue({ data: [], isLoading: false });
    rendered.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <HeaderActionsProvider>
          <RightPanelProvider>
            <ShellReleasesView
              releases={[
                fakeRelease({ id: 'release-1', title: 'Wait for eligibility' }),
              ]}
              providerConfig={providerConfig}
              primaryProviders={primaryProviders}
              artistName='Bahamas'
              spotifyConnected
            />
            <HeaderActionsProbe />
            <RightPanelProbe />
          </RightPanelProvider>
        </HeaderActionsProvider>
      </QueryClientProvider>
    );

    expect(
      screen.getByRole('listitem', { name: /Wait for eligibility/ })
    ).toBeInTheDocument();
    expect(screen.getByTestId('apple-music-sync-banner')).toBeInTheDocument();
  });

  it('keeps the settled no-banner release list mounted', () => {
    mockUseDspMatchesQuery.mockReturnValue({
      data: [{ status: 'confirmed' }],
      isLoading: false,
    });

    renderShell([fakeRelease({ id: 'release-2', title: 'Already linked' })], {
      spotifyConnected: true,
    });

    expect(
      screen.getByRole('listitem', { name: /Already linked/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('apple-music-sync-banner')
    ).not.toBeInTheDocument();
  });

  it('renders one row per release with title + artist', () => {
    renderShell([
      fakeRelease({ id: '1', title: 'Lost in the Light' }),
      fakeRelease({
        id: '2',
        title: 'Take Me Over',
        artistNames: ['Other'],
      }),
    ]);
    expect(screen.getByText('Lost in the Light')).toBeInTheDocument();
    expect(screen.getByText('Take Me Over')).toBeInTheDocument();
    expect(screen.getByText('Bahamas')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
    // List rows own real per-cell controls and keep their list owner
    // through the context-menu host wrappers.
    const list = screen.getByRole('list', { name: 'Releases' });
    expect(
      screen
        .getByRole('listitem', { name: 'Lost in the Light' })
        .closest('menu')
    ).toBe(list);
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(2);
  });

  it('keeps the release list axe list-clean through the real context-menu path', () => {
    // The default suite mock wraps rows in a div; the production
    // ContextMenuPrimitive.Trigger asChild renders the row host directly, so
    // the ul's children contract is only observable with the real menu.
    testState.realActionMenu = true;
    renderShell([
      fakeRelease({ id: '1', title: 'Lost in the Light' }),
      fakeRelease({ id: '2', title: 'Take Me Over' }),
    ]);

    // axe `list` rule: a ul's direct children must be li (script/template).
    // The context-menu wrapper is a presentation li, and each carries exactly
    // one listitem row — the row inside, never a nested second listitem.
    const list = screen.getByRole('list', { name: 'Releases' });
    const directChildren = [...list.children];
    expect(directChildren.length).toBeGreaterThanOrEqual(2);
    for (const child of directChildren) {
      expect(child.tagName).toBe('LI');
      expect(child).toHaveAttribute('role', 'presentation');
      expect(child).toHaveAttribute('data-shell-release-row-context-target');
      expect(child.querySelectorAll('[role="listitem"]')).toHaveLength(1);
    }
    // The listbox contract still resolves exactly one listitem per row.
    expect(screen.getAllByRole('listitem')).toHaveLength(directChildren.length);
  });

  it('shows the connect-Spotify empty state when not yet connected', () => {
    renderShell([]);
    expect(
      screen.getByText(/Connect Spotify To Get Started/)
    ).toBeInTheDocument();
  });

  it('exposes the connect-Spotify empty state as a real heading', () => {
    renderShell([]);
    // The e2e releases health spec and the axe heading outline resolve the
    // disconnected state by role=heading 'Connect Spotify' — the same shape
    // the connected empty state already renders.
    expect(
      screen.getByRole('heading', { name: /Connect Spotify To Get Started/ })
    ).toBeInTheDocument();
  });

  it('opens Spotify connection from the catalog connection route', () => {
    navigationState.searchParams = new URLSearchParams('connect=spotify');

    renderShell([]);

    const dialog = screen.getByTestId('spotify-connect-dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Connect Spotify' })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('textbox', {
        name: 'Search Spotify artists or paste a link',
      })
    ).toBeInTheDocument();
  });

  it('shows the connected empty state when connected with no releases', () => {
    renderShell([], { spotifyConnected: true });
    expect(screen.getByText(/No Releases Yet/)).toBeInTheDocument();
    expect(
      screen.getByTestId('shell-releases-empty-state-connected')
    ).not.toHaveAttribute('data-surface-variant');
  });

  it('opens and dismisses the production release drawer from a row', async () => {
    renderShell([fakeRelease({ id: 'r1', title: 'Lost in the Light' })]);

    const row = screen.getByRole('listitem', { name: /Lost in the Light/ });
    expect(row).not.toHaveAttribute('data-selected');

    fireEvent.click(row);

    expect(row).toHaveAttribute('data-selected', 'true');
    expect(await screen.findByTestId('release-sidebar')).toHaveTextContent(
      'Lost in the Light'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(row).not.toHaveAttribute('data-selected');
      expect(screen.queryByTestId('release-sidebar')).not.toBeInTheDocument();
    });
  });

  it('passes the same lifecycle and eligibility capabilities to the detail rail', async () => {
    renderShell([fakeRelease({ id: 'r1', title: 'Lost in the Light' })]);

    fireEvent.click(
      screen.getByRole('listitem', { name: /Lost in the Light/ })
    );
    const rail = await screen.findByTestId('release-sidebar');

    expect(rail).toHaveAttribute('data-has-delete', 'true');
    expect(rail).toHaveAttribute('data-has-status', 'true');
    expect(rail).toHaveAttribute('data-has-smartlink-gate', 'true');
    expect(rail).toHaveAttribute('data-is-smartlink-locked', 'false');
  });

  it('keeps selected row in sync when the drawer edits a release', async () => {
    renderShell([fakeRelease({ id: 'r1', title: 'Lost in the Light' })]);

    fireEvent.click(
      screen.getByRole('listitem', { name: /Lost in the Light/ })
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Save Edit' }));

    expect(screen.getByRole('listitem', { name: /Edited/ })).toHaveAttribute(
      'data-selected',
      'true'
    );
  });

  it('exposes production row actions for edit and smart-link copy', async () => {
    const { copyToClipboard } = await import('@/hooks/useClipboard');

    renderShell([fakeRelease({ id: 'r1', title: 'Lost in the Light' })]);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Release actions for Lost in the Light',
      })
    );
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Edit Release Links' })[0]
    );

    expect(await screen.findByTestId('release-sidebar')).toHaveTextContent(
      'Lost in the Light'
    );

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Copy Smart Link' })[0]
    );

    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledWith(
        expect.stringContaining('/lost-in-the-light')
      );
    });
  });

  it('registers release filtering behind the shared global search trigger', async () => {
    renderShell([
      fakeRelease({ id: '1', title: 'Alpha' }),
      fakeRelease({ id: '2', title: 'Beta' }),
    ]);
    const probe = await screen.findByTestId('header-actions-probe');
    expect(probe).toBeInTheDocument();
    expect(probe).toHaveAttribute('data-search-total', '2');
    const searchTrigger = await screen.findByRole('button', {
      name: /Search Jovie$/,
    });
    expect(searchTrigger).toHaveAttribute('data-app-search-trigger', 'true');
  });

  it('does not open a second route-filter popup from the shell trigger', async () => {
    renderShell([fakeRelease({ id: '1', title: 'Alpha' })]);

    expect(
      screen.queryByRole('combobox', { name: 'Filter releases' })
    ).not.toBeInTheDocument();

    fireEvent.click(
      await screen.findByRole('button', { name: /Search Jovie$/ })
    );

    expect(
      screen.queryByRole('combobox', { name: 'Filter releases' })
    ).not.toBeInTheDocument();
  });

  describe('entitlement gating', () => {
    it('shows open smart-link affordance for fully entitled users', () => {
      renderShell([
        fakeRelease({
          id: 'r1',
          title: 'Open Track',
          releaseDate: '2024-01-01',
        }),
      ]);

      expect(
        screen.getByLabelText('Open smart link for Open Track')
      ).toBeInTheDocument();
      expect(
        screen.queryByLabelText(/Smart link locked \(Pro\)/)
      ).not.toBeInTheDocument();
    });

    it('locks scheduled releases for free users without canAccessFutureReleases', async () => {
      mockUsePlanGate.mockReturnValue({
        isLoading: false,
        isError: false,
        smartLinksLimit: null,
        isPro: false,
        canCreateManualReleases: true,
        canGenerateAlbumArt: false,
        canGenerateReleasePlans: false,
        canEditSmartLinks: true,
        canAccessFutureReleases: false,
      });

      const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      renderShell([
        fakeRelease({
          id: 'future-1',
          title: 'Upcoming Drop',
          releaseDate: future,
        }),
      ]);

      expect(
        screen.getByLabelText('Scheduled smart link (Pro) for Upcoming Drop')
      ).toBeInTheDocument();
      expect(
        screen.queryByLabelText('Open smart link for Upcoming Drop')
      ).not.toBeInTheDocument();
      expect(
        await screen.findByTestId('smart-link-gate-banner-unreleased')
      ).toBeInTheDocument();
    });

    it('locks releases beyond smartLinksLimit with cap reason', () => {
      mockUsePlanGate.mockReturnValue({
        isLoading: false,
        isError: false,
        smartLinksLimit: 1,
        isPro: false,
        canCreateManualReleases: true,
        canGenerateAlbumArt: false,
        canGenerateReleasePlans: false,
        canEditSmartLinks: true,
        canAccessFutureReleases: true,
      });

      renderShell([
        fakeRelease({
          id: 'old',
          title: 'Older Release',
          releaseDate: '2020-01-01',
        }),
        fakeRelease({
          id: 'new',
          title: 'Newer Release',
          releaseDate: '2024-01-01',
        }),
      ]);

      // Cap allows oldest first up to limit — newer release is locked.
      expect(
        screen.getByLabelText('Smart link locked (Pro) for Newer Release')
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText('Open smart link for Older Release')
      ).toBeInTheDocument();
    });

    it('gates the row action menu copy item when the smart link is locked', () => {
      mockUsePlanGate.mockReturnValue({
        isLoading: false,
        isError: false,
        smartLinksLimit: null,
        isPro: false,
        canCreateManualReleases: true,
        canGenerateAlbumArt: false,
        canGenerateReleasePlans: false,
        canEditSmartLinks: true,
        canAccessFutureReleases: false,
      });

      const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      renderShell([
        fakeRelease({
          id: 'future-1',
          title: 'Upcoming Drop',
          releaseDate: future,
        }),
      ]);

      // Row menu should expose the scheduled-lock label, not "Copy smart link".
      expect(
        screen.getAllByRole('button', { name: 'Scheduled smart link (Pro)' })[0]
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Copy Smart Link' })
      ).not.toBeInTheDocument();
    });

    it('hides the manual create affordance when canCreateManualReleases is false', () => {
      mockUsePlanGate.mockReturnValue({
        isLoading: false,
        isError: false,
        smartLinksLimit: null,
        isPro: false,
        canCreateManualReleases: false,
        canGenerateAlbumArt: false,
        canGenerateReleasePlans: false,
        canEditSmartLinks: true,
        canAccessFutureReleases: true,
      });

      renderShell([], { spotifyConnected: true });

      expect(
        screen.queryByTestId('create-manual-action')
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('shell-releases-create-connected-empty')
      ).not.toBeInTheDocument();
    });
  });

  describe('entitlement gating', () => {
    it('shows open smart-link affordance for fully entitled users', () => {
      renderShell([
        fakeRelease({
          id: 'r1',
          title: 'Open Track',
          releaseDate: '2024-01-01',
        }),
      ]);

      expect(
        screen.getByLabelText('Open smart link for Open Track')
      ).toBeInTheDocument();
      expect(
        screen.queryByLabelText(/Smart link locked \(Pro\)/)
      ).not.toBeInTheDocument();
    });

    it('locks scheduled releases for free users without canAccessFutureReleases', async () => {
      mockUsePlanGate.mockReturnValue({
        isLoading: false,
        isError: false,
        smartLinksLimit: null,
        isPro: false,
        canCreateManualReleases: true,
        canGenerateAlbumArt: false,
        canGenerateReleasePlans: false,
        canEditSmartLinks: true,
        canAccessFutureReleases: false,
      });

      const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      renderShell([
        fakeRelease({
          id: 'future-1',
          title: 'Upcoming Drop',
          releaseDate: future,
        }),
      ]);

      expect(
        screen.getByLabelText('Scheduled smart link (Pro) for Upcoming Drop')
      ).toBeInTheDocument();
      expect(
        screen.queryByLabelText('Open smart link for Upcoming Drop')
      ).not.toBeInTheDocument();
      expect(
        await screen.findByTestId('smart-link-gate-banner-unreleased')
      ).toBeInTheDocument();
    });

    it('locks releases beyond smartLinksLimit with cap reason', () => {
      mockUsePlanGate.mockReturnValue({
        isLoading: false,
        isError: false,
        smartLinksLimit: 1,
        isPro: false,
        canCreateManualReleases: true,
        canGenerateAlbumArt: false,
        canGenerateReleasePlans: false,
        canEditSmartLinks: true,
        canAccessFutureReleases: true,
      });

      renderShell([
        fakeRelease({
          id: 'old',
          title: 'Older Release',
          releaseDate: '2020-01-01',
        }),
        fakeRelease({
          id: 'new',
          title: 'Newer Release',
          releaseDate: '2024-01-01',
        }),
      ]);

      // Cap allows oldest first up to limit — newer release is locked.
      expect(
        screen.getByLabelText('Smart link locked (Pro) for Newer Release')
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText('Open smart link for Older Release')
      ).toBeInTheDocument();
    });

    it('gates the row action menu copy item when the smart link is locked', () => {
      mockUsePlanGate.mockReturnValue({
        isLoading: false,
        isError: false,
        smartLinksLimit: null,
        isPro: false,
        canCreateManualReleases: true,
        canGenerateAlbumArt: false,
        canGenerateReleasePlans: false,
        canEditSmartLinks: true,
        canAccessFutureReleases: false,
      });

      const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      renderShell([
        fakeRelease({
          id: 'future-1',
          title: 'Upcoming Drop',
          releaseDate: future,
        }),
      ]);

      // Row menu should expose the scheduled-lock label, not "Copy smart link".
      expect(
        screen.getAllByRole('button', { name: 'Scheduled smart link (Pro)' })[0]
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Copy Smart Link' })
      ).not.toBeInTheDocument();
    });

    it('hides the manual create affordance when canCreateManualReleases is false', () => {
      mockUsePlanGate.mockReturnValue({
        isLoading: false,
        isError: false,
        smartLinksLimit: null,
        isPro: false,
        canCreateManualReleases: false,
        canGenerateAlbumArt: false,
        canGenerateReleasePlans: false,
        canEditSmartLinks: true,
        canAccessFutureReleases: true,
      });

      renderShell([], { spotifyConnected: true });

      expect(
        screen.queryByTestId('create-manual-action')
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('shell-releases-create-connected-empty')
      ).not.toBeInTheDocument();
    });
  });

  describe('keyboard navigation (JOV-1823)', () => {
    it('selects the first release on J key when nothing is selected', async () => {
      renderShell([
        fakeRelease({ id: 'r1', title: 'Alpha' }),
        fakeRelease({ id: 'r2', title: 'Beta' }),
      ]);

      const rows = screen.getAllByRole('listitem');
      expect(rows[0]).not.toHaveAttribute('data-selected');

      fireEvent.keyDown(document, { key: 'j' });

      await waitFor(() => {
        expect(rows[0]).toHaveAttribute('data-selected', 'true');
      });
    });

    it('moves selection down on J key and up on K key', async () => {
      renderShell([
        fakeRelease({ id: 'r1', title: 'Alpha' }),
        fakeRelease({ id: 'r2', title: 'Beta' }),
        fakeRelease({ id: 'r3', title: 'Gamma' }),
      ]);

      const rows = screen.getAllByRole('listitem');

      // J selects first
      fireEvent.keyDown(document, { key: 'j' });
      await waitFor(() =>
        expect(rows[0]).toHaveAttribute('data-selected', 'true')
      );

      // J again moves to second
      fireEvent.keyDown(document, { key: 'j' });
      await waitFor(() => {
        expect(rows[0]).not.toHaveAttribute('data-selected');
        expect(rows[1]).toHaveAttribute('data-selected', 'true');
      });

      // K moves back to first
      fireEvent.keyDown(document, { key: 'k' });
      await waitFor(() => {
        expect(rows[0]).toHaveAttribute('data-selected', 'true');
        expect(rows[1]).not.toHaveAttribute('data-selected');
      });
    });

    it('opens the release sidebar on Enter when a release is selected', async () => {
      renderShell([
        fakeRelease({ id: 'r1', title: 'Lost in the Light' }),
        fakeRelease({ id: 'r2', title: 'Take Me Over' }),
      ]);

      // Navigate to first release with J
      fireEvent.keyDown(document, { key: 'j' });
      await waitFor(() => {
        expect(screen.getAllByRole('listitem')[0]).toHaveAttribute(
          'data-selected',
          'true'
        );
      });

      // Enter should open the release sidebar
      fireEvent.keyDown(document, { key: 'Enter' });

      expect(await screen.findByTestId('release-sidebar')).toHaveTextContent(
        'Lost in the Light'
      );
    });

    it('does not fire J/K navigation when focus is inside a form element', () => {
      renderShell([
        fakeRelease({ id: 'r1', title: 'Alpha' }),
        fakeRelease({ id: 'r2', title: 'Beta' }),
      ]);

      const rows = screen.getAllByRole('listitem');
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      fireEvent.keyDown(input, { key: 'j' });

      // Selection should not change because focus is in a form element
      expect(rows[0]).not.toHaveAttribute('data-selected');
      document.body.removeChild(input);
    });

    it('does not fire J/K when a modifier key is held', () => {
      renderShell([fakeRelease({ id: 'r1', title: 'Alpha' })]);

      const rows = screen.getAllByRole('listitem');

      fireEvent.keyDown(document, { key: 'j', metaKey: true });

      expect(rows[0]).not.toHaveAttribute('data-selected');
    });
  });

  it('uses demo adapter fixtures and skips live sync and create', () => {
    const onSync = vi.fn();
    const onCreateRelease = vi.fn();
    renderShell([fakeRelease({ id: 'r1', title: 'Demo Single' })], {
      spotifyConnected: true,
      experienceAdapter: {
        mode: 'demo',
        entitlements: {
          isPro: true,
          canCreateManualReleases: true,
          canEditSmartLinks: true,
          canAccessFutureReleases: true,
          smartLinksLimit: null,
        },
        onSync,
        onCreateRelease,
        sidebarDataByReleaseId: {
          r1: {
            analytics: {
              totalClicks: 12,
              last7DaysClicks: 3,
              lastClickAt: null,
              providerClicks: [],
            },
            tracks: [],
          },
        },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sync' }));
    expect(onSync).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'New release' }));
    expect(onCreateRelease).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('listitem', { name: /Demo Single/ }));
    const sidebar = screen.getByTestId('release-sidebar');
    expect(sidebar).toHaveAttribute('data-analytics', 'override');
    expect(sidebar).toHaveAttribute('data-has-tracks', 'true');
    expect(sidebar).toHaveAttribute('data-show-credits', 'false');
  });
});
