import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  TrackSidebar,
  type TrackSidebarData,
} from '@/components/organisms/release-sidebar/TrackSidebar';

function buildTrack(
  overrides: Partial<TrackSidebarData> = {}
): TrackSidebarData {
  return {
    id: 'track-1',
    title: 'Midnight Echo',
    slug: 'midnight-echo',
    smartLinkPath: '/r/midnight-echo/track-1',
    trackNumber: 1,
    discNumber: 1,
    durationMs: 181000,
    isrc: 'USRC17607839',
    isExplicit: false,
    previewUrl: null,
    audioUrl: null,
    audioFormat: null,
    providers: [
      {
        key: 'spotify',
        label: 'Spotify',
        url: 'https://open.spotify.com/track/123',
      },
    ],
    releaseTitle: 'Midnight Echo (EP)',
    releaseArtworkUrl: null,
    releaseId: 'release-1',
    ...overrides,
  };
}

describe('TrackSidebar', () => {
  it('shows details content by default and switches to platforms tab', async () => {
    const user = userEvent.setup();

    render(
      <TrackSidebar
        track={buildTrack()}
        isOpen={true}
        onClose={() => {}}
        onBackToRelease={() => {}}
      />
    );

    expect(screen.getByText('Smart link')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Platforms' }));

    expect(screen.getByText('Available on')).toBeInTheDocument();
    expect(screen.queryByText('Actions')).not.toBeInTheDocument();
  });

  it('renders empty platforms state when there are no provider links', async () => {
    const user = userEvent.setup();

    render(
      <TrackSidebar
        track={buildTrack({ providers: [] })}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    await user.click(screen.getByRole('tab', { name: 'Platforms' }));

    expect(
      screen.getByText('No platform links available for this track.')
    ).toBeInTheDocument();
  });
});
