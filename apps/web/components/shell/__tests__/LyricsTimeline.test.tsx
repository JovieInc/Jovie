import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LyricsTimeline } from '../LyricsTimeline';

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
});
