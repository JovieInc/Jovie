import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TrackForDetail } from './TrackDetailPanel';
import { TrackDetailPanel } from './TrackDetailPanel';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    readonly children: React.ReactNode;
    readonly href: string;
  }) => <a href={href}>{children}</a>,
}));

const track: TrackForDetail = {
  title: 'Summer Lights (Radio Edit)',
  smartLinkPath: '/smart/track-1',
  trackNumber: 2,
  discNumber: 1,
  durationMs: 187_000,
  isrc: 'USABC2600001',
  isExplicit: false,
  providers: [
    { key: 'spotify', label: 'Spotify', url: 'https://open.spotify.com/t/1' },
  ],
};

describe('TrackDetailPanel', () => {
  it('renders the back button labelled with the release title', () => {
    render(
      <TrackDetailPanel
        track={track}
        releaseTitle='Summer Lights'
        onBack={vi.fn()}
      />
    );

    expect(screen.getByText('Summer Lights')).toBeInTheDocument();
    expect(screen.getByText('Summer Lights (Radio Edit)')).toBeInTheDocument();
  });

  it('shows the Copy ISRC action only when the track has an ISRC', () => {
    const { rerender } = render(
      <TrackDetailPanel
        track={track}
        releaseTitle='Summer Lights'
        onBack={vi.fn()}
      />
    );
    expect(screen.getByText('Copy ISRC')).toBeInTheDocument();

    rerender(
      <TrackDetailPanel
        track={{ ...track, isrc: null }}
        releaseTitle='Summer Lights'
        onBack={vi.fn()}
      />
    );
    expect(screen.queryByText('Copy ISRC')).not.toBeInTheDocument();
  });
});
