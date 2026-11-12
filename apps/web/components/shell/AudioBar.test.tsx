import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudioBar } from './AudioBar';

const track = {
  id: 'lost-in-the-light',
  title: 'Lost in the Light',
  artist: 'Bahamas',
  hasLyrics: true,
};

function renderBar(props: Partial<Parameters<typeof AudioBar>[0]> = {}) {
  const handlers = {
    onPlay: vi.fn(),
    onShuffle: vi.fn(),
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    onCycleLoop: vi.fn(),
    onToggleWaveform: vi.fn(),
    onOpenLyrics: vi.fn(),
  };
  const view = render(
    <AudioBar
      isPlaying={false}
      currentTime={78}
      duration={213}
      loopMode='off'
      waveformOn={false}
      track={track}
      {...handlers}
      {...props}
    />
  );
  return { ...view, handlers };
}

describe('AudioBar states', () => {
  it('routes every transport and mode control', async () => {
    const { container, handlers } = renderBar();

    fireEvent.click(screen.getByRole('button', { name: 'Shuffle' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play (space)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Loop: off' }));
    fireEvent.click(screen.getByRole('button', { name: /^Lyrics/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Show waveform/ }));

    expect(handlers.onShuffle).toHaveBeenCalledOnce();
    expect(handlers.onPrevious).toHaveBeenCalledOnce();
    expect(handlers.onPlay).toHaveBeenCalledOnce();
    expect(handlers.onNext).toHaveBeenCalledOnce();
    expect(handlers.onCycleLoop).toHaveBeenCalledOnce();
    expect(handlers.onOpenLyrics).toHaveBeenCalledOnce();
    expect(handlers.onToggleWaveform).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('opens the waveform with no cue markers', async () => {
    const onSeek = vi.fn();
    const { container } = renderBar({ waveformOn: true, cues: [], onSeek });

    const seek = screen.getByLabelText('Seek Track Waveform');
    expect(seek.closest('[inert]')).toBeNull();
    fireEvent.change(seek, { target: { value: '100' } });
    expect(onSeek).toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('keeps only the required play control for a partial transport', async () => {
    const onPlay = vi.fn();
    const { container } = render(
      <AudioBar
        isPlaying
        onPlay={onPlay}
        currentTime={0}
        duration={213}
        track={{ id: 'demo', title: 'Untitled demo', artist: 'Bahamas' }}
      />
    );

    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Pause (space)' }));
    expect(onPlay).toHaveBeenCalledOnce();
    expect(screen.getByTestId('audio-bar-mode-buttons')).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('shows long cue labels and facts in the expanded drawer', async () => {
    const { container, handlers } = renderBar({
      waveformOn: true,
      cues: [
        {
          at: 48,
          label: 'Second chorus into the long instrumental breakdown section',
        },
      ],
      track: {
        ...track,
        title:
          'Midnight Drive Through the Neon City (Extended Club Mix featuring the Late Night Strings)',
        bpm: 174,
        musicalKey: 'F♯ minor (11A)',
      },
    });

    expect(screen.getByText('174 BPM · F♯ minor (11A)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Hide waveform/ }));
    expect(handlers.onToggleWaveform).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('routes controls in a right-to-left layout', async () => {
    const onPlay = vi.fn();
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <AudioBar
          isPlaying={false}
          onPlay={onPlay}
          currentTime={40}
          duration={213}
          waveformOn
          onToggleWaveform={vi.fn()}
          cues={[{ at: 40, label: 'المقطع الثاني' }]}
          track={{
            id: 'layali',
            title: 'ليالي المدينة الطويلة',
            artist: 'فرقة الشرق',
            bpm: 96,
            musicalKey: '4A',
          }}
        />
      </div>
    );

    expect(screen.getByText('96 BPM · 4A')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play (space)' }));
    expect(onPlay).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });
});
