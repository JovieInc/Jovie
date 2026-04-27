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
});
