import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TabletPlayerCard } from './TabletPlayerCard';

const TRACK = {
  trackTitle: 'Lost in the Light',
  artistName: 'Bahamas',
  artworkUrl: 'https://x.invalid/art.jpg',
};

describe('TabletPlayerCard', () => {
  it('returns null when nothing is playing', () => {
    const { container } = render(
      <TabletPlayerCard
        track={{ trackTitle: '', artistName: '', artworkUrl: '' }}
        isPlaying={false}
        currentTime={0}
        duration={0}
        onPlay={() => undefined}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders title, artist, and formatted timestamps', () => {
    render(
      <TabletPlayerCard
        track={TRACK}
        isPlaying
        currentTime={78}
        duration={213}
        onPlay={() => undefined}
      />
    );
    expect(screen.getByText('Lost in the Light')).toBeInTheDocument();
    expect(screen.getByText('Bahamas')).toBeInTheDocument();
    expect(screen.getByText('1:18')).toBeInTheDocument();
    expect(screen.getByText('3:33')).toBeInTheDocument();
  });

  it('coerces NaN duration to 0:00', () => {
    render(
      <TabletPlayerCard
        track={TRACK}
        isPlaying={false}
        currentTime={Number.NaN}
        duration={Number.NaN}
        onPlay={() => undefined}
      />
    );
    expect(screen.getAllByText('0:00').length).toBe(2);
  });

  it('fires onPrevious / onPlay / onNext from the transport buttons', () => {
    const onPrevious = vi.fn();
    const onPlay = vi.fn();
    const onNext = vi.fn();
    render(
      <TabletPlayerCard
        track={TRACK}
        isPlaying={false}
        currentTime={0}
        duration={213}
        onPlay={onPlay}
        onPrevious={onPrevious}
        onNext={onNext}
      />
    );
    fireEvent.click(screen.getByLabelText('Previous'));
    fireEvent.click(screen.getByLabelText('Play'));
    fireEvent.click(screen.getByLabelText('Next'));
    expect(onPrevious).toHaveBeenCalledOnce();
    expect(onPlay).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
  });
});
