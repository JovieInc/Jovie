import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SidebarNowPlaying } from './SidebarNowPlaying';

const fullTrack = {
  trackTitle: 'Lost in the Light',
  artistName: 'Bahamas',
  artworkUrl: 'https://example.com/art.jpg',
};

describe('SidebarNowPlaying', () => {
  it('renders track title + artist in expanded mode', () => {
    render(
      <SidebarNowPlaying
        track={fullTrack}
        isPlaying={false}
        onPlay={() => {}}
        playOverlayVisible={false}
      />
    );
    expect(screen.getByText('Lost in the Light')).toBeInTheDocument();
    expect(screen.getByText('Bahamas')).toBeInTheDocument();
  });

  it('renders nothing when track has no title and no artwork', () => {
    const { container } = render(
      <SidebarNowPlaying
        track={{ trackTitle: null, artistName: null, artworkUrl: null }}
        isPlaying={false}
        onPlay={() => {}}
        playOverlayVisible={false}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('hides title/artist text in collapsed mode', () => {
    const { queryByText } = render(
      <SidebarNowPlaying
        track={fullTrack}
        isPlaying={false}
        onPlay={() => {}}
        playOverlayVisible={false}
        collapsed
      />
    );
    expect(queryByText('Lost in the Light')).toBeNull();
    expect(queryByText('Bahamas')).toBeNull();
  });

  it('shows the playing indicator dot in collapsed mode when isPlaying', () => {
    const { container } = render(
      <SidebarNowPlaying
        track={fullTrack}
        isPlaying={true}
        onPlay={() => {}}
        playOverlayVisible={false}
        collapsed
      />
    );
    expect(container.querySelector('span.bg-emerald-400')).toBeInTheDocument();
  });
});
