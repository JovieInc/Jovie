import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SidebarBottomNowPlaying } from './SidebarBottomNowPlaying';

const fullTrack = {
  trackTitle: 'Lost in the Light',
  artistName: 'Bahamas',
  artworkUrl: 'https://example.com/art.jpg',
};

describe('SidebarBottomNowPlaying', () => {
  it.each([
    { trackTitle: fullTrack.trackTitle, hint: fullTrack.trackTitle },
    { trackTitle: null, hint: 'Now playing' },
  ])(
    'identifies the collapsed player on keyboard focus with $hint',
    async ({ trackTitle, hint }) => {
      const user = userEvent.setup();
      const onPlay = vi.fn();
      render(
        <SidebarBottomNowPlaying
          track={{ ...fullTrack, trackTitle }}
          isPlaying={false}
          onPlay={onPlay}
          collapsed
        />
      );

      await user.tab();

      expect(screen.getByRole('button')).toHaveFocus();
      expect(await screen.findByRole('tooltip')).toHaveTextContent(hint);
      await user.keyboard('{Enter}');
      expect(onPlay).toHaveBeenCalledOnce();
    }
  );

  it('shows the supplied title without inventing an absent artist or artwork', () => {
    const { container } = render(
      <SidebarBottomNowPlaying
        track={{ ...fullTrack, artistName: null, artworkUrl: null }}
        isPlaying={false}
        onPlay={vi.fn()}
      />
    );

    expect(container).toHaveTextContent(fullTrack.trackTitle);
    expect(container.textContent).toBe(fullTrack.trackTitle);
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
  });

  it.each([
    { state: 'paused', track: fullTrack, isPlaying: false },
    { state: 'playing', track: fullTrack, isPlaying: true },
    {
      state: 'empty',
      track: { trackTitle: null, artistName: null, artworkUrl: null },
      isPlaying: false,
    },
    {
      state: 'partial track',
      track: { ...fullTrack, artistName: null, artworkUrl: null },
      isPlaying: false,
    },
    {
      state: 'artwork only',
      track: { ...fullTrack, trackTitle: null, artistName: null },
      isPlaying: false,
    },
    {
      state: 'long title',
      track: {
        ...fullTrack,
        trackTitle:
          'A Very Long Track Title That Must Truncate Without Widening the Sidebar',
      },
      isPlaying: false,
    },
    {
      state: 'RTL',
      track: {
        ...fullTrack,
        trackTitle: 'عنوان مسار طويل يجب اقتطاعه دون توسيع الشريط الجانبي',
        artistName: 'اسم الفنان',
      },
      isPlaying: false,
      dir: 'rtl',
    },
    {
      state: 'collapsed paused',
      track: fullTrack,
      isPlaying: false,
      collapsed: true,
    },
    {
      state: 'collapsed playing',
      track: fullTrack,
      isPlaying: true,
      collapsed: true,
    },
    {
      state: 'expanded controls',
      track: fullTrack,
      isPlaying: true,
      onExpand: vi.fn(),
      onDismiss: vi.fn(),
    },
  ])(
    'has no axe violations with $state',
    async ({ state: _state, dir, ...props }) => {
      const { container } = render(
        <div dir={dir}>
          <SidebarBottomNowPlaying {...props} onPlay={vi.fn()} />
        </div>
      );
      await expectNoA11yViolations(container);
    }
  );

  it('renders track title + artist + play button', () => {
    const { container } = render(
      <SidebarBottomNowPlaying
        track={fullTrack}
        isPlaying={false}
        onPlay={() => {}}
      />
    );
    expect(screen.getByText('Lost in the Light')).toBeInTheDocument();
    expect(screen.getByText('Bahamas')).toBeInTheDocument();
    expect(screen.getByLabelText('Play')).toBeInTheDocument();
    expect(
      container.querySelector('[data-artwork-frame="thumbnail"]')
    ).toBeInTheDocument();
    expect(container.innerHTML).toContain('object-contain');
    expect(container.innerHTML).not.toContain('object-cover');
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
    expect(screen.getByLabelText('Dismiss Player')).toHaveClass(
      'before:h-11',
      'before:w-11'
    );
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

  it('wraps the track info in a Show Player expand button when onExpand is set', () => {
    const onExpand = vi.fn();
    render(
      <SidebarBottomNowPlaying
        track={fullTrack}
        isPlaying={false}
        onPlay={() => {}}
        onExpand={onExpand}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show Player' }));
    expect(onExpand).toHaveBeenCalledOnce();
  });

  it('renders the collapsed 28px artwork control with a playing glyph', () => {
    const { container } = render(
      <SidebarBottomNowPlaying
        track={fullTrack}
        isPlaying
        onPlay={() => {}}
        collapsed
      />
    );

    expect(
      screen.getByRole('button', { name: 'Pause Lost in the Light' })
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-artwork-frame="thumbnail"]')
    ).toHaveClass('size-7');
    expect(container.querySelector('.lucide-audio-lines')).toBeInTheDocument();
    expect(screen.queryByText('Bahamas')).not.toBeInTheDocument();
  });
});
