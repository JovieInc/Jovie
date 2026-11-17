import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SidebarNowPlaying } from './SidebarNowPlaying';

const track = {
  trackTitle: 'Lost in the Light',
  artistName: 'Bahamas',
  artworkUrl: 'https://example.com/art.jpg',
};

describe('SidebarNowPlaying certificate', () => {
  it('plays from the artwork overlay and stays axe-clean', async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn();
    const { container } = render(
      <SidebarNowPlaying
        track={track}
        isPlaying={false}
        onPlay={onPlay}
        playOverlayVisible
      />
    );
    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(onPlay).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('renders nothing when nothing is playing', async () => {
    const { container } = render(
      <SidebarNowPlaying
        track={{ trackTitle: null, artistName: null, artworkUrl: null }}
        isPlaying={false}
        onPlay={vi.fn()}
        playOverlayVisible={false}
      />
    );
    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('renders a title-only track without artwork', async () => {
    const { container } = render(
      <SidebarNowPlaying
        track={{ trackTitle: 'Untitled', artistName: null, artworkUrl: null }}
        isPlaying={false}
        onPlay={vi.fn()}
        playOverlayVisible={false}
      />
    );
    expect(screen.getByText('Untitled')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('shows the success-token playing dot and pauses in collapsed mode', async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn();
    const { container } = render(
      <SidebarNowPlaying
        track={track}
        isPlaying
        onPlay={onPlay}
        playOverlayVisible
        collapsed
      />
    );
    expect(container.querySelector('span.bg-success')).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/emerald/);
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(onPlay).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('truncates long metadata and renders right to left', async () => {
    const { container } = render(
      <div dir='rtl'>
        <SidebarNowPlaying
          track={{
            ...track,
            trackTitle: 'Lost in the Light (Extended Club Mix with Intro)',
          }}
          isPlaying={false}
          onPlay={vi.fn()}
          playOverlayVisible={false}
        />
      </div>
    );
    expect(
      screen.getByText('Lost in the Light (Extended Club Mix with Intro)')
    ).toHaveClass('truncate');
    await expectNoA11yViolations(container);
  });
});
