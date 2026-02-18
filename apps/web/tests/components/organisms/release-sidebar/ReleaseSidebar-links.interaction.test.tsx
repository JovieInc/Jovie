import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// Mock RightDrawer
vi.mock('@/components/organisms/RightDrawer', () => ({
  RightDrawer: ({
    children,
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => <div data-testid='right-drawer'>{children}</div>,
}));

// Mock drawer components
vi.mock('@/components/molecules/drawer', () => ({
  DrawerEmptyState: ({ message }: { message: string }) => (
    <p data-testid='empty-state'>{message}</p>
  ),
  DrawerLinkSection: ({
    title,
    children,
  }: {
    title: string;
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <div data-testid='link-section'>
      <span>{title}</span>
      {children}
    </div>
  ),
  SidebarLinkRow: ({
    label,
    url,
  }: {
    label?: string;
    url?: string;
    [key: string]: unknown;
  }) => <div data-testid='link-row'>{label ?? url}</div>,
}));

// Mock sub-components that are not under test
vi.mock('@/components/organisms/release-sidebar/ReleaseSidebarHeader', () => ({
  ReleaseSidebarHeader: () => <div data-testid='sidebar-header'>Header</div>,
}));

vi.mock('@/components/organisms/release-sidebar/ReleaseArtwork', () => ({
  ReleaseArtwork: () => <div data-testid='artwork'>Artwork</div>,
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

vi.mock('@/components/organisms/release-sidebar/ReleaseSettings', () => ({
  ReleaseSettings: () => <div data-testid='settings'>Settings</div>,
}));

vi.mock('@/components/organisms/release-sidebar/TrackDetailPanel', () => ({
  TrackDetailPanel: () => <div>Track Detail</div>,
}));

vi.mock('@/components/organisms/release-sidebar/ReleaseDspLinks', () => ({
  ReleaseDspLinks: () => <div data-testid='dsp-links'>DSP Links Content</div>,
}));

// Mock utilities
vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/constants/layout', () => ({
  SIDEBAR_WIDTH: 360,
}));

vi.mock('@/lib/utils/platform-detection', () => ({
  getBaseUrl: () => 'https://jovie.com',
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
  it('shows empty state when no release selected', () => {
    render(<ReleaseSidebar release={null} {...defaultProps} />);

    expect(screen.getByTestId('empty-state')).toHaveTextContent(
      'Select a release in the table to view its details.'
    );
  });

  it('tab switching between Catalog, Links, Details works', async () => {
    const user = userEvent.setup();
    render(<ReleaseSidebar release={mockRelease} {...defaultProps} />);

    // Catalog tab active by default — Fields and Tracks visible
    expect(screen.getByTestId('fields')).toBeInTheDocument();
    expect(screen.getByTestId('tracklist')).toBeInTheDocument();
    expect(screen.queryByTestId('dsp-links')).not.toBeInTheDocument();

    // Switch to Links tab
    await user.click(screen.getByRole('tab', { name: /links/i }));
    expect(screen.getByTestId('dsp-links')).toBeInTheDocument();
    expect(screen.queryByTestId('fields')).not.toBeInTheDocument();

    // Switch to Details tab
    await user.click(screen.getByRole('tab', { name: /details/i }));
    expect(screen.getByTestId('metadata')).toBeInTheDocument();
    expect(screen.queryByTestId('dsp-links')).not.toBeInTheDocument();

    // Switch back to Catalog
    await user.click(screen.getByRole('tab', { name: /catalog/i }));
    expect(screen.getByTestId('fields')).toBeInTheDocument();
  });

  it('tab resets to Catalog when release changes', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ReleaseSidebar release={mockRelease} {...defaultProps} />
    );

    // Switch to Links tab
    await user.click(screen.getByRole('tab', { name: /links/i }));
    expect(screen.getByTestId('dsp-links')).toBeInTheDocument();

    // Change release
    const newRelease = { ...mockRelease, id: 'release_2' };
    rerender(<ReleaseSidebar release={newRelease} {...defaultProps} />);

    // Should reset to Catalog
    expect(screen.getByTestId('fields')).toBeInTheDocument();
    expect(screen.queryByTestId('dsp-links')).not.toBeInTheDocument();
  });

  it('Links tab renders DSP links component', async () => {
    const user = userEvent.setup();
    render(<ReleaseSidebar release={mockRelease} {...defaultProps} />);

    await user.click(screen.getByRole('tab', { name: /links/i }));
    expect(screen.getByTestId('dsp-links')).toHaveTextContent(
      'DSP Links Content'
    );
  });
});
