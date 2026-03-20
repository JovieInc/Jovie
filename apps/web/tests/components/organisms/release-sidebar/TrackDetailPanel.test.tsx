import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  TrackDetailPanel,
  type TrackForDetail,
} from '@/components/organisms/release-sidebar/TrackDetailPanel';

vi.mock('@/lib/utils/platform-detection', () => ({
  getBaseUrl: () => 'https://jov.ie',
}));

function buildTrack(overrides: Partial<TrackForDetail> = {}): TrackForDetail {
  return {
    title: 'Midnight Echo',
    smartLinkPath: '/t/midnight-echo',
    trackNumber: 3,
    discNumber: 1,
    durationMs: 185000,
    isrc: 'USRC17607839',
    isExplicit: true,
    providers: [
      {
        key: 'spotify',
        label: 'Spotify',
        url: 'https://open.spotify.com/track/123',
      },
    ],
    ...overrides,
  };
}

describe('TrackDetailPanel', () => {
  it('renders track summary, actions, and platforms', () => {
    render(
      <TrackDetailPanel
        track={buildTrack()}
        releaseTitle='Release Title'
        onBack={vi.fn()}
      />
    );

    expect(
      screen.getByRole('button', { name: /release title/i })
    ).toBeInTheDocument();
    expect(screen.getByText('Midnight Echo')).toBeInTheDocument();
    expect(screen.getByText('Smart link')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /copy isrc/i })
    ).toBeInTheDocument();
    expect(screen.getByText('Platforms')).toBeInTheDocument();
    expect(screen.getByText('Spotify')).toBeInTheDocument();
  });

  it('shows the empty platforms state when no providers exist', () => {
    render(
      <TrackDetailPanel
        track={buildTrack({ providers: [] })}
        releaseTitle='Release Title'
        onBack={vi.fn()}
      />
    );

    expect(
      screen.getByText('No platform links available for this track.')
    ).toBeInTheDocument();
  });
});
