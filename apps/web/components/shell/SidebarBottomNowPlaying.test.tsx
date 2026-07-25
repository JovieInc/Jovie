import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SidebarBottomNowPlaying } from './SidebarBottomNowPlaying';

const fullTrack = {
  trackTitle: 'Lost in the Light',
  artistName: 'Bahamas',
  artworkUrl: 'https://example.com/art.jpg',
};

describe('SidebarBottomNowPlaying', () => {
  it('renders track title + artist + play button', () => {
    render(
      <SidebarBottomNowPlaying
        track={fullTrack}
        isPlaying={false}
        onPlay={() => {}}
      />
    );
    expect(screen.getByText('Lost in the Light')).toBeInTheDocument();
    expect(screen.getByText('Bahamas')).toBeInTheDocument();
    expect(screen.getByLabelText('Play')).toBeInTheDocument();
  });

  it('renders the Pause button when isPlaying', () => {
    render(
      <SidebarBottomNowPlaying
        track={fullTrack}
        isPlaying={true}
        onPlay={() => {}}
      />
    );
    expect(screen.getByLabelText('Pause')).toBeInTheDocument();
  });

  it('renders nothing when no track is playing', () => {
    const { container } = render(
      <SidebarBottomNowPlaying
        track={{ trackTitle: null, artistName: null, artworkUrl: null }}
        isPlaying={false}
        onPlay={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('fires onPlay when the play button is clicked', () => {
    const onPlay = vi.fn();
    render(
      <SidebarBottomNowPlaying
        track={fullTrack}
        isPlaying={false}
        onPlay={onPlay}
      />
    );
    fireEvent.click(screen.getByLabelText('Play'));
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it('merges shell chrome classes from the caller', () => {
    const { container } = render(
      <SidebarBottomNowPlaying
        track={fullTrack}
        isPlaying={false}
        onPlay={() => {}}
        className='ring-1 ring-primary'
      />
    );

    expect(container.firstChild).toHaveClass('ring-1');
    expect(container.firstChild).toHaveClass('ring-primary');
  });

  it('renders the canonical dismiss control and invokes it exactly once', () => {
    const onDismiss = vi.fn();
    render(
      <SidebarBottomNowPlaying
        track={fullTrack}
        isPlaying
        onPlay={() => {}}
        onDismiss={onDismiss}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Player' }));

    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('keeps compact row geometry stable from paused to playing', () => {
    const { rerender } = render(
      <SidebarBottomNowPlaying
        track={fullTrack}
        isPlaying={false}
        onPlay={() => {}}
        onDismiss={() => {}}
      />
    );
    const pausedRow =
      screen.getByText('Lost in the Light').parentElement?.parentElement;
    expect(pausedRow).toHaveClass('h-12');

    rerender(
      <SidebarBottomNowPlaying
        track={fullTrack}
        isPlaying
        onPlay={() => {}}
        onDismiss={() => {}}
      />
    );

    const playingRow =
      screen.getByText('Lost in the Light').parentElement?.parentElement;
    expect(playingRow).toBe(pausedRow);
    expect(playingRow).toHaveClass('h-12');
  });
});
