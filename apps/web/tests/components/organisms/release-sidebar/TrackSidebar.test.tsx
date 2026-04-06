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
    previewSource: null,
    previewVerification: 'unknown',
    providerConfidenceSummary: {
      canonical: 1,
      searchFallback: 0,
      unknown: 3,
      unresolvedProviders: ['apple_music', 'youtube', 'soundcloud'],
    },
    providers: [
      {
        key: 'spotify',
        label: 'Spotify',
        url: 'https://open.spotify.com/track/123',
        confidence: 'canonical',
      },
    ],
    releaseTitle: 'Midnight Echo (EP)',
    releaseArtworkUrl: null,
    releaseId: 'release-1',
    ...overrides,
  };
}

describe('TrackSidebar', () => {
  it('shows playback content by default and switches to platforms tab', async () => {
    const user = userEvent.setup();

    render(
      <TrackSidebar
        track={buildTrack()}
        isOpen={true}
        onClose={() => {}}
        onBackToRelease={() => {}}
      />
    );

    expect(screen.getAllByText('Midnight Echo').length).toBeGreaterThan(0);
    expect(screen.getByText(/Preview Unverified/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Providers: 1 canonical, 0 fallback, 3 unknown/i)
    ).toBeInTheDocument();

    await user.click(screen.getByTestId('drawer-tab-platforms'));

    expect(screen.getByText(/Canonical DSPs/i)).toBeInTheDocument();
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

    await user.click(screen.getByTestId('drawer-tab-platforms'));

    expect(screen.getByTestId('track-platforms-empty')).toBeInTheDocument();
  });

  it('keeps the playback card visible in the default view', () => {
    render(
      <TrackSidebar
        track={buildTrack()}
        isOpen={true}
        onClose={vi.fn()}
        onBackToRelease={vi.fn()}
      />
    );

    expect(screen.getAllByText('Midnight Echo').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: /copy track link/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/Preview Unverified/i)).toBeInTheDocument();
    expect(screen.getByTestId('track-tabbed-card')).toHaveAttribute(
      'data-surface-variant',
      'card'
    );
  });

  it('treats missing preview verification as not checked and keeps unknown-confidence links out of canonical DSPs', async () => {
    const user = userEvent.setup();

    render(
      <TrackSidebar
        track={buildTrack({
          previewVerification: undefined,
          providerConfidenceSummary: {
            canonical: 0,
            searchFallback: 0,
            unknown: 1,
            unresolvedProviders: ['soundcloud'],
          },
          providers: [
            {
              key: 'soundcloud',
              label: 'SoundCloud',
              url: 'https://soundcloud.com/track/123',
              confidence: undefined,
            },
          ],
        })}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText(/Preview Not Checked/i)).toBeInTheDocument();
    expect(screen.queryByText(/Verified Preview/i)).not.toBeInTheDocument();

    await user.click(screen.getByTestId('drawer-tab-platforms'));

    expect(screen.getByText(/Unverified DSPs/i)).toBeInTheDocument();
  });
});
