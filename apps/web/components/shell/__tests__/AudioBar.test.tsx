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

  it('labels the lyrics button as a close action when active', () => {
    render(
      <AudioBar
        {...baseProps}
        track={{ ...baseTrack, hasLyrics: true }}
        onOpenLyrics={() => {}}
        lyricsActive
      />
    );
    expect(screen.getByLabelText(/^Close lyrics/)).toBeInTheDocument();
  });

  it('calls onPlay when the play button is pressed', () => {
    const onPlay = vi.fn();
    render(<AudioBar {...baseProps} onPlay={onPlay} />);
    fireEvent.click(screen.getByLabelText(/^Play/));
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it('never renders a collapse/minimize control', () => {
    render(<AudioBar {...baseProps} />);
    expect(screen.queryByTestId('audio-bar-minimize')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /minimize/i })
    ).not.toBeInTheDocument();
  });

  it('never renders a dismiss control', () => {
    render(<AudioBar {...baseProps} />);
    expect(
      screen.queryByRole('button', { name: 'Dismiss Player' })
    ).not.toBeInTheDocument();
  });

  it('renders only the karaoke and waveform mode buttons, nothing else', () => {
    render(
      <AudioBar
        {...baseProps}
        track={{ ...baseTrack, hasLyrics: true }}
        onOpenLyrics={() => {}}
      />
    );
    // Scoped to the mode-button cluster — transport (shuffle/prev/play/
    // next/loop) is a separate concern and intentionally not constrained
    // here; production PersistentAudioBar never wires shuffle/loop in.
    const modeButtons = screen.getByTestId('audio-bar-mode-buttons');
    const labels = Array.from(modeButtons.querySelectorAll('button')).map(
      button => button.getAttribute('aria-label')
    );
    expect(labels.sort()).toEqual(['Lyrics', 'Show waveform']);
  });

  it('hides the waveform drawer in the compact (default) state', () => {
    render(<AudioBar {...baseProps} waveformOn={false} />);
    expect(
      screen.queryByRole('slider', { name: 'Seek Track Waveform' })
    ).not.toBeInTheDocument();
  });

  it('shows the waveform drawer when expanded', () => {
    render(<AudioBar {...baseProps} waveformOn onSeek={() => {}} />);
    expect(
      screen.getByRole('slider', { name: 'Seek Track Waveform' })
    ).toBeInTheDocument();
  });

  it('shows BPM · key facts only when expanded and the data exists', () => {
    render(
      <AudioBar
        {...baseProps}
        waveformOn
        track={{ ...baseTrack, bpm: 118, musicalKey: '8A' }}
      />
    );
    expect(screen.getByText('118 BPM · 8A')).toBeInTheDocument();
  });

  it('hides facts when collapsed to compact, even if the data exists', () => {
    render(
      <AudioBar
        {...baseProps}
        waveformOn={false}
        track={{ ...baseTrack, bpm: 118, musicalKey: '8A' }}
      />
    );
    expect(screen.queryByText('118 BPM · 8A')).not.toBeInTheDocument();
  });

  it('never fabricates facts — hides the row entirely when bpm/key are absent', () => {
    render(<AudioBar {...baseProps} waveformOn track={baseTrack} />);
    expect(screen.queryByText(/BPM/)).not.toBeInTheDocument();
  });

  it('renders only the known fact when just one of bpm/key exists', () => {
    render(
      <AudioBar {...baseProps} waveformOn track={{ ...baseTrack, bpm: 90 }} />
    );
    expect(screen.getByText('90 BPM')).toBeInTheDocument();
  });

  it('keeps transport geometry stable from idle to playing', () => {
    const { rerender } = render(<AudioBar {...baseProps} />);
    const idleRegion = screen.getByRole('region', { name: 'Audio Player' });
    const idleClassName = idleRegion.className;
    const playButton = screen.getByRole('button', { name: /^Play/ });
    expect(playButton).toHaveAttribute('type', 'button');
    expect(playButton).toHaveClass('h-8', 'w-8', 'rounded-full');

    rerender(<AudioBar {...baseProps} isPlaying />);

    expect(screen.getByRole('region', { name: 'Audio Player' }).className).toBe(
      idleClassName
    );
    expect(screen.getByRole('button', { name: /^Pause/ })).toHaveClass(
      'h-8',
      'w-8'
    );
  });
});
