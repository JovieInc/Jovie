import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const openSpy = vi.fn();

vi.stubGlobal('open', openSpy);

vi.mock('@/components/molecules/drawer', () => ({
  DrawerHeader: ({ actions }: { actions?: React.ReactNode }) => (
    <div>
      <h2>Release details</h2>
      {actions}
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
  upc: '123456789012',
  label: 'Test Label',
  totalTracks: 1,
  totalDurationMs: 185000,
  primaryIsrc: 'USRC17607839',
  genres: ['Indie Pop'],
  canvasStatus: 'not_set' as const,
};

describe('ReleaseSidebarHeader', () => {
  it('shows open smart link as always-visible action and opens in new tab', async () => {
    const user = userEvent.setup();

    render(
      <ReleaseSidebarHeader
        release={release}
        hasRelease
        onCopySmartLink={vi.fn()}
        panelMode='edit'
        onPanelModeChange={vi.fn()}
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

  it('renders edit/live mode toggle and switches to live mode', async () => {
    const user = userEvent.setup();
    const onPanelModeChange = vi.fn();

    render(
      <ReleaseSidebarHeader
        release={release}
        hasRelease
        onCopySmartLink={vi.fn()}
        panelMode='edit'
        onPanelModeChange={onPanelModeChange}
      />
    );

    await user.click(screen.getByRole('tab', { name: /live/i }));

    expect(onPanelModeChange).toHaveBeenCalledWith('live');
  });
});
