import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUsePlanGate = vi.fn(() => ({
  canAccessTasksWorkspace: true,
  isLoading: false,
}));
const mockFetchReleaseCreditsAction = vi.fn();

// ReleaseSidebar directly uses SegmentControl from @jovie/ui for tab navigation.
// All other sub-components that use additional @jovie/ui parts are mocked below,
// so only SegmentControl needs to be provided here.
vi.mock('@jovie/ui', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@jovie/ui');
  return {
    ...actual,
    SegmentControl: ({
      value,
      onValueChange,
      options,
    }: {
      value: string;
      onValueChange: (value: string) => void;
      options: Array<{ value: string; label: string }>;
    }) => (
      <div>
        {options.map(option => (
          <button
            key={option.value}
            type='button'
            aria-selected={value === option.value}
            role='tab'
            onClick={() => onValueChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    ),
    // ContextMenu components are imported transitively by AlbumArtworkContextMenu
    // (which is mocked below, but the module still loads), so provide passthroughs.
    ContextMenu: ({ children }: { children?: React.ReactNode }) => (
      <>{children}</>
    ),
    ContextMenuContent: ({ children }: { children?: React.ReactNode }) => (
      <>{children}</>
    ),
    ContextMenuItem: ({ children }: { children?: React.ReactNode }) => (
      <>{children}</>
    ),
    ContextMenuLabel: ({ children }: { children?: React.ReactNode }) => (
      <>{children}</>
    ),
    ContextMenuSeparator: () => <hr />,
    ContextMenuTrigger: ({ children }: { children?: React.ReactNode }) => (
      <>{children}</>
    ),
  };
});

// Mock drawer molecules — EntitySidebarShell renders children with empty state support.
vi.mock('@/components/molecules/drawer', () => ({
  EntitySidebarShell: ({
    children,
    contextMenuItems,
    isEmpty,
    emptyMessage,
    entityHeader,
    tabs,
    footer,
  }: {
    children?: React.ReactNode;
    isEmpty?: boolean;
    emptyMessage?: string;
    entityHeader?: React.ReactNode;
    tabs?: React.ReactNode;
    footer?: React.ReactNode;
    contextMenuItems?: Array<{
      id?: string;
      type?: string;
      label?: string;
      onClick?: () => void;
    }>;
    [key: string]: unknown;
  }) =>
    isEmpty ? (
      <p data-testid='empty-state'>{emptyMessage}</p>
    ) : (
      <div data-testid='right-drawer'>
        {entityHeader}
        {tabs}
        {contextMenuItems?.map(item =>
          item.type === 'action' && item.label ? (
            <button
              key={item.id ?? item.label}
              type='button'
              data-testid={`context-menu-${item.id ?? item.label}`}
              onClick={item.onClick}
            >
              {item.label}
            </button>
          ) : null
        )}
        {children}
        {footer}
      </div>
    ),
  EntityHeaderCard: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DrawerEmptyState: ({ message }: { message: string }) => (
    <p data-testid='empty-state'>{message}</p>
  ),
  DrawerSection: ({
    children,
    title,
    testId,
    defaultOpen = true,
    collapsible,
  }: {
    children?: React.ReactNode;
    title?: string;
    testId?: string;
    defaultOpen?: boolean;
    collapsible?: boolean;
  }) => {
    const isCollapsible = collapsible ?? Boolean(title);
    const isClosed = isCollapsible && !defaultOpen;

    return (
      <section data-testid={testId}>
        {title ? <h3>{title}</h3> : null}
        {!isClosed ? children : null}
      </section>
    );
  },
  DrawerLinkSection: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarLinkRow: () => null,
  DrawerAsyncToggle: ({ label }: { label: string }) => (
    <div data-testid='async-toggle'>{label}</div>
  ),
  DrawerCardActionBar: () => <div data-testid='drawer-card-action-bar' />,
  DrawerMediaThumb: () => <div data-testid='drawer-media-thumb' />,
  DrawerSurfaceCard: ({
    children,
    className,
    testId,
    variant,
  }: {
    children?: React.ReactNode;
    className?: string;
    testId?: string;
    variant?: 'card' | 'flat';
  }) => (
    <div
      className={className}
      data-testid={testId}
      data-surface-variant={variant}
    >
      {children}
    </div>
  ),
  DrawerInspectorStack: ({
    children,
    'data-testid': testId,
  }: {
    children?: React.ReactNode;
    'data-testid'?: string;
  }) => <div data-testid={testId}>{children}</div>,
  DrawerInspectorCard: ({
    children,
    title,
    actions,
    'data-testid': testId,
  }: {
    children?: React.ReactNode;
    title: string;
    actions?: React.ReactNode;
    'data-testid'?: string;
  }) => (
    <section data-testid={testId}>
      <h3>{title}</h3>
      {actions}
      {children}
    </section>
  ),
  DrawerFormGridRow: ({
    children,
    label,
  }: {
    children?: React.ReactNode;
    label: React.ReactNode;
  }) => (
    <div>
      <span>{label}</span>
      {children}
    </div>
  ),
  DrawerTabs: ({
    value,
    onValueChange,
    options,
    actions,
    overflowMode,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
    actions?: React.ReactNode;
    overflowMode?: 'wrap' | 'scroll';
  }) => (
    <div data-overflow-mode={overflowMode} data-testid='drawer-tabs'>
      {options.map(option => (
        <button
          key={option.value}
          data-testid={`drawer-tab-${option.value}`}
          type='button'
          aria-selected={value === option.value}
          role='tab'
          onClick={() => onValueChange(option.value)}
        >
          {option.label}
        </button>
      ))}
      {actions}
    </div>
  ),
  DrawerSplitButton: ({
    primaryAction,
    menuItems,
  }: {
    primaryAction?: {
      ariaLabel: string;
      label?: string;
      onClick: () => void;
      testId?: string;
    };
    menuItems?: Array<{
      id: string;
      label?: string;
      onClick?: () => void;
    }>;
  }) =>
    !primaryAction && (!menuItems || menuItems.length === 0) ? null : (
      <div data-testid='drawer-split-button'>
        {primaryAction ? (
          <button
            type='button'
            aria-label={primaryAction.ariaLabel}
            onClick={primaryAction.onClick}
            data-testid={primaryAction.testId}
          >
            {primaryAction.label ?? primaryAction.ariaLabel}
          </button>
        ) : null}
        {menuItems?.map(item => (
          <button
            key={item.id}
            type='button'
            onClick={item.onClick}
            data-testid={`drawer-split-menu-item-${item.id}`}
          >
            {item.label}
          </button>
        ))}
      </div>
    ),
  DrawerTabbedCard: ({
    children,
    tabs,
    controls,
    testId,
  }: {
    children?: React.ReactNode;
    tabs?: React.ReactNode;
    controls?: React.ReactNode;
    testId?: string;
  }) => (
    <div data-testid={testId}>
      {tabs}
      {controls}
      {children}
    </div>
  ),
}));

// Mock sub-components that are not under test — useReleaseHeaderParts hook
vi.mock('@/components/organisms/release-sidebar/ReleaseSidebarHeader', () => ({
  useReleaseHeaderParts: () => ({
    headerLabel: '',
    primaryActions: [],
    overflowActions: [],
  }),
}));

vi.mock('next/image', () => ({
  default: (props: { alt: string }) => <img alt={props.alt} />,
}));

vi.mock('@/components/atoms/Icon', () => ({
  Icon: () => <span data-testid='icon' />,
}));

vi.mock('@/components/molecules/UpgradeButton', () => ({
  UpgradeButton: ({ children }: { children: React.ReactNode }) => (
    <button type='button'>{children}</button>
  ),
}));

vi.mock('@/features/release/AlbumArtworkContextMenu', () => ({
  AlbumArtworkContextMenu: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='artwork-menu'>{children}</div>
  ),
  buildArtworkSizes: () => ({}),
}));

vi.mock('@/components/organisms/AvatarUploadable', () => ({
  AvatarUploadable: () => <div data-testid='artwork'>Artwork</div>,
}));

vi.mock('@/components/organisms/release-sidebar/ReleaseFields', () => ({
  ReleaseFields: () => <div data-testid='fields'>Fields</div>,
}));

vi.mock('@/components/organisms/release-sidebar/ReleaseTrackList', () => ({
  ReleaseTrackList: () => <div data-testid='tracklist'>Tracks</div>,
}));

vi.mock('@/components/organisms/release-sidebar/ReleaseMetadata', () => ({
  ReleaseMetadata: ({ variant }: { variant?: 'card' | 'flat' }) => (
    <div data-testid='metadata' data-variant={variant ?? 'card'}>
      Metadata
    </div>
  ),
}));

vi.mock('@/components/organisms/release-sidebar/ReleaseCreditsSection', () => ({
  ReleaseCreditsSection: ({ variant }: { variant?: 'card' | 'flat' }) => (
    <div data-testid='credits' data-variant={variant ?? 'card'}>
      Credits
    </div>
  ),
}));

vi.mock('@/app/app/(shell)/dashboard/releases/actions', () => ({
  updateAllowArtworkDownloads: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/components/organisms/release-sidebar/ReleaseLyricsSection', () => ({
  ReleaseLyricsSection: ({ variant }: { variant?: 'card' | 'flat' }) => (
    <div data-testid='lyrics' data-variant={variant ?? 'card'}>
      Lyrics
    </div>
  ),
}));

vi.mock('@/components/organisms/release-sidebar/TrackDetailPanel', () => ({
  TrackDetailPanel: () => <div>Track Detail</div>,
}));

vi.mock('@/components/organisms/release-sidebar/ReleaseDspLinks', () => ({
  ReleaseDspLinks: ({ isAddingLink }: { isAddingLink?: boolean }) => (
    <div
      data-testid='dsp-links'
      data-adding-link={isAddingLink ? 'true' : 'false'}
    >
      DSP Links Content
    </div>
  ),
}));

vi.mock('@/components/organisms/release-sidebar/ReleaseCreditsSection', () => ({
  ReleaseCreditsSection: ({ variant }: { variant?: 'card' | 'flat' }) => (
    <div data-testid='release-credits' data-variant={variant ?? 'card'}>
      Credits
    </div>
  ),
}));

vi.mock(
  '@/components/organisms/release-sidebar/release-credits-action',
  () => ({
    fetchReleaseCreditsAction: (...args: unknown[]) =>
      mockFetchReleaseCreditsAction(...args),
  })
);

vi.mock('@/components/organisms/release-sidebar/ReleasePitchSection', () => ({
  ReleasePitchSection: ({ variant }: { variant?: 'card' | 'flat' }) => (
    <div data-testid='pitch-section' data-variant={variant ?? 'card'}>
      Pitch Section
    </div>
  ),
}));

vi.mock(
  '@/components/organisms/release-sidebar/ReleaseTargetPlaylistsSection',
  () => ({
    ReleaseTargetPlaylistsSection: ({
      variant,
    }: {
      variant?: 'card' | 'flat';
    }) => (
      <div
        data-testid='target-playlists-section'
        data-variant={variant ?? 'card'}
      >
        Target Playlists
      </div>
    ),
  })
);

vi.mock('@/components/features/dashboard/release-tasks', () => ({
  ReleaseTaskChecklist: () => <div data-testid='task-checklist'>Tasks</div>,
}));

vi.mock('@/lib/queries', () => ({
  usePlanGate: () => mockUsePlanGate(),
}));

vi.mock('@/constants/routes', () => ({
  APP_ROUTES: {
    DASHBOARD_RELEASES: '/dashboard/releases',
    DASHBOARD_RELEASE_TASKS: '/dashboard/releases/[releaseId]/tasks',
  },
}));

vi.mock(
  '@/components/organisms/release-sidebar/ReleaseSmartLinkSection',
  () => ({
    ReleaseSmartLinkSection: () => (
      <div data-testid='smart-link-section'>Smart Link Content</div>
    ),
  })
);

vi.mock(
  '@/components/organisms/release-sidebar/ReleaseSmartLinkAnalytics',
  () => ({
    ReleaseSmartLinkAnalytics: () => (
      <div data-testid='analytics'>Analytics</div>
    ),
  })
);

// Utilities
vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/utils/platform-detection', () => ({
  getBaseUrl: () => 'https://jov.ie',
}));

vi.mock('@/lib/utm', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/utm')>();

  return {
    ...actual,
    buildUTMContext: () => ({}),
    getUTMShareContextMenuItems: () => [],
    getUTMShareDropdownItems: () => [],
  };
});

// Import after mocks
const { ReleaseSidebar } = await import(
  '@/components/organisms/release-sidebar/ReleaseSidebar'
);

const mockRelease = {
  id: 'release_1',
  profileId: 'profile_1',
  title: 'Test Release',
  releaseDate: '2025-06-01T00:00:00.000Z',
  artworkUrl: 'https://example.com/art.jpg',
  slug: 'test-release',
  smartLinkPath: '/r/test-release--profile_1',
  spotifyPopularity: 72,
  providers: [],
  releaseType: 'single' as const,
  isExplicit: false,
  upc: '123456789012',
  label: 'Test Label',
  totalTracks: 1,
  totalDurationMs: 185000,
  primaryIsrc: 'USRC17607839',
  genres: ['Indie Pop'],
  canvasStatus: 'not_set' as const,
};

const defaultProps = {
  mode: 'admin' as const,
  isOpen: true,
  providerConfig: {} as Record<string, { label: string; accent: string }>,
};

describe('ReleaseSidebar inspector cards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePlanGate.mockReturnValue({
      canAccessTasksWorkspace: true,
      isLoading: false,
    });
    mockFetchReleaseCreditsAction.mockResolvedValue([]);
  });

  it('shows empty state when no release selected', () => {
    render(<ReleaseSidebar release={null} {...defaultProps} />);

    expect(screen.getByTestId('empty-state')).toHaveTextContent(
      'Select a release in the table to view its details.'
    );
  });

  it('renders the release drawer with four primary tabs and overview content', () => {
    render(<ReleaseSidebar release={mockRelease} {...defaultProps} />);

    expect(screen.getByTestId('release-tabbed-card')).toBeInTheDocument();
    expect(screen.getByTestId('drawer-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('drawer-tab-overview')).toBeInTheDocument();
    expect(screen.getByTestId('drawer-tab-dsps')).toBeInTheDocument();
    expect(screen.getByTestId('drawer-tab-tasks')).toBeInTheDocument();
    expect(screen.getByTestId('drawer-tab-pitch')).toBeInTheDocument();
    expect(screen.getByTestId('release-properties-card')).toBeInTheDocument();
    expect(screen.getByTestId('metadata')).toHaveAttribute(
      'data-variant',
      'flat'
    );
    expect(screen.getByTestId('release-credits')).toHaveAttribute(
      'data-variant',
      'flat'
    );
    expect(screen.queryByTestId('dsp-links')).not.toBeInTheDocument();
    expect(screen.getByTestId('release-lyrics-card')).toBeInTheDocument();
    expect(screen.getByText('Lyrics')).toBeInTheDocument();
    expect(screen.queryByTestId('lyrics')).not.toBeInTheDocument();
    expect(screen.queryByTestId('async-toggle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pitch-section')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('target-playlists-section')
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('task-checklist')).not.toBeInTheDocument();
  });

  it('shows the compact upgrade card when task access is locked', async () => {
    mockUsePlanGate.mockReturnValue({
      canAccessTasksWorkspace: false,
      isLoading: false,
    });
    const user = userEvent.setup();

    render(<ReleaseSidebar release={mockRelease} {...defaultProps} />);
    await user.click(screen.getByTestId('drawer-tab-tasks'));

    expect(
      screen.getByTestId('compact-release-plan-upgrade-card')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('task-checklist')).not.toBeInTheDocument();
  });

  it('shows a loading state instead of the lock card while task access is resolving', async () => {
    mockUsePlanGate.mockReturnValue({
      canAccessTasksWorkspace: false,
      isLoading: true,
    });
    const user = userEvent.setup();

    render(<ReleaseSidebar release={mockRelease} {...defaultProps} />);
    await user.click(screen.getByTestId('drawer-tab-tasks'));

    expect(
      screen.getByTestId('release-tasks-loading-state')
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('compact-release-plan-upgrade-card')
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('task-checklist')).not.toBeInTheDocument();
  });

  it('does not render the generic Releases title row above the entity card', () => {
    render(<ReleaseSidebar release={mockRelease} {...defaultProps} />);

    expect(screen.queryByText(/^Releases$/)).not.toBeInTheDocument();
    expect(screen.getByTestId('release-header-card')).toBeInTheDocument();
  });

  it('opts into the card surface variant contract', () => {
    render(<ReleaseSidebar release={mockRelease} {...defaultProps} />);

    expect(screen.getByTestId('release-header-card')).toHaveAttribute(
      'data-surface-variant',
      'card'
    );
    expect(screen.getByTestId('release-properties-card')).toBeInTheDocument();
    expect(screen.getByTestId('release-tabbed-card')).toBeInTheDocument();
    expect(
      screen.queryByTestId('release-inspector-stack')
    ).not.toBeInTheDocument();
  });

  it('resets the active tab to Details when the release changes', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ReleaseSidebar release={mockRelease} {...defaultProps} />
    );

    await user.click(screen.getByTestId('drawer-tab-dsps'));
    expect(screen.getByTestId('dsp-links')).toBeInTheDocument();
    expect(
      screen.queryByTestId('release-properties-card')
    ).not.toBeInTheDocument();

    const newRelease = { ...mockRelease, id: 'release_2' };
    rerender(<ReleaseSidebar release={newRelease} {...defaultProps} />);

    expect(screen.getByTestId('release-properties-card')).toBeInTheDocument();
    expect(screen.queryByTestId('dsp-links')).not.toBeInTheDocument();
  });

  it('shows DSP actions only on the DSPs tab', async () => {
    const user = userEvent.setup();
    render(
      <ReleaseSidebar
        release={mockRelease}
        {...defaultProps}
        providerConfig={{
          spotify: { label: 'Spotify', accent: '#1DB954' },
        }}
        onRescanIsrc={vi.fn()}
      />
    );

    expect(screen.queryByTestId('drawer-split-button')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('drawer-tab-dsps'));
    expect(screen.getByTestId('dsp-links')).toBeInTheDocument();
    expect(screen.getByTestId('drawer-split-button')).toBeInTheDocument();
    expect(
      screen.getByTestId('release-sidebar-add-dsp-link')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('drawer-split-menu-item-refresh-platform-links')
    ).toBeInTheDocument();
  });

  it('opens the DSP tab and add-link form from the edit release links action', async () => {
    const user = userEvent.setup();
    render(
      <ReleaseSidebar
        release={mockRelease}
        {...defaultProps}
        providerConfig={{
          spotify: { label: 'Spotify', accent: '#1DB954' },
        }}
      />
    );

    await user.click(screen.getByTestId('context-menu-edit'));

    expect(screen.getByTestId('drawer-tab-dsps')).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByTestId('dsp-links')).toHaveAttribute(
      'data-adding-link',
      'true'
    );
    expect(screen.queryByTestId('metadata')).not.toBeInTheDocument();
  });

  it('smart link analytics card renders when a release is selected', async () => {
    render(<ReleaseSidebar release={mockRelease} {...defaultProps} />);

    // Smart link + analytics are combined in one card
    expect(screen.getByTestId('analytics')).toBeInTheDocument();
  });

  it('renders the release drawer as header, analytics, and four primary tabs', () => {
    render(<ReleaseSidebar release={mockRelease} {...defaultProps} />);

    expect(screen.getByTestId('release-header-card')).toBeInTheDocument();
    expect(screen.getByTestId('drawer-card-action-bar')).toBeInTheDocument();
    expect(screen.getByTestId('analytics')).toBeInTheDocument();
    expect(screen.getByTestId('release-properties-card')).toBeInTheDocument();
    expect(screen.getByTestId('drawer-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('release-tabbed-card')).toBeInTheDocument();
    expect(screen.getByTestId('release-lyrics-card')).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(
      screen.queryByTestId('release-credits-card-stack')
    ).not.toBeInTheDocument();
  });

  it('switches between Overview, Links, Tasks, and Pitch tabs', async () => {
    const user = userEvent.setup();
    render(<ReleaseSidebar release={mockRelease} {...defaultProps} />);

    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByTestId('metadata')).toBeInTheDocument();

    await user.click(screen.getByTestId('drawer-tab-dsps'));
    expect(screen.getByTestId('dsp-links')).toBeInTheDocument();
    expect(screen.queryByTestId('metadata')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('drawer-tab-tasks'));
    expect(screen.getByTestId('release-tasks-card')).toBeInTheDocument();
    expect(screen.queryByTestId('dsp-links')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('drawer-tab-pitch'));
    expect(screen.getByTestId('release-pitch-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('release-tasks-card')).not.toBeInTheDocument();
  });

  it('renders the Tracks collapsible only when the release has tracks', () => {
    const { rerender } = render(
      <ReleaseSidebar release={mockRelease} {...defaultProps} />
    );
    expect(screen.getByTestId('release-tracks-card')).toBeInTheDocument();

    rerender(
      <ReleaseSidebar
        release={{ ...mockRelease, totalTracks: 0 }}
        {...defaultProps}
      />
    );
    expect(screen.queryByTestId('release-tracks-card')).not.toBeInTheDocument();
  });

  it('renders the properties panel with flat metadata and credits content', () => {
    render(<ReleaseSidebar release={mockRelease} {...defaultProps} />);

    expect(screen.getByTestId('release-credits')).toHaveAttribute(
      'data-variant',
      'flat'
    );
  });
});
