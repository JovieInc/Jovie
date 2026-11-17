import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MobilePlayerCard } from './MobilePlayerCard';

const TRACK = {
  trackTitle: 'Lost in the Light',
  artistName: 'Bahamas',
  artworkUrl: 'https://x.invalid/art.jpg',
};

function progressWidth(container: HTMLElement) {
  return (container.querySelector('.bg-primary-token') as HTMLElement).style
    .width;
}

describe('MobilePlayerCard certificate', () => {
  it('toggles transport through onPlay, axe-clean', async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn();
    const { container } = render(
      <MobilePlayerCard
        track={TRACK}
        isPlaying={false}
        pct={25}
        onPlay={onPlay}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(progressWidth(container)).toBe('25%');
    await expectNoA11yViolations(container);
  });

  it('renders nothing when there is no title and no artwork', () => {
    const { container } = render(
      <MobilePlayerCard
        track={{ trackTitle: '', artistName: '', artworkUrl: '' }}
        isPlaying={false}
        pct={0}
        onPlay={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('clamps progress and shows Pause while playing', async () => {
    const { container } = render(
      <MobilePlayerCard track={TRACK} isPlaying pct={140} onPlay={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(progressWidth(container)).toBe('100%');
    await expectNoA11yViolations(container);
  });

  it('keeps long and RTL copy axe-clean', async () => {
    const title =
      'A Very Long Extended Club Mix Title (Original Version) [Remastered 2026]';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <MobilePlayerCard
          track={{ trackTitle: title, artistName: 'تيم وايت', artworkUrl: '' }}
          isPlaying={false}
          pct={10}
          onPlay={vi.fn()}
        />
      </div>
    );
    expect(screen.getByText(title)).toHaveClass('truncate');
    expect(screen.getByText('تيم وايت')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
