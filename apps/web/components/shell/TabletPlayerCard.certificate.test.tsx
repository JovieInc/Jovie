import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TabletPlayerCard } from './TabletPlayerCard';

const TRACK = {
  trackTitle: 'Lost in the Light',
  artistName: 'Bahamas',
  artworkUrl: 'https://x.invalid/art.jpg',
};

describe('TabletPlayerCard certificate', () => {
  it('wires previous, play and next to their handlers, axe-clean', async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn();
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    const { container } = render(
      <TabletPlayerCard
        track={TRACK}
        isPlaying={false}
        currentTime={48}
        duration={213}
        onPlay={onPlay}
        onPrevious={onPrevious}
        onNext={onNext}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    await user.click(screen.getByRole('button', { name: 'Play' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(screen.getByText('0:48')).toBeInTheDocument();
    expect(screen.getByText('3:33')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders nothing when there is no title and no artwork', () => {
    const { container } = render(
      <TabletPlayerCard
        track={{ trackTitle: '', artistName: '', artworkUrl: '' }}
        isPlaying={false}
        currentTime={0}
        duration={0}
        onPlay={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows 0:00 for an unknown duration with no artwork', async () => {
    const { container } = render(
      <TabletPlayerCard
        track={{
          trackTitle: 'Untitled demo',
          artistName: null,
          artworkUrl: null,
        }}
        isPlaying
        currentTime={30}
        duration={Number.NaN}
        onPlay={vi.fn()}
      />
    );
    expect(screen.getByText('0:30')).toBeInTheDocument();
    expect(screen.getByText('0:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps long and RTL copy axe-clean', async () => {
    const title =
      'A Very Long Extended Club Mix Title (Original Version) [Remastered 2026]';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <TabletPlayerCard
          track={{ trackTitle: title, artistName: 'تيم وايت', artworkUrl: '' }}
          isPlaying={false}
          currentTime={2412}
          duration={3725}
          onPlay={vi.fn()}
        />
      </div>
    );
    expect(screen.getByText(title)).toHaveClass('truncate');
    expect(screen.getByText('62:05')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
