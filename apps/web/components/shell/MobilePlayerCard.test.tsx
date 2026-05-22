import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MobilePlayerCard } from './MobilePlayerCard';

const TRACK = {
  trackTitle: 'Lost in the Light',
  artistName: 'Bahamas',
  artworkUrl: 'https://x.invalid/art.jpg',
};

describe('MobilePlayerCard', () => {
  it('returns null when there is no track to play', () => {
    const { container } = render(
      <MobilePlayerCard
        track={{ trackTitle: '', artistName: '', artworkUrl: '' }}
        isPlaying={false}
        pct={0}
        onPlay={() => undefined}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders title + artist from the NowPlayingTrack shape', () => {
    const { container } = render(
      <MobilePlayerCard
        track={TRACK}
        isPlaying={false}
        pct={0}
        onPlay={() => undefined}
      />
    );
    expect(screen.getByText('Lost in the Light')).toBeInTheDocument();
    expect(screen.getByText('Bahamas')).toBeInTheDocument();
    expect(container.innerHTML).toContain('border-(--linear-app-frame-seam)');
    expect(container.innerHTML).toContain(
      'bg-(--linear-app-content-surface)/70'
    );
    expect(container.innerHTML).not.toContain('border-white/10');
  });

  it('shows the play label when not playing and pause when playing', () => {
    const { rerender } = render(
      <MobilePlayerCard
        track={TRACK}
        isPlaying={false}
        pct={0}
        onPlay={() => undefined}
      />
    );
    expect(screen.getByLabelText('Play')).toBeInTheDocument();
    rerender(
      <MobilePlayerCard
        track={TRACK}
        isPlaying
        pct={50}
        onPlay={() => undefined}
      />
    );
    expect(screen.getByLabelText('Pause')).toBeInTheDocument();
  });

  it('clamps non-finite pct to 0', () => {
    render(
      <MobilePlayerCard
        track={TRACK}
        isPlaying={false}
        pct={Number.NaN}
        onPlay={() => undefined}
      />
    );
    expect(screen.getByLabelText('Play')).toBeInTheDocument();
  });

  it('fires onPlay when the play button is pressed', () => {
    const onPlay = vi.fn();
    render(
      <MobilePlayerCard
        track={TRACK}
        isPlaying={false}
        pct={0}
        onPlay={onPlay}
      />
    );
    fireEvent.click(screen.getByLabelText('Play'));
    expect(onPlay).toHaveBeenCalledOnce();
  });
});
