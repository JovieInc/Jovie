import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioWaveformEditor } from '@/components/features/release/AudioWaveformEditor';

const decodeWaveformPeaksMock = vi.fn();
const pauseGlobalPlaybackMock = vi.fn();
const resumeGlobalPlaybackMock = vi.fn();
let globalPlaybackState = {
  activeTrackId: null as string | null,
  isPlaying: false,
};

vi.mock('@/lib/audio/decode-waveform-peaks', () => ({
  decodeWaveformPeaks: (...args: unknown[]) => decodeWaveformPeaksMock(...args),
}));

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  pausePlaybackForInterruption: () => pauseGlobalPlaybackMock(),
  resumePlaybackAfterInterruption: () => resumeGlobalPlaybackMock(),
  useTrackAudioPlayer: () => ({
    playbackState: globalPlaybackState,
  }),
}));

interface MockAudioElement {
  readonly play: ReturnType<typeof vi.fn>;
  readonly pause: ReturnType<typeof vi.fn>;
  readonly addEventListener: ReturnType<typeof vi.fn>;
  readonly removeEventListener: ReturnType<typeof vi.fn>;
  readonly listeners: Record<string, Array<() => void>>;
  currentTime: number;
  duration: number;
  paused: boolean;
  preload: string;
  src: string;
}

let audioInstances: MockAudioElement[] = [];

function createMockAudio(src = ''): MockAudioElement {
  const listeners: Record<string, Array<() => void>> = {};
  const audio: MockAudioElement = {
    play: vi.fn().mockImplementation(() => {
      audio.paused = false;
      return Promise.resolve();
    }),
    pause: vi.fn().mockImplementation(() => {
      audio.paused = true;
    }),
    addEventListener: vi.fn((event: string, listener: () => void) => {
      listeners[event] ??= [];
      listeners[event].push(listener);
    }),
    removeEventListener: vi.fn((event: string, listener: () => void) => {
      listeners[event] = (listeners[event] ?? []).filter(
        current => current !== listener
      );
    }),
    listeners,
    currentTime: 0,
    duration: 120,
    paused: true,
    preload: '',
    src,
  };
  audioInstances.push(audio);
  return audio;
}

function fireAudioEvent(audio: MockAudioElement, event: string): void {
  for (const listener of audio.listeners[event] ?? []) listener();
}

vi.stubGlobal('Audio', function MockAudio(src?: string) {
  return createMockAudio(src);
});
vi.stubGlobal('PointerEvent', MouseEvent);

describe('AudioWaveformEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    audioInstances = [];
    globalPlaybackState = { activeTrackId: null, isPlaying: false };
    decodeWaveformPeaksMock.mockResolvedValue({
      peaks: [0.2, 0.8, 0.5],
      durationMs: 120_000,
    });
  });

  it('keeps one media element while trim handles update by keyboard', async () => {
    render(
      <AudioWaveformEditor
        audioUrl='https://cdn.example.com/preview.mp3'
        durationMs={120_000}
        initialSnippet={{ startMs: 10_000, endMs: 40_000 }}
      />
    );

    await screen.findByRole('slider', { name: 'Waveform Position' });
    const startHandle = screen.getByRole('slider', {
      name: 'Adjust Snippet Start',
    });
    const endHandle = screen.getByRole('slider', {
      name: 'Adjust Snippet End',
    });

    fireEvent.keyDown(startHandle, { key: 'ArrowRight' });
    fireEvent.keyDown(endHandle, { key: 'ArrowLeft' });

    expect(startHandle).toHaveAttribute('aria-valuenow', '11000');
    expect(endHandle).toHaveAttribute('aria-valuenow', '39000');
    expect(screen.getByText('Snippet: 0:11 – 0:39')).toBeInTheDocument();
    expect(audioInstances).toHaveLength(1);
  });

  it('supports pointer trimming and stops updates after pointer cancellation', async () => {
    render(
      <AudioWaveformEditor
        audioUrl='https://cdn.example.com/preview.mp3'
        durationMs={100_000}
        initialSnippet={{ startMs: 10_000, endMs: 80_000 }}
      />
    );

    await screen.findByRole('slider', { name: 'Waveform Position' });
    const surface = screen.getByTestId('audio-waveform-surface');
    const startHandle = screen.getByRole('slider', {
      name: 'Adjust Snippet Start',
    });
    surface.getBoundingClientRect = () =>
      ({
        left: 100,
        width: 200,
      }) as DOMRect;
    startHandle.setPointerCapture = vi.fn();

    fireEvent.pointerDown(startHandle, { pointerId: 7 });
    fireEvent.pointerMove(startHandle, { clientX: 200 });
    expect(startHandle).toHaveAttribute('aria-valuenow', '50000');
    expect(startHandle.setPointerCapture).toHaveBeenCalledTimes(1);

    fireEvent.pointerCancel(startHandle);
    fireEvent.pointerMove(startHandle, { clientX: 120 });
    expect(startHandle).toHaveAttribute('aria-valuenow', '50000');
  });

  it('supports Home and End trim commands while preserving minimum duration', async () => {
    render(
      <AudioWaveformEditor
        audioUrl='https://cdn.example.com/preview.mp3'
        durationMs={10_000}
        initialSnippet={{ startMs: 2_000, endMs: 8_000 }}
      />
    );

    await screen.findByRole('slider', { name: 'Waveform Position' });
    const startHandle = screen.getByRole('slider', {
      name: 'Adjust Snippet Start',
    });
    const endHandle = screen.getByRole('slider', {
      name: 'Adjust Snippet End',
    });
    fireEvent.keyDown(startHandle, { key: 'End' });
    expect(startHandle).toHaveAttribute('aria-valuenow', '9000');
    fireEvent.keyDown(endHandle, { key: 'Home' });
    expect(endHandle).toHaveAttribute('aria-valuenow', '10000');
    fireEvent.keyDown(startHandle, { key: 'Home' });
    fireEvent.keyDown(endHandle, { key: 'End' });
    expect(startHandle).toHaveAttribute('aria-valuenow', '0');
    expect(endHandle).toHaveAttribute('aria-valuenow', '10000');
  });

  it('removes disabled trim handles from keyboard operation', async () => {
    render(
      <AudioWaveformEditor
        audioUrl='https://cdn.example.com/preview.mp3'
        durationMs={120_000}
        initialSnippet={{ startMs: 10_000, endMs: 40_000 }}
        disabled
      />
    );

    await screen.findByRole('slider', { name: 'Waveform Position' });
    const startHandle = screen.getByRole('slider', {
      name: 'Adjust Snippet Start',
    });
    const endHandle = screen.getByRole('slider', {
      name: 'Adjust Snippet End',
    });

    expect(startHandle).toBeDisabled();
    expect(endHandle).toBeDisabled();
    fireEvent.keyDown(startHandle, { key: 'ArrowRight' });
    fireEvent.keyDown(endHandle, { key: 'ArrowLeft' });
    expect(startHandle).toHaveAttribute('aria-valuenow', '10000');
    expect(endHandle).toHaveAttribute('aria-valuenow', '40000');
  });

  it('uses the latest trim boundary without recreating or interrupting audio', async () => {
    render(
      <AudioWaveformEditor
        audioUrl='https://cdn.example.com/preview.mp3'
        durationMs={120_000}
        initialSnippet={{ startMs: 10_000, endMs: 40_000 }}
      />
    );

    await screen.findByRole('slider', { name: 'Waveform Position' });
    fireEvent.keyDown(
      screen.getByRole('slider', { name: 'Adjust Snippet Start' }),
      { key: 'ArrowRight' }
    );
    fireEvent.keyDown(
      screen.getByRole('slider', { name: 'Adjust Snippet End' }),
      { key: 'ArrowLeft' }
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Play waveform preview' })
    );
    const audio = audioInstances[0];
    expect(audio).toBeDefined();
    expect(audio?.play).toHaveBeenCalledTimes(1);
    expect(pauseGlobalPlaybackMock).toHaveBeenCalledTimes(1);

    act(() => {
      if (!audio) return;
      audio.currentTime = 39;
      fireAudioEvent(audio, 'timeupdate');
    });

    expect(audio?.pause).toHaveBeenCalledTimes(1);
    expect(audio?.currentTime).toBe(11);
    expect(resumeGlobalPlaybackMock).toHaveBeenCalledTimes(1);
    expect(audioInstances).toHaveLength(1);
  });

  it('retires media only when the source changes and resets source-local state', async () => {
    const { rerender } = render(
      <AudioWaveformEditor
        audioUrl='https://cdn.example.com/first.mp3'
        durationMs={120_000}
        initialSnippet={{ startMs: 10_000, endMs: 40_000 }}
      />
    );
    await screen.findByRole('slider', { name: 'Waveform Position' });
    const firstAudio = audioInstances[0];

    rerender(
      <AudioWaveformEditor
        audioUrl='https://cdn.example.com/second.mp3'
        durationMs={90_000}
        initialSnippet={{ startMs: 5_000, endMs: 35_000 }}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Snippet: 0:05 – 0:35')).toBeInTheDocument();
    });
    expect(firstAudio?.src).toBe('');
    expect(audioInstances).toHaveLength(2);
    expect(audioInstances[1]?.src).toBe('https://cdn.example.com/second.mp3');
  });

  it('keeps live playback state when duration metadata changes', async () => {
    const { rerender } = render(
      <AudioWaveformEditor
        audioUrl='https://cdn.example.com/preview.mp3'
        durationMs={120_000}
      />
    );
    await screen.findByRole('slider', { name: 'Waveform Position' });
    const audio = audioInstances[0];
    act(() => {
      if (!audio) return;
      audio.currentTime = 20;
      fireAudioEvent(audio, 'playing');
      fireAudioEvent(audio, 'timeupdate');
    });

    rerender(
      <AudioWaveformEditor
        audioUrl='https://cdn.example.com/preview.mp3'
        durationMs={121_000}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Pause waveform preview' })
    ).toBeInTheDocument();
    expect(screen.getByText('0:20')).toBeInTheDocument();
    expect(screen.getByText('2:01')).toBeInTheDocument();
    expect(audioInstances).toHaveLength(1);
    expect(decodeWaveformPeaksMock).toHaveBeenCalledTimes(1);
  });

  it('measures play-to-audible and releases focus on explicit pause', async () => {
    const measureSpy = vi.spyOn(performance, 'measure');
    const clearMarksSpy = vi.spyOn(performance, 'clearMarks');
    const clearMeasuresSpy = vi.spyOn(performance, 'clearMeasures');
    render(
      <AudioWaveformEditor
        audioUrl='https://cdn.example.com/preview.mp3'
        durationMs={120_000}
      />
    );
    await screen.findByRole('slider', { name: 'Waveform Position' });
    const audio = audioInstances[0];

    fireEvent.click(
      screen.getByRole('button', { name: 'Play waveform preview' })
    );
    act(() => {
      if (audio) fireAudioEvent(audio, 'playing');
    });
    expect(measureSpy).toHaveBeenCalledWith(
      'audio-snippet-play:event-to-audible',
      expect.any(String),
      expect.any(String)
    );
    expect(clearMarksSpy).toHaveBeenCalled();
    expect(clearMeasuresSpy).toHaveBeenCalledWith(
      'audio-snippet-play:event-to-audible'
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Pause waveform preview' })
    );
    act(() => {
      if (audio) fireAudioEvent(audio, 'pause');
    });
    expect(audio?.pause).toHaveBeenCalledTimes(1);
    expect(resumeGlobalPlaybackMock).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Play waveform preview' })
    ).toBeInTheDocument();
    measureSpy.mockRestore();
    clearMarksSpy.mockRestore();
    clearMeasuresSpy.mockRestore();
  });

  it('releases focus when the media element ends', async () => {
    render(
      <AudioWaveformEditor
        audioUrl='https://cdn.example.com/preview.mp3'
        durationMs={120_000}
      />
    );
    await screen.findByRole('slider', { name: 'Waveform Position' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Play waveform preview' })
    );
    const audio = audioInstances[0];
    act(() => {
      if (!audio) return;
      fireAudioEvent(audio, 'playing');
      fireAudioEvent(audio, 'ended');
    });

    expect(
      screen.getByRole('button', { name: 'Play waveform preview' })
    ).toBeInTheDocument();
    expect(resumeGlobalPlaybackMock).toHaveBeenCalledTimes(1);
  });

  it('recovers focus and reports latency when playback fails', async () => {
    const measureSpy = vi.spyOn(performance, 'measure');
    render(
      <AudioWaveformEditor
        audioUrl='https://cdn.example.com/preview.mp3'
        durationMs={120_000}
      />
    );
    await screen.findByRole('slider', { name: 'Waveform Position' });
    audioInstances[0]?.play.mockRejectedValueOnce(new Error('Not allowed'));

    fireEvent.click(
      screen.getByRole('button', { name: 'Play waveform preview' })
    );
    await waitFor(() =>
      expect(measureSpy).toHaveBeenCalledWith(
        'audio-snippet-play:event-to-failed',
        expect.any(String),
        expect.any(String)
      )
    );
    expect(resumeGlobalPlaybackMock).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Play waveform preview' })
    ).toBeInTheDocument();
    measureSpy.mockRestore();
  });

  it('ignores a retired source play rejection after replacement playback starts', async () => {
    let rejectFirstPlay: ((error: Error) => void) | undefined;
    const { rerender } = render(
      <AudioWaveformEditor
        audioUrl='https://cdn.example.com/first.mp3'
        durationMs={120_000}
      />
    );
    await screen.findByRole('slider', { name: 'Waveform Position' });
    const firstAudio = audioInstances[0];
    firstAudio?.play.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectFirstPlay = reject;
        })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Play waveform preview' })
    );

    rerender(
      <AudioWaveformEditor
        audioUrl='https://cdn.example.com/second.mp3'
        durationMs={90_000}
      />
    );
    await waitFor(() => expect(audioInstances).toHaveLength(2));
    const secondAudio = audioInstances[1];
    fireEvent.click(
      screen.getByRole('button', { name: 'Play waveform preview' })
    );
    act(() => {
      if (!secondAudio) return;
      fireAudioEvent(secondAudio, 'playing');
    });

    await act(async () => {
      rejectFirstPlay?.(new Error('Retired source rejection'));
      await Promise.resolve();
    });

    expect(
      screen.getByRole('button', { name: 'Pause waveform preview' })
    ).toBeInTheDocument();
    expect(pauseGlobalPlaybackMock).toHaveBeenCalledTimes(2);
    expect(resumeGlobalPlaybackMock).toHaveBeenCalledTimes(1);
  });

  it('keeps stable editor geometry and retries a waveform decode failure', async () => {
    decodeWaveformPeaksMock
      .mockRejectedValueOnce(new Error('Decoder exploded'))
      .mockResolvedValueOnce({ peaks: [0.4, 0.9], durationMs: 90_000 });

    render(
      <AudioWaveformEditor audioUrl='https://cdn.example.com/preview.mp3' />
    );

    expect(await screen.findByTestId('audio-waveform-error')).toHaveTextContent(
      'Waveform unavailable.'
    );
    expect(screen.getByTestId('audio-waveform-editor')).toBeInTheDocument();
    expect(screen.getByTestId('audio-waveform-surface')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(
        screen.getByRole('slider', { name: 'Waveform Position' })
      ).toBeInTheDocument();
    });
    expect(decodeWaveformPeaksMock).toHaveBeenCalledTimes(2);
    expect(audioInstances).toHaveLength(1);
  });

  it('derives duration and a default snippet from decoded audio', async () => {
    decodeWaveformPeaksMock.mockResolvedValueOnce({
      peaks: [],
      durationMs: 90_000,
    });
    render(
      <AudioWaveformEditor audioUrl='https://cdn.example.com/preview.wav' />
    );

    await screen.findByRole('slider', { name: 'Waveform Position' });
    expect(screen.getByText('1:30')).toBeInTheDocument();
    expect(screen.getByText('Snippet: 0:30 – 1:00')).toBeInTheDocument();
    expect(screen.getByTestId('audio-waveform-surface')).toBeInTheDocument();
  });

  it('persists normalized trim state and restores the save control', async () => {
    let resolveSave: (() => void) | undefined;
    const onSaveSnippet = vi.fn(
      () =>
        new Promise<void>(resolve => {
          resolveSave = resolve;
        })
    );
    render(
      <AudioWaveformEditor
        audioUrl='https://cdn.example.com/preview.mp3'
        durationMs={120_000}
        initialSnippet={{ startMs: 10_000, endMs: 40_000 }}
        onSaveSnippet={onSaveSnippet}
      />
    );
    await screen.findByRole('slider', { name: 'Waveform Position' });

    fireEvent.click(screen.getByTestId('audio-snippet-save'));
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(onSaveSnippet).toHaveBeenCalledWith({
      startMs: 10_000,
      endMs: 40_000,
    });
    await act(async () => {
      resolveSave?.();
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'Save Snippet' })).toBeEnabled();
  });

  it('measures waveform seek settlement and updates the media position', async () => {
    const markSpy = vi.spyOn(performance, 'mark');
    const measureSpy = vi.spyOn(performance, 'measure');
    render(
      <AudioWaveformEditor
        audioUrl='https://cdn.example.com/preview.mp3'
        durationMs={120_000}
      />
    );

    const position = await screen.findByRole('slider', {
      name: 'Waveform Position',
    });
    fireEvent.change(position, { target: { value: '42000' } });
    const audio = audioInstances[0];
    expect(audio?.currentTime).toBe(42);

    act(() => {
      if (!audio) return;
      fireAudioEvent(audio, 'seeking');
      fireAudioEvent(audio, 'seeked');
    });

    expect(markSpy).toHaveBeenCalledWith(
      expect.stringContaining('audio-snippet-seek')
    );
    expect(measureSpy).toHaveBeenCalledWith(
      'audio-snippet-seek:event-to-settled',
      expect.any(String),
      expect.any(String)
    );
    markSpy.mockRestore();
    measureSpy.mockRestore();
  });

  it('closes pending local interaction marks when global playback takes ownership', async () => {
    const measureSpy = vi.spyOn(performance, 'measure');
    let resolvePlay: (() => void) | undefined;
    const { rerender } = render(
      <AudioWaveformEditor
        audioUrl='https://cdn.example.com/preview.mp3'
        durationMs={120_000}
      />
    );
    const position = await screen.findByRole('slider', {
      name: 'Waveform Position',
    });
    const audio = audioInstances[0];
    audio?.play.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          if (audio) audio.paused = false;
          resolvePlay = resolve;
        })
    );

    fireEvent.change(position, { target: { value: '42000' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Play waveform preview' })
    );
    globalPlaybackState = { activeTrackId: 'global-track', isPlaying: true };
    rerender(
      <AudioWaveformEditor
        audioUrl='https://cdn.example.com/preview.mp3'
        durationMs={120_000}
      />
    );

    expect(measureSpy).toHaveBeenCalledWith(
      'audio-snippet-play:event-to-interrupted',
      expect.any(String),
      expect.any(String)
    );
    expect(measureSpy).toHaveBeenCalledWith(
      'audio-snippet-seek:event-to-interrupted',
      expect.any(String),
      expect.any(String)
    );
    expect(audio?.pause).toHaveBeenCalledTimes(1);
    expect(resumeGlobalPlaybackMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePlay?.();
      await Promise.resolve();
    });
    expect(
      screen.getByRole('button', { name: 'Play waveform preview' })
    ).toBeInTheDocument();
    measureSpy.mockRestore();
  });

  it('releases global audio focus and retires the local source on unmount', async () => {
    const { unmount } = render(
      <AudioWaveformEditor
        audioUrl='https://cdn.example.com/preview.mp3'
        durationMs={120_000}
      />
    );
    await screen.findByRole('slider', { name: 'Waveform Position' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Play waveform preview' })
    );

    const audio = audioInstances[0];
    unmount();

    expect(audio?.pause).toHaveBeenCalled();
    expect(audio?.src).toBe('');
    expect(resumeGlobalPlaybackMock).toHaveBeenCalledTimes(1);
  });
});
