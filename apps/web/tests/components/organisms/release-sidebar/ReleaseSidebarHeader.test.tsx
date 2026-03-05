import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const openSpy = vi.fn();

vi.stubGlobal('open', openSpy);

vi.mock('@/components/molecules/drawer-header/DrawerHeaderActions', () => ({
  DrawerHeaderActions: ({
    overflowActions,
    onClose,
  }: {
    primaryActions: { id: string; label: string; onClick: () => void }[];
    overflowActions: { id: string; label: string; onClick: () => void }[];
    onClose?: () => void;
  }) => (
    <div>
      {overflowActions.map(
        (a: { id: string; label: string; onClick: () => void }) => (
          <button key={a.id} type='button' onClick={a.onClick}>
            {a.label}
          </button>
        )
      )}
      {onClose && (
        <button type='button' onClick={onClose}>
          Close
        </button>
      )}
    </div>
  ),
}));

const { ReleaseSidebarHeader } = await import(
  '@/components/organisms/release-sidebar/ReleaseSidebarHeader'
);

const release = {
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

describe('ReleaseSidebarHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows open smart link action and opens in new tab', async () => {
    const user = userEvent.setup();

    render(
      <ReleaseSidebarHeader
        release={release}
        hasRelease
        onCopySmartLink={vi.fn()}
      />
    );

    const openButton = screen.getByRole('button', { name: /open smart link/i });
    await user.click(openButton);

    expect(openSpy).toHaveBeenCalledWith(
      '/r/test-release--profile_1',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('displays release title in header', () => {
    render(
      <ReleaseSidebarHeader
        release={release}
        hasRelease
        onCopySmartLink={vi.fn()}
      />
    );

    expect(screen.getByText('Test Release')).toBeInTheDocument();
  });

  it('displays artist name when provided', () => {
    render(
      <ReleaseSidebarHeader
        release={release}
        hasRelease
        artistName='Test Artist'
        onCopySmartLink={vi.fn()}
      />
    );

    expect(screen.getByText('Test Artist')).toBeInTheDocument();
  });

  it('close action is available in overflow menu', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <ReleaseSidebarHeader
        release={release}
        hasRelease
        onClose={onClose}
        onCopySmartLink={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
