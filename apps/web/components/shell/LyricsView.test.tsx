import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LyricsView } from './LyricsView';

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
  it('renders the lyrics list when lines are non-empty', () => {
    render(<LyricsView {...baseProps} currentTimeSec={20} lines={lines} />);
    expect(
      screen.getByText('I was sleeping in the back of the car')
    ).toBeInTheDocument();
  });

  it('renders the empty state when lines is empty', () => {
    render(<LyricsView {...baseProps} currentTimeSec={0} lines={[]} />);
    expect(screen.getByText('No lyrics yet')).toBeInTheDocument();
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
});
