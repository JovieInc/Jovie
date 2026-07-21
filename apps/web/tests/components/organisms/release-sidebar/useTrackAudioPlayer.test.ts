import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Map of event name -> listener callbacks registered on the mock Audio element
let audioEventListeners: Record<string, Array<() => void>>;
interface MockAudioElement {
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  listeners: Record<string, Array<() => void>>;
  paused: boolean;
  src: string;
  preload: string;
  currentTime: number;
  duration: number;
  error?: { code: number };
}
let mockAudio: MockAudioElement;
let audioInstances: MockAudioElement[];
let nextPlayMock: ReturnType<typeof vi.fn> | null = null;

function createMockAudio() {
  audioEventListeners = {};
  mockAudio = {
    play: nextPlayMock ?? vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    addEventListener: vi.fn((event: string, handler: () => void) => {
      if (!audioEventListeners[event]) {
        audioEventListeners[event] = [];
      }
      audioEventListeners[event].push(handler);
    }),
    paused: true,
    src: '',
    preload: '',
    currentTime: 0,
    duration: 0,
    listeners: audioEventListeners,
  };
  audioInstances.push(mockAudio);
  nextPlayMock = null;
  return mockAudio;
}

function fireAudioEvent(event: string, audio = mockAudio) {
  const handlers = audio.listeners[event];
  if (handlers) {
    for (const handler of handlers) {
      handler();
    }
  }
}

// Mock the global Audio constructor before any module imports.
// A constructor function that returns the mock object directly so that
// property assignments (e.g. audio.src = ...) happen on our tracked reference.
function MockAudioConstructor() {
  return createMockAudio();
}
vi.stubGlobal('Audio', MockAudioConstructor);

// Each test needs a fresh module to reset the module-level singleton `_audio`
async function importFresh() {
  const mod = await import(
    '@/components/organisms/release-sidebar/useTrackAudioPlayer'
  );
  return mod.useTrackAudioPlayer;
}

describe('useTrackAudioPlayer', () => {
  beforeEach(() => {
    vi.resetModules();
    nextPlayMock = null;
    audioInstances = [];
    Object.defineProperty(navigator, 'mediaSession', {
      configurable: true,
      value: undefined,
    });
  });

  it('plays a new track and sets metadata', async () => {
    const useTrackAudioPlayer = await importFresh();
    const { result } = renderHook(() => useTrackAudioPlayer());

    const track = {
      id: 'track-1',
      title: 'Test Song',
      audioUrl: 'https://cdn.example.com/song.mp3',
      releaseTitle: 'Test Album',
      artistName: 'Test Artist',
      artworkUrl: 'https://cdn.example.com/art.jpg',
    };

    await act(async () => {
      await result.current.toggleTrack(track);
    });

    // After play, fire the 'play' event to set isPlaying
    act(() => {
      fireAudioEvent('play');
    });

    expect(result.current.playbackState.activeTrackId).toBe('track-1');
    expect(result.current.playbackState.trackTitle).toBe('Test Song');
    expect(result.current.playbackState.releaseTitle).toBe('Test Album');
    expect(result.current.playbackState.artistName).toBe('Test Artist');
    expect(result.current.playbackState.artworkUrl).toBe(
      'https://cdn.example.com/art.jpg'
    );
    expect(result.current.playbackState.isPlaying).toBe(true);
    expect(mockAudio.src).toBe('https://cdn.example.com/song.mp3');
    expect(mockAudio.play).toHaveBeenCalledTimes(1);
  });

  it('toggles pause/resume when called with the same track ID', async () => {
    const useTrackAudioPlayer = await importFresh();
    const { result } = renderHook(() => useTrackAudioPlayer());

    const track = {
      id: 'track-1',
      title: 'Test Song',
      audioUrl: 'https://cdn.example.com/song.mp3',
    };

    // Play the track initially
    await act(async () => {
      await result.current.toggleTrack(track);
    });
    act(() => {
      mockAudio.paused = false;
      fireAudioEvent('play');
    });

    expect(result.current.playbackState.isPlaying).toBe(true);

    // Toggle same track -> should pause
    await act(async () => {
      await result.current.toggleTrack(track);
    });
    act(() => {
      mockAudio.paused = true;
      fireAudioEvent('pause');
    });

    expect(mockAudio.pause).toHaveBeenCalled();
    expect(result.current.playbackState.isPlaying).toBe(false);

    // Toggle again -> should resume (play)
    await act(async () => {
      await result.current.toggleTrack(track);
    });
    act(() => {
      mockAudio.paused = false;
      fireAudioEvent('play');
    });

    // play called: once for initial, once for resume
    expect(mockAudio.play).toHaveBeenCalledTimes(2);
    expect(result.current.playbackState.isPlaying).toBe(true);
  });

  it('resets state and notifies error listeners on audio error', async () => {
    const useTrackAudioPlayer = await importFresh();
    const { result } = renderHook(() => useTrackAudioPlayer());

    const errorCb = vi.fn();

    // Register error listener
    act(() => {
      result.current.onError(errorCb);
    });

    // Play a track first
    await act(async () => {
      await result.current.toggleTrack({
        id: 'track-1',
        title: 'Test Song',
        audioUrl: 'https://cdn.example.com/song.mp3',
        releaseTitle: 'Album',
        artistName: 'Artist',
        artworkUrl: 'https://cdn.example.com/art.jpg',
      });
    });

    expect(result.current.playbackState.activeTrackId).toBe('track-1');

    // Fire error event
    act(() => {
      fireAudioEvent('error');
    });

    expect(result.current.playbackState.activeTrackId).toBeNull();
    expect(result.current.playbackState.isPlaying).toBe(false);
    expect(result.current.playbackState.trackTitle).toBeNull();
    expect(result.current.playbackState.releaseTitle).toBeNull();
    expect(result.current.playbackState.artistName).toBeNull();
    expect(result.current.playbackState.artworkUrl).toBeNull();
    expect(errorCb).toHaveBeenCalledTimes(1);
  });

  it('sets isPlaying to false and resets currentTime on ended event', async () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(1);
    const useTrackAudioPlayer = await importFresh();
    const { result } = renderHook(() => useTrackAudioPlayer());

    // Play a track
    await act(async () => {
      await result.current.toggleTrack({
        id: 'track-1',
        title: 'Test Song',
        audioUrl: 'https://cdn.example.com/song.mp3',
      });
    });
    act(() => {
      fireAudioEvent('play');
    });

    expect(result.current.playbackState.isPlaying).toBe(true);

    // Simulate some playback progress via timeupdate
    act(() => {
      mockAudio.currentTime = 30;
      mockAudio.duration = 180;
      fireAudioEvent('timeupdate');
    });

    expect(result.current.playbackState.currentTime).toBe(30);

    // Fire ended event
    act(() => {
      fireAudioEvent('ended');
    });

    expect(result.current.playbackState.isPlaying).toBe(false);
    expect(result.current.playbackState.currentTime).toBe(0);
    // activeTrackId should remain (track didn't error, it just finished)
    expect(result.current.playbackState.activeTrackId).toBe('track-1');
    expect(result.current.playbackState.playbackStatus).toBe('ended');
    nowSpy.mockRestore();
  });

  it('exposes buffering, stalled, seeking, and recovery transitions', async () => {
    const useTrackAudioPlayer = await importFresh();
    const { result } = renderHook(() => useTrackAudioPlayer());

    await act(async () => {
      await result.current.toggleTrack({
        id: 'track-1',
        title: 'Test Song',
        audioUrl: 'https://cdn.example.com/song.mp3',
      });
    });

    act(() => {
      mockAudio.paused = false;
      fireAudioEvent('play');
    });
    expect(result.current.playbackState.playbackStatus).toBe('loading');

    act(() => fireAudioEvent('playing'));
    expect(result.current.playbackState.playbackStatus).toBe('playing');

    act(() => fireAudioEvent('waiting'));
    expect(result.current.playbackState.playbackStatus).toBe('buffering');

    act(() => fireAudioEvent('stalled'));
    expect(result.current.playbackState.playbackStatus).toBe('stalled');

    act(() => fireAudioEvent('canplay'));
    expect(result.current.playbackState.playbackStatus).toBe('playing');

    act(() => {
      mockAudio.duration = 180;
      result.current.seek(42);
      fireAudioEvent('seeking');
    });
    expect(result.current.playbackState.playbackStatus).toBe('seeking');

    act(() => {
      mockAudio.currentTime = 42;
      fireAudioEvent('seeked');
    });
    expect(result.current.playbackState.playbackStatus).toBe('playing');
    expect(result.current.playbackState.currentTime).toBe(42);
  });

  it('measures play-to-audible, buffering recovery, and seek settlement', async () => {
    const markSpy = vi.spyOn(performance, 'mark');
    const measureSpy = vi.spyOn(performance, 'measure');
    const clearMarksSpy = vi.spyOn(performance, 'clearMarks');
    const clearMeasuresSpy = vi.spyOn(performance, 'clearMeasures');
    const useTrackAudioPlayer = await importFresh();
    const { result } = renderHook(() => useTrackAudioPlayer());

    await act(async () => {
      await result.current.toggleTrack({
        id: 'track-1',
        title: 'Test Song',
        audioUrl: 'https://cdn.example.com/song.mp3',
      });
    });
    act(() => {
      mockAudio.paused = false;
      fireAudioEvent('playing');
      fireAudioEvent('waiting');
      fireAudioEvent('playing');
      mockAudio.duration = 180;
      result.current.seek(30);
      fireAudioEvent('seeking');
      fireAudioEvent('seeked');
    });

    expect(markSpy).toHaveBeenCalledWith(expect.stringContaining('audio-play'));
    expect(measureSpy).toHaveBeenCalledWith(
      'audio-play:event-to-audible',
      expect.any(String),
      expect.any(String)
    );
    expect(measureSpy).toHaveBeenCalledWith(
      'audio-buffering:event-to-recovered',
      expect.any(String),
      expect.any(String)
    );
    expect(measureSpy).toHaveBeenCalledWith(
      'audio-seek:event-to-settled',
      expect.any(String),
      expect.any(String)
    );
    expect(clearMarksSpy).toHaveBeenCalled();
    expect(clearMeasuresSpy).toHaveBeenCalledWith(
      'audio-seek:event-to-settled'
    );
    markSpy.mockRestore();
    measureSpy.mockRestore();
    clearMarksSpy.mockRestore();
    clearMeasuresSpy.mockRestore();
  });

  it('updates Media Session position when throttled progress is published', async () => {
    const setPositionState = vi.fn();
    Object.defineProperty(navigator, 'mediaSession', {
      configurable: true,
      value: {
        metadata: null,
        playbackState: 'none',
        setActionHandler: vi.fn(),
        setPositionState,
      },
    });
    vi.stubGlobal(
      'MediaMetadata',
      vi.fn(function MediaMetadata() {
        return {};
      })
    );
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(1);

    const useTrackAudioPlayer = await importFresh();
    const { result } = renderHook(() => useTrackAudioPlayer());
    await act(async () => {
      await result.current.toggleTrack({
        id: 'track-1',
        title: 'Test Song',
        audioUrl: 'https://cdn.example.com/song.mp3',
      });
    });

    act(() => {
      mockAudio.duration = 180;
      mockAudio.currentTime = 12;
      fireAudioEvent('loadedmetadata');
      fireAudioEvent('timeupdate');
    });

    expect(setPositionState).toHaveBeenLastCalledWith({
      duration: 180,
      position: 12,
      playbackRate: 1,
    });

    await act(async () => {
      await result.current.toggleTrack({
        id: 'track-2',
        title: 'Next Song',
        audioUrl: 'https://cdn.example.com/next.mp3',
      });
    });
    expect(setPositionState).toHaveBeenLastCalledWith();

    act(() => result.current.stop());
    expect(setPositionState).toHaveBeenLastCalledWith();
    nowSpy.mockRestore();
  });

  it('stores queue metadata and advances to the next queued track on ended', async () => {
    const useTrackAudioPlayer = await importFresh();
    const { result } = renderHook(() => useTrackAudioPlayer());

    const queue = [
      {
        id: 'track-1',
        title: 'First Song',
        audioUrl: 'https://cdn.example.com/first.mp3',
      },
      {
        id: 'track-2',
        title: 'Second Song',
        audioUrl: 'https://cdn.example.com/second.mp3',
      },
    ];

    await act(async () => {
      await result.current.toggleTrack(queue[0], { queue });
    });
    act(() => {
      fireAudioEvent('play');
    });

    expect(result.current.playbackState.queueLength).toBe(2);
    expect(result.current.playbackState.queueIndex).toBe(0);
    expect(result.current.playbackState.hasNext).toBe(true);
    expect(result.current.playbackState.hasPrevious).toBe(false);

    await act(async () => {
      fireAudioEvent('ended');
    });

    expect(result.current.playbackState.activeTrackId).toBe('track-2');
    expect(result.current.playbackState.trackTitle).toBe('Second Song');
    expect(result.current.playbackState.queueIndex).toBe(1);
    expect(result.current.playbackState.hasNext).toBe(false);
    expect(result.current.playbackState.hasPrevious).toBe(true);
    expect(mockAudio.src).toBe('https://cdn.example.com/second.mp3');
  });

  it('moves to the previous queued track when playPrevious is called', async () => {
    const useTrackAudioPlayer = await importFresh();
    const { result } = renderHook(() => useTrackAudioPlayer());

    const queue = [
      {
        id: 'track-1',
        title: 'First Song',
        audioUrl: 'https://cdn.example.com/first.mp3',
      },
      {
        id: 'track-2',
        title: 'Second Song',
        audioUrl: 'https://cdn.example.com/second.mp3',
      },
    ];

    await act(async () => {
      await result.current.toggleTrack(queue[1], { queue });
    });
    act(() => {
      fireAudioEvent('play');
    });

    expect(result.current.playbackState.activeTrackId).toBe('track-2');
    expect(result.current.playbackState.hasPrevious).toBe(true);

    await act(async () => {
      await result.current.playPrevious();
    });

    expect(result.current.playbackState.activeTrackId).toBe('track-1');
    expect(result.current.playbackState.trackTitle).toBe('First Song');
    expect(mockAudio.src).toBe('https://cdn.example.com/first.mp3');
  });

  it('resets state and notifies listeners when play() rejects', async () => {
    nextPlayMock = vi.fn().mockRejectedValue(new Error('Playback blocked'));

    const useTrackAudioPlayer = await importFresh();
    const { result } = renderHook(() => useTrackAudioPlayer());
    const errorCb = vi.fn();

    act(() => {
      result.current.onError(errorCb);
    });

    await act(async () => {
      await expect(
        result.current.toggleTrack({
          id: 'track-1',
          title: 'Test Song',
          audioUrl: 'https://cdn.example.com/song.mp3',
        })
      ).rejects.toThrow('Playback blocked');
    });

    expect(result.current.playbackState.activeTrackId).toBeNull();
    expect(result.current.playbackState.isPlaying).toBe(false);
    expect(result.current.playbackState.trackTitle).toBeNull();
    expect(mockAudio.src).toBe('');
    expect(errorCb).toHaveBeenCalledTimes(1);
  });

  it('pauses for interruptions and stays paused by default', async () => {
    const useTrackAudioPlayer = await importFresh();
    const engine = await import(
      '@/components/organisms/release-sidebar/useTrackAudioPlayer'
    );
    const { result } = renderHook(() => useTrackAudioPlayer());

    await act(async () => {
      await result.current.toggleTrack({
        id: 'track-1',
        title: 'Test Song',
        audioUrl: 'https://cdn.example.com/song.mp3',
      });
    });
    act(() => {
      mockAudio.paused = false;
      fireAudioEvent('play');
    });

    act(() => {
      engine.pausePlaybackForInterruption();
    });
    expect(result.current.playbackState.playbackStatus).toBe('interrupted');
    expect(mockAudio.pause).toHaveBeenCalled();
    act(() => {
      mockAudio.paused = true;
      fireAudioEvent('pause');
    });

    act(() => {
      engine.resumePlaybackAfterInterruption();
    });
    expect(mockAudio.play).toHaveBeenCalledTimes(1);
    expect(result.current.playbackState.isPlaying).toBe(false);
    expect(result.current.playbackState.playbackStatus).toBe('paused');
  });

  it('keeps interruption ownership through queued media events', async () => {
    const useTrackAudioPlayer = await importFresh();
    const engine = await import(
      '@/components/organisms/release-sidebar/useTrackAudioPlayer'
    );
    const { result } = renderHook(() => useTrackAudioPlayer());

    await act(async () => {
      await result.current.toggleTrack({
        id: 'track-1',
        title: 'Test Song',
        audioUrl: 'https://cdn.example.com/song.mp3',
      });
    });
    act(() => {
      mockAudio.paused = false;
      fireAudioEvent('playing');
      engine.pausePlaybackForInterruption();
      mockAudio.paused = true;
      fireAudioEvent('pause');
      fireAudioEvent('playing');
      fireAudioEvent('waiting');
      fireAudioEvent('stalled');
      fireAudioEvent('canplay');
      fireAudioEvent('seeking');
      fireAudioEvent('seeked');
      fireAudioEvent('ended');
    });

    expect(result.current.playbackState.playbackStatus).toBe('interrupted');
    expect(result.current.playbackState.isPlaying).toBe(false);
    expect(result.current.playbackState.activeTrackId).toBe('track-1');
  });

  it('switches source onto a single active track', async () => {
    const useTrackAudioPlayer = await importFresh();
    const { result } = renderHook(() => useTrackAudioPlayer());

    await act(async () => {
      await result.current.toggleTrack({
        id: 'track-1',
        title: 'First',
        audioUrl: 'https://cdn.example.com/first.mp3',
      });
    });
    await act(async () => {
      await result.current.toggleTrack({
        id: 'track-2',
        title: 'Second',
        audioUrl: 'https://cdn.example.com/second.mp3',
      });
    });

    expect(result.current.playbackState.activeTrackId).toBe('track-2');
    expect(mockAudio.src).toBe('https://cdn.example.com/second.mp3');
    expect(audioInstances).toHaveLength(2);
    expect(audioInstances[0]?.pause).toHaveBeenCalled();
  });

  it('ignores late media events from a replaced source element', async () => {
    const useTrackAudioPlayer = await importFresh();
    const { result } = renderHook(() => useTrackAudioPlayer());

    await act(async () => {
      await result.current.toggleTrack({
        id: 'track-1',
        title: 'First',
        audioUrl: 'https://cdn.example.com/first.mp3',
      });
    });
    const firstAudio = mockAudio;

    await act(async () => {
      await result.current.toggleTrack({
        id: 'track-2',
        title: 'Second',
        audioUrl: 'https://cdn.example.com/second.mp3',
      });
    });

    act(() => {
      fireAudioEvent('playing', firstAudio);
      fireAudioEvent('waiting', firstAudio);
      fireAudioEvent('ended', firstAudio);
      fireAudioEvent('error', firstAudio);
    });

    expect(result.current.playbackState.activeTrackId).toBe('track-2');
    expect(result.current.playbackState.playbackStatus).toBe('loading');
    expect(mockAudio.src).toBe('https://cdn.example.com/second.mp3');
  });

  it('does not reuse a stopped source for the next track', async () => {
    const useTrackAudioPlayer = await importFresh();
    const { result } = renderHook(() => useTrackAudioPlayer());

    await act(async () => {
      await result.current.toggleTrack({
        id: 'track-1',
        title: 'First',
        audioUrl: 'https://cdn.example.com/first.mp3',
      });
    });
    const stoppedAudio = mockAudio;
    act(() => result.current.stop());

    await act(async () => {
      await result.current.toggleTrack({
        id: 'track-2',
        title: 'Second',
        audioUrl: 'https://cdn.example.com/second.mp3',
      });
    });
    act(() => {
      fireAudioEvent('playing', stoppedAudio);
      fireAudioEvent('error', stoppedAudio);
      fireAudioEvent('ended', stoppedAudio);
    });

    expect(audioInstances).toHaveLength(2);
    expect(result.current.playbackState.activeTrackId).toBe('track-2');
    expect(result.current.playbackState.playbackStatus).toBe('loading');
    expect(mockAudio.src).toBe('https://cdn.example.com/second.mp3');
  });

  it('does not reuse a failed source for the next track', async () => {
    const useTrackAudioPlayer = await importFresh();
    const { result } = renderHook(() => useTrackAudioPlayer());

    await act(async () => {
      await result.current.toggleTrack({
        id: 'track-1',
        title: 'First',
        audioUrl: 'https://cdn.example.com/first.mp3',
      });
    });
    const failedAudio = mockAudio;
    failedAudio.error = { code: 3 };
    act(() => fireAudioEvent('error', failedAudio));

    await act(async () => {
      await result.current.toggleTrack({
        id: 'track-2',
        title: 'Second',
        audioUrl: 'https://cdn.example.com/second.mp3',
      });
    });
    act(() => {
      fireAudioEvent('playing', failedAudio);
      fireAudioEvent('error', failedAudio);
      fireAudioEvent('ended', failedAudio);
    });

    expect(audioInstances).toHaveLength(2);
    expect(result.current.playbackState.activeTrackId).toBe('track-2');
    expect(result.current.playbackState.playbackStatus).toBe('loading');
    expect(mockAudio.src).toBe('https://cdn.example.com/second.mp3');
  });

  it('isolates refreshed preview playback from events on the expired source', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        previewUrl: 'https://cdn.example.com/refreshed.mp3',
        source: 'deezer',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const useTrackAudioPlayer = await importFresh();
      const { result } = renderHook(() => useTrackAudioPlayer());

      await act(async () => {
        await result.current.toggleTrack({
          id: 'track-1',
          title: 'Refresh Me',
          audioUrl: 'https://cdn.example.com/expired.mp3',
          isrc: 'USRC17607839',
        });
      });
      const expiredAudio = mockAudio;
      expiredAudio.error = { code: 2 };

      await act(async () => {
        fireAudioEvent('error', expiredAudio);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/preview-url/refresh?isrc=USRC17607839'
      );
      expect(audioInstances).toHaveLength(2);
      expect(mockAudio.src).toBe('https://cdn.example.com/refreshed.mp3');

      act(() => {
        fireAudioEvent('playing', expiredAudio);
        fireAudioEvent('waiting', expiredAudio);
        fireAudioEvent('ended', expiredAudio);
      });
      expect(result.current.playbackState.activeTrackId).toBe('track-1');
      expect(result.current.playbackState.playbackStatus).toBe('loading');

      act(() => fireAudioEvent('playing'));
      expect(result.current.playbackState.playbackStatus).toBe('playing');
    } finally {
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('settles in-flight seek and buffering marks when replacing a source', async () => {
    const measureSpy = vi.spyOn(performance, 'measure');
    const useTrackAudioPlayer = await importFresh();
    const { result } = renderHook(() => useTrackAudioPlayer());

    await act(async () => {
      await result.current.toggleTrack({
        id: 'track-1',
        title: 'First',
        audioUrl: 'https://cdn.example.com/first.mp3',
      });
    });
    act(() => {
      mockAudio.paused = false;
      fireAudioEvent('playing');
      fireAudioEvent('waiting');
      mockAudio.duration = 180;
      result.current.seek(42);
      fireAudioEvent('seeking');
    });

    await act(async () => {
      await result.current.toggleTrack({
        id: 'track-2',
        title: 'Second',
        audioUrl: 'https://cdn.example.com/second.mp3',
      });
    });

    expect(measureSpy).toHaveBeenCalledWith(
      'audio-buffering:event-to-superseded',
      expect.any(String),
      expect.any(String)
    );
    expect(measureSpy).toHaveBeenCalledWith(
      'audio-seek:event-to-superseded',
      expect.any(String),
      expect.any(String)
    );
    measureSpy.mockRestore();
  });

  it('ignores a late same-track resume rejection after switching tracks', async () => {
    const useTrackAudioPlayer = await importFresh();
    const { result } = renderHook(() => useTrackAudioPlayer());

    await act(async () => {
      await result.current.toggleTrack({
        id: 'track-1',
        title: 'First',
        audioUrl: 'https://cdn.example.com/first.mp3',
      });
    });
    mockAudio.paused = true;
    let rejectResume: ((error: Error) => void) | undefined;
    mockAudio.play.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectResume = reject;
        })
    );

    let resumePromise: Promise<void> | undefined;
    await act(async () => {
      resumePromise = result.current.toggleTrack({
        id: 'track-1',
        title: 'First',
      });
      await result.current.toggleTrack({
        id: 'track-2',
        title: 'Second',
        audioUrl: 'https://cdn.example.com/second.mp3',
      });
      rejectResume?.(new Error('Late rejection'));
      await expect(resumePromise).rejects.toThrow('Late rejection');
    });

    expect(result.current.playbackState.activeTrackId).toBe('track-2');
    expect(mockAudio.src).toBe('https://cdn.example.com/second.mp3');
  });

  it('ignores a late Media Session play rejection after switching tracks', async () => {
    const actionHandlers: Record<string, (() => void) | null> = {};
    Object.defineProperty(navigator, 'mediaSession', {
      configurable: true,
      value: {
        metadata: null,
        playbackState: 'none',
        setActionHandler: vi.fn(
          (action: string, handler: (() => void) | null) => {
            actionHandlers[action] = handler;
          }
        ),
        setPositionState: vi.fn(),
      },
    });
    vi.stubGlobal(
      'MediaMetadata',
      vi.fn(function MediaMetadata() {
        return {};
      })
    );

    const useTrackAudioPlayer = await importFresh();
    const { result } = renderHook(() => useTrackAudioPlayer());
    await act(async () => {
      await result.current.toggleTrack({
        id: 'track-1',
        title: 'First',
        audioUrl: 'https://cdn.example.com/first.mp3',
      });
    });

    let rejectMediaSessionPlay: ((error: Error) => void) | undefined;
    mockAudio.play.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectMediaSessionPlay = reject;
        })
    );
    actionHandlers.play?.();

    await act(async () => {
      await result.current.toggleTrack({
        id: 'track-2',
        title: 'Second',
        audioUrl: 'https://cdn.example.com/second.mp3',
      });
      rejectMediaSessionPlay?.(new Error('Late Media Session rejection'));
      await Promise.resolve();
    });

    expect(result.current.playbackState.activeTrackId).toBe('track-2');
    expect(mockAudio.src).toBe('https://cdn.example.com/second.mp3');
  });

  it('keeps the latest track active when an earlier play() resolves late', async () => {
    let resolveFirstPlay: (() => void) | undefined;
    let resolveSecondPlay: (() => void) | undefined;

    nextPlayMock = vi.fn().mockImplementation(
      () =>
        new Promise<void>(resolve => {
          resolveFirstPlay = resolve;
        })
    );

    const useTrackAudioPlayer = await importFresh();
    const { result } = renderHook(() => useTrackAudioPlayer());

    let firstToggle: Promise<void> | undefined;
    let secondToggle: Promise<void> | undefined;

    await act(async () => {
      firstToggle = result.current.toggleTrack({
        id: 'track-1',
        title: 'First Song',
        audioUrl: 'https://cdn.example.com/first.mp3',
      });
      nextPlayMock = vi.fn().mockImplementation(
        () =>
          new Promise<void>(resolve => {
            resolveSecondPlay = resolve;
          })
      );
      secondToggle = result.current.toggleTrack({
        id: 'track-2',
        title: 'Second Song',
        audioUrl: 'https://cdn.example.com/second.mp3',
      });

      resolveSecondPlay?.();
      await secondToggle;
      resolveFirstPlay?.();
      await firstToggle;
    });

    expect(audioInstances).toHaveLength(2);
    expect(mockAudio.src).toBe('https://cdn.example.com/second.mp3');
    expect(result.current.playbackState.activeTrackId).toBe('track-2');
    expect(result.current.playbackState.trackTitle).toBe('Second Song');
  });
});
