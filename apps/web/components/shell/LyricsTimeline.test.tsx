import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LyricsTimeline } from './LyricsTimeline';

const lines = [
  { startSec: 6, text: 'a' },
  { startSec: 30, text: 'b' },
  { startSec: 60, text: 'c' },
];

describe('LyricsTimeline', () => {
  it('renders current + duration timestamps', () => {
    const { getByText } = render(
      <LyricsTimeline
        durationSec={213}
        currentTimeSec={78}
        lines={lines}
        activeIndex={2}
        onSeek={() => {}}
      />
    );
    expect(getByText('1:18')).toBeInTheDocument();
    expect(getByText('3:33')).toBeInTheDocument();
  });

  it('renders one cue dot per line', () => {
    const { container } = render(
      <LyricsTimeline
        durationSec={213}
        currentTimeSec={0}
        lines={lines}
        activeIndex={-1}
        onSeek={() => {}}
      />
    );
    expect(
      container.querySelectorAll(
        'span[aria-hidden="true"][class*="rounded-full"]'
      ).length
    ).toBeGreaterThanOrEqual(lines.length);
  });

  it('falls back to 0:00 for NaN duration', () => {
    const { getAllByText } = render(
      <LyricsTimeline
        durationSec={NaN}
        currentTimeSec={NaN}
        lines={lines}
        activeIndex={-1}
        onSeek={() => {}}
      />
    );
    expect(getAllByText('0:00').length).toBe(2);
  });

  it('exposes slider semantics and supports bounded keyboard seeking', () => {
    const onSeek = vi.fn();
    render(
      <LyricsTimeline
        durationSec={80}
        currentTimeSec={78}
        lines={lines}
        activeIndex={2}
        onSeek={onSeek}
      />
    );
    const slider = screen.getByRole('slider', { name: 'Lyric Timeline' });

    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '80');
    expect(slider).toHaveAttribute('aria-valuenow', '78');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.keyDown(slider, { key: 'Home' });

    expect(onSeek).toHaveBeenNthCalledWith(1, 80);
    expect(onSeek).toHaveBeenNthCalledWith(2, 0);
  });

  it('preserves timeline geometry but disables interaction without an active track', () => {
    const onSeek = vi.fn();
    render(
      <LyricsTimeline
        durationSec={80}
        currentTimeSec={10}
        lines={lines}
        activeIndex={0}
        disabled
        onSeek={onSeek}
      />
    );
    const slider = screen.getByRole('slider', { name: 'Lyric Timeline' });

    expect(slider).toBeDisabled();
    fireEvent.keyDown(slider, { key: 'End' });
    expect(onSeek).not.toHaveBeenCalled();
  });
});
