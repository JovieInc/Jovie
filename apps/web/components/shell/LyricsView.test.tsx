import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LyricsView } from './LyricsView';

const latencySpies = vi.hoisted(() => ({
  markStart: vi.fn(() => null),
  measureNextPaint: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@/lib/monitoring/interaction-latency', () => ({
  markInteractionStart: latencySpies.markStart,
  measureInteractionNextPaint: latencySpies.measureNextPaint,
}));

const lines = [
  { startSec: 6, text: 'I was sleeping in the back of the car' },
  { startSec: 18, text: 'Watching the highway turn into stars' },
  { startSec: 30, text: 'You were humming a tune I forgot' },
];

const baseProps = {
  track: { artist: 'Bahamas', title: 'Lost in the Light' },
  durationSec: 213,
  onSeek: () => {},
};

describe('LyricsView', () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    scrollIntoView.mockClear();
    latencySpies.markStart.mockClear();
    latencySpies.measureNextPaint.mockClear();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
  });

  it('renders the lyrics list when lines are non-empty', () => {
    render(<LyricsView {...baseProps} currentTimeSec={20} lines={lines} />);
    expect(
      screen.getByText('I was sleeping in the back of the car')
    ).toBeInTheDocument();
  });

  it('renders the empty state when lines is empty', () => {
    render(<LyricsView {...baseProps} currentTimeSec={0} lines={[]} />);
    expect(screen.getByText('No Lyrics Yet')).toBeInTheDocument();
  });

  it('shows the Transcribe button only when onTranscribe is provided', () => {
    const a = render(
      <LyricsView {...baseProps} currentTimeSec={0} lines={[]} />
    );
    expect(a.queryByText(/Transcribe with Jovie/)).toBeNull();
    a.unmount();

    const b = render(
      <LyricsView
        {...baseProps}
        currentTimeSec={0}
        lines={[]}
        onTranscribe={() => {}}
      />
    );
    expect(b.getByText(/Transcribe with Jovie/)).toBeInTheDocument();
  });

  it('selects and reveals the latest active timestamp even when rows are out of order', () => {
    render(
      <LyricsView
        {...baseProps}
        currentTimeSec={20}
        lines={[lines[2], lines[0], lines[1]]}
      />
    );
    expect(
      screen.getByRole('button', {
        name: 'Watching the highway turn into stars',
      })
    ).toHaveAttribute('aria-current', 'true');
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: expect.stringMatching(/^(auto|smooth)$/),
      block: 'nearest',
    });
  });

  it('keeps timed layout reserved while disabling seek for an inactive track', () => {
    render(
      <LyricsView
        {...baseProps}
        currentTimeSec={20}
        lines={lines}
        seekEnabled={false}
      />
    );
    expect(
      screen.getByRole('slider', { name: 'Lyric Timeline' })
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', {
        name: 'Watching the highway turn into stars',
      })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Watching the highway turn into stars')
    ).toBeInTheDocument();
  });

  it('instruments lyric cue and keyboard timeline seeks through next paint', () => {
    const onSeek = vi.fn();
    render(
      <LyricsView
        {...baseProps}
        currentTimeSec={20}
        lines={lines}
        onSeek={onSeek}
      />
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Watching the highway turn into stars',
      })
    );
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Lyric Timeline' }), {
      key: 'ArrowRight',
    });
    expect(onSeek).toHaveBeenNthCalledWith(1, 18);
    expect(onSeek).toHaveBeenNthCalledWith(2, 25);
    expect(latencySpies.markStart).toHaveBeenCalledTimes(2);
    expect(latencySpies.markStart).toHaveBeenCalledWith('lyrics-cue-seek');
    expect(latencySpies.measureNextPaint).toHaveBeenCalledTimes(2);
  });

  it('highlights enhanced words from the global playhead without changing the accessible line name', () => {
    const { container, rerender } = render(
      <LyricsView
        {...baseProps}
        currentTimeSec={1.6}
        lines={[
          {
            startSec: 1,
            text: 'Hello bright world',
            words: [
              { startSec: 1, text: 'Hello' },
              { startSec: 1.5, text: 'bright' },
              { startSec: 2, text: 'world' },
            ],
          },
        ]}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Hello bright world' })
    ).toHaveAttribute('aria-current', 'true');
    expect(container.querySelector('[data-active-word]')).toHaveTextContent(
      'bright'
    );

    rerender(
      <LyricsView
        {...baseProps}
        currentTimeSec={2}
        lines={[
          {
            startSec: 1,
            text: 'Hello bright world',
            words: [
              { startSec: 1, text: 'Hello' },
              { startSec: 1.5, text: 'bright' },
              { startSec: 2, text: 'world' },
            ],
          },
        ]}
      />
    );
    expect(container.querySelector('[data-active-word]')).toHaveTextContent(
      'world'
    );
  });

  it('preserves timed geometry but clears the active line when synchronization is unavailable', () => {
    render(
      <LyricsView
        {...baseProps}
        currentTimeSec={20}
        lines={lines}
        seekEnabled={false}
        syncEnabled={false}
      />
    );

    expect(
      screen.getByRole('slider', { name: 'Lyric Timeline' })
    ).toBeDisabled();
    expect(document.querySelector('[aria-current="true"]')).toBeNull();
  });

  it('preserves footer geometry and communicates stale timing without seek controls', () => {
    render(
      <LyricsView
        {...baseProps}
        currentTimeSec={20}
        lines={lines}
        timed={false}
        timingStatus='stale'
      />
    );

    expect(screen.getByText('Lyrics timing needs review')).toBeInTheDocument();
    expect(
      screen.queryByRole('slider', { name: 'Lyric Timeline' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'Watching the highway turn into stars',
      })
    ).not.toBeInTheDocument();
  });
});
