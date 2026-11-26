import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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
});

describe('JOV-5466 token retire', () => {
  it('does not keep retired --linear-app-* tokens', () => {
    const source = readFileSync(
      resolve(__dirname, './LyricsTimeline.tsx'),
      'utf8'
    );
    expect(source).not.toMatch(/--linear-app-/);
  });
});

describe('Ion accent polish (glm/lyrics-player)', () => {
  it('draws the progress rail and cue halos with the Ion accent, not raw cyan', () => {
    const source = readFileSync(
      resolve(__dirname, './LyricsTimeline.tsx'),
      'utf8'
    );
    expect(source).not.toMatch(/cyan-/);
    expect(source).not.toMatch(/shadow-\[0_0_0/);
    expect(source).toContain('bg-accent/80 transition-[width]');
    expect(source).toContain('h-2 w-2 bg-accent ring-2 ring-accent/20');
    expect(source).toContain('bg-accent ring-2 ring-accent/20');
  });

  it('renders the playhead with the accent halo ring', () => {
    const { container } = render(
      <LyricsTimeline
        durationSec={213}
        currentTimeSec={78}
        lines={lines}
        activeIndex={1}
        onSeek={() => {}}
      />
    );
    const playhead = container.querySelector(
      'span.h-3.w-3.rounded-full'
    ) as HTMLElement | null;
    expect(playhead).not.toBeNull();
    expect(playhead?.className).toContain('bg-accent');
    expect(playhead?.className).toContain('ring-accent/20');
  });

  it('seeks to the clicked position and stays axe-clean', async () => {
    const user = userEvent.setup();
    const onSeek = vi.fn();
    const { container } = render(
      <LyricsTimeline
        durationSec={200}
        currentTimeSec={10}
        lines={lines}
        activeIndex={0}
        onSeek={onSeek}
      />
    );
    const bar = screen.getByRole('button', { name: 'Lyric Timeline' });
    expect(bar).toHaveAttribute('type', 'button');
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 100,
      right: 100,
      top: 0,
      bottom: 10,
      height: 10,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    await user.pointer({
      keys: '[MouseLeft]',
      target: bar,
      coords: { clientX: 50 },
    });
    expect(onSeek).toHaveBeenCalledWith(100);
    await expectNoA11yViolations(container);
  });

  it('ignores clicks when the duration is unknown, axe-clean', async () => {
    const user = userEvent.setup();
    const onSeek = vi.fn();
    const { container } = render(
      <LyricsTimeline
        durationSec={0}
        currentTimeSec={0}
        lines={[]}
        activeIndex={-1}
        onSeek={onSeek}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Lyric Timeline' }));
    expect(onSeek).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });
});
