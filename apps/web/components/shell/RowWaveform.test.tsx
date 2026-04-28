import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RowWaveform } from './RowWaveform';
import type { RowWaveformDatum } from './row-waveform.types';

const baseTrack: RowWaveformDatum = {
  id: 'trk-1',
  title: 'Lost in the Light',
  durationSec: 213,
  waveformSeed: 7,
  cues: [
    { at: 0, kind: 'intro', label: 'Intro' },
    { at: 32, kind: 'verse', label: 'Verse 1' },
    { at: 84, kind: 'chorus', label: 'Chorus' },
  ],
};

describe('RowWaveform', () => {
  it('exposes a slider with the track title in the aria-label', () => {
    render(
      <RowWaveform
        track={baseTrack}
        currentTimeSec={0}
        isCurrentTrack={false}
        onSeek={() => undefined}
      />
    );
    expect(
      screen.getByRole('slider', { name: /Scrub Lost in the Light/ })
    ).toBeInTheDocument();
  });

  it('reports aria-valuenow rounded to the nearest second', () => {
    render(
      <RowWaveform
        track={baseTrack}
        currentTimeSec={42.6}
        isCurrentTrack
        onSeek={() => undefined}
      />
    );
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('43');
  });

  it('fires onSeek with a time inside the track duration on click', () => {
    const onSeek = vi.fn();
    render(
      <RowWaveform
        track={baseTrack}
        currentTimeSec={0}
        isCurrentTrack={false}
        onSeek={onSeek}
      />
    );
    const slider = screen.getByRole('slider') as HTMLDivElement;
    // jsdom returns a zero-rect; mock so the ratio math has a layout.
    slider.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 600,
        bottom: 28,
        width: 600,
        height: 28,
      }) as DOMRect;
    fireEvent.click(slider, { clientX: 300 });
    expect(onSeek).toHaveBeenCalledOnce();
    const [seekTo] = onSeek.mock.calls[0]!;
    // clientX=300 over width=600 => 0.5 of duration => 213/2 ~= 106.5
    expect(seekTo).toBeGreaterThan(100);
    expect(seekTo).toBeLessThan(115);
  });

  it('skips onSeek when the rect has zero width (layout transition)', () => {
    const onSeek = vi.fn();
    render(
      <RowWaveform
        track={baseTrack}
        currentTimeSec={0}
        isCurrentTrack={false}
        onSeek={onSeek}
      />
    );
    fireEvent.click(screen.getByRole('slider'));
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('renders one cue marker per cue', () => {
    const { container } = render(
      <RowWaveform
        track={baseTrack}
        currentTimeSec={0}
        isCurrentTrack={false}
        onSeek={() => undefined}
      />
    );
    expect(container.querySelectorAll('span[title*="Intro"]').length).toBe(1);
    expect(container.querySelectorAll('span[title*="Verse 1"]').length).toBe(1);
    expect(container.querySelectorAll('span[title*="Chorus"]').length).toBe(1);
  });

  it('uses unique clipPath ids across multiple instances', () => {
    const { container } = render(
      <>
        <RowWaveform
          track={baseTrack}
          currentTimeSec={0}
          isCurrentTrack
          onSeek={() => undefined}
        />
        <RowWaveform
          track={{ ...baseTrack, id: 'trk-2' }}
          currentTimeSec={0}
          isCurrentTrack
          onSeek={() => undefined}
        />
      </>
    );
    const clipPaths = container.querySelectorAll('clipPath');
    expect(clipPaths.length).toBe(2);
    expect(clipPaths[0]?.id).not.toBe(clipPaths[1]?.id);
  });
});
