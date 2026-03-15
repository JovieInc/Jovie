import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    [key: string]: unknown;
  }) =>
    isEmpty ? (
      <p data-testid='empty-state'>{emptyMessage}</p>
    ) : (
      <div data-testid='right-drawer'>
        {entityHeader}
        {tabs}
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
  DrawerSection: ({ children }: { children?: React.ReactNode }) => (
    <section>{children}</section>
  ),
  DrawerLinkSection: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarLinkRow: () => null,
  DrawerAsyncToggle: ({ label }: { label: string }) => (
    <div data-testid='async-toggle'>{label}</div>
  ),
  DrawerMediaThumb: () => <div data-testid='drawer-media-thumb' />,
  DrawerTabs: ({
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
}));

// Mock sub-components that are not under test — useReleaseHeaderParts hook
vi.mock('@/components/organisms/release-sidebar/ReleaseSidebarHeader', () => ({
  useReleaseHeaderParts: () => ({ title: 'Header', actions: null }),
}));

vi.mock('next/image', () => ({
  default: (props: { alt: string }) => <img alt={props.alt} />,
}));

vi.mock('@/components/atoms/Icon', () => ({
  Icon: () => <span data-testid='icon' />,
}));

vi.mock('@/components/release/AlbumArtworkContextMenu', () => ({
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
  ReleaseMetadata: () => <div data-testid='metadata'>Metadata</div>,
}));

vi.mock('@/app/app/(shell)/dashboard/releases/actions', () => ({
  updateAllowArtworkDownloads: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/components/organisms/release-sidebar/ReleaseLyricsSection', () => ({
  ReleaseLyricsSection: () => <div data-testid='lyrics'>Lyrics</div>,
}));

vi.mock('@/components/organisms/release-sidebar/TrackDetailPanel', () => ({
  TrackDetailPanel: () => <div>Track Detail</div>,
}));

vi.mock('@/components/organisms/release-sidebar/ReleaseDspLinks', () => ({
  ReleaseDspLinks: () => <div data-testid='dsp-links'>DSP Links Content</div>,
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

vi.mock('@/lib/utm', () => ({
  buildUTMContext: () => ({}),
  getUTMShareDropdownItems: () => [],
}));

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

describe('ReleaseSidebar Links tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows empty state when no release selected', () => {
    render(<ReleaseSidebar release={null} {...defaultProps} />);

    expect(screen.getByTestId('empty-state')).toHaveTextContent(
      'Select a release in the table to view its details.'
    );
  });

  it('tab switching between Track list, Links, Details, and Lyrics works', async () => {
    const user = userEvent.setup();
    render(<ReleaseSidebar release={mockRelease} {...defaultProps} />);

    // Track list tab active by default — Tracks visible
    expect(screen.getByTestId('tracklist')).toBeInTheDocument();
    expect(screen.queryByTestId('dsp-links')).not.toBeInTheDocument();

    // Switch to Links tab
    await user.click(screen.getByRole('tab', { name: /platforms/i }));
    expect(screen.getByTestId('dsp-links')).toBeInTheDocument();
    expect(screen.queryByTestId('tracklist')).not.toBeInTheDocument();

    // Switch to Details tab
    await user.click(screen.getByRole('tab', { name: /details/i }));
    expect(screen.getAllByText('Metadata').length).toBeGreaterThan(0);
    expect(screen.getByTestId('metadata')).toBeInTheDocument();
    expect(screen.getByTestId('async-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('lyrics')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dsp-links')).not.toBeInTheDocument();

    // Switch to Lyrics tab
    await user.click(screen.getByRole('tab', { name: /lyrics/i }));
    expect(screen.getByTestId('lyrics')).toBeInTheDocument();
    expect(screen.queryByTestId('metadata')).not.toBeInTheDocument();

    // Switch back to Track list
    await user.click(screen.getByRole('tab', { name: /tracks/i }));
    expect(screen.getByTestId('tracklist')).toBeInTheDocument();
  });

  it('preserves active tab when release changes', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ReleaseSidebar release={mockRelease} {...defaultProps} />
    );

    // Switch to Links tab
    await user.click(screen.getByRole('tab', { name: /platforms/i }));
    expect(screen.getByTestId('dsp-links')).toBeInTheDocument();

    // Change release
    const newRelease = { ...mockRelease, id: 'release_2' };
    rerender(<ReleaseSidebar release={newRelease} {...defaultProps} />);

    // Should preserve the Links tab for workflow continuity
    expect(screen.getByTestId('dsp-links')).toBeInTheDocument();
  });

  it('Links tab renders DSP links section', async () => {
    const user = userEvent.setup();
    render(<ReleaseSidebar release={mockRelease} {...defaultProps} />);

    await user.click(screen.getByRole('tab', { name: /platforms/i }));
    expect(screen.getByTestId('dsp-links')).toBeInTheDocument();
  });

  it('smart link section renders in header area', async () => {
    render(<ReleaseSidebar release={mockRelease} {...defaultProps} />);

    // Smart link is always visible in the header when a release is selected
    expect(screen.getByTestId('smart-link-section')).toHaveTextContent(
      'Smart Link Content'
    );
  });
});
