import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AudioBar } from '../AudioBar';

const baseTrack = {
  id: 't-1',
  title: 'Lost in the Light',
  artist: 'Bahamas',
  hasLyrics: false,
};

const baseProps = {
  isPlaying: false,
  onPlay: () => {},
  onCollapse: () => {},
  currentTime: 0,
  duration: 213,
  loopMode: 'off' as const,
  onCycleLoop: () => {},
  waveformOn: false,
  onToggleWaveform: () => {},
  track: baseTrack,
};

describe('AudioBar', () => {
  it('renders Pause on the play button when isPlaying', () => {
    render(<AudioBar {...baseProps} isPlaying={true} />);
    expect(screen.getByLabelText(/Pause/)).toBeInTheDocument();
  });

  it('hides the lyrics button when track has no lyrics', () => {
    render(<AudioBar {...baseProps} />);
    expect(screen.queryByLabelText(/^Lyrics/)).toBeNull();
  });

  it('shows the lyrics button when hasLyrics + onOpenLyrics provided', () => {
    render(
      <AudioBar
        {...baseProps}
        track={{ ...baseTrack, hasLyrics: true }}
        onOpenLyrics={() => {}}
      />
    );
    expect(screen.getByLabelText(/^Lyrics/)).toBeInTheDocument();
  });

  it('calls onPlay when the play button is pressed', () => {
    const onPlay = vi.fn();
    render(<AudioBar {...baseProps} onPlay={onPlay} />);
    fireEvent.click(screen.getByLabelText(/^Play/));
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it('calls onCollapse when minimize is pressed', () => {
    const onCollapse = vi.fn();
    render(<AudioBar {...baseProps} onCollapse={onCollapse} />);
    fireEvent.click(screen.getByLabelText(/^Minimize player/));
    expect(onCollapse).toHaveBeenCalledOnce();
  });
});
