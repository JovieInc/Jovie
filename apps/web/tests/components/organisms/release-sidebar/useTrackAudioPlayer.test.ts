import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Map of event name -> listener callbacks registered on the mock Audio element
let audioEventListeners: Record<string, Array<() => void>>;
let audioEventListenerInstances: Array<Record<string, Array<() => void>>> = [];
let mockAudio: {
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  paused: boolean;
  src: string;
  preload: string;
  currentTime: number;
  duration: number;
};
let audioInstances: (typeof mockAudio)[] = [];
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
  };
  audioEventListenerInstances.push(audioEventListeners);
  audioInstances.push(mockAudio);
  nextPlayMock = null;
  return mockAudio;
}

function fireAudioEvent(event: string, instanceIndex?: number) {
  const listeners =
    instanceIndex === undefined
      ? audioEventListeners
      : audioEventListenerInstances[instanceIndex];
  const handlers = listeners?.[event];
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
    audioEventListenerInstances = [];
    audioInstances = [];
    nextPlayMock = null;
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
      sourceKind: 'release-preview' as const,
    };

    await act(async () => {
      await result.current.toggleTrack(track);
    });

    // After play, fire the 'play' event to set isPlaying
    act(() => {
      fireAudioEvent('play');
    });

    expect(result.current.playbackState.activeTrackId).toBe('track-1');
    expect(result.current.playbackState.sourceKind).toBe('release-preview');
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
    expect(result.current.playbackState.sourceKind).toBe('catalog');

    // Toggle same track -> should pause
    const pauseCountBeforeToggle = mockAudio.pause.mock.calls.length;
    await act(async () => {
      await result.current.toggleTrack(track);
    });
    expect(mockAudio.pause).toHaveBeenCalledTimes(pauseCountBeforeToggle + 1);
    act(() => {
      mockAudio.paused = true;
      fireAudioEvent('pause');
    });

    expect(audioInstances).toHaveLength(1);
    expect(result.current.playbackState.isPlaying).toBe(false);
    expect(result.current.playbackState.playbackStatus).toBe('paused');

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
    expect(result.current.playbackState.playbackStatus).toBe('playing');
  });

  it('fails closed when same-track resume is rejected', async () => {
    const useTrackAudioPlayer = await importFresh();
    const { result } = renderHook(() => useTrackAudioPlayer());
    const track = {
      id: 'track-1',
      title: 'Test Song',
      audioUrl: 'https://cdn.example.com/song.mp3',
    };

    await act(async () => {
      await result.current.toggleTrack(track);
    });
    mockAudio.paused = true;
    mockAudio.play.mockRejectedValueOnce(new Error('Resume blocked'));

    await act(async () => {
      await expect(result.current.toggleTrack(track)).rejects.toThrow(
        'Resume blocked'
      );
    });

    expect(result.current.playbackState).toMatchObject({
      activeTrackId: null,
      isPlaying: false,
      playbackStatus: 'error',
      lastErrorReason: 'play_rejected',
    });
    expect(mockAudio.src).toBe('');
  });

  it('replaces equal track ids when typed source provenance changes', async () => {
    const useTrackAudioPlayer = await importFresh();
    const { result } = renderHook(() => useTrackAudioPlayer());

    await act(async () => {
      await result.current.toggleTrack({
        id: 'shared-id',
        title: 'Catalog Track',
        audioUrl: 'https://cdn.example.com/catalog.mp3',
      });
      await result.current.toggleTrack({
        id: 'shared-id',
        title: 'Uploaded Mix',
        audioUrl: 'blob:https://jov.ie/uploaded-mix',
        sourceKind: 'chat-upload-preview',
      });
    });

    expect(audioInstances).toHaveLength(2);
    expect(audioInstances[0]?.src).toBe('');
    expect(audioInstances[1]?.src).toBe('blob:https://jov.ie/uploaded-mix');
    expect(result.current.playbackState.sourceKind).toBe('chat-upload-preview');
    expect(result.current.playbackState.trackTitle).toBe('Uploaded Mix');
  });

  it('ignores stale media events after another source takes authority', async () => {
    const useTrackAudioPlayer = await importFresh();
    const { result } = renderHook(() => useTrackAudioPlayer());

    await act(async () => {
      await result.current.toggleTrack({
        id: 'shared-id',
        title: 'Catalog Track',
        audioUrl: 'https://cdn.example.com/catalog.mp3',
      });
      await result.current.toggleTrack({
        id: 'shared-id',
        title: 'Uploaded Mix',
        audioUrl: 'blob:https://jov.ie/uploaded-mix',
        sourceKind: 'chat-upload-preview',
      });
    });

    act(() => {
      fireAudioEvent('play', 0);
      fireAudioEvent('error', 0);
    });

    expect(result.current.playbackState).toMatchObject({
      activeTrackId: 'shared-id',
      sourceKind: 'chat-upload-preview',
      trackTitle: 'Uploaded Mix',
      playbackStatus: 'loading',
      lastErrorReason: null,
    });
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
    expect(result.current.playbackState.sourceKind).toBeNull();
    expect(result.current.playbackState.isPlaying).toBe(false);
    expect(result.current.playbackState.trackTitle).toBeNull();
    expect(result.current.playbackState.releaseTitle).toBeNull();
    expect(result.current.playbackState.artistName).toBeNull();
    expect(result.current.playbackState.artworkUrl).toBeNull();
    expect(errorCb).toHaveBeenCalledTimes(1);
  });

  it('sets isPlaying to false and resets currentTime on ended event', async () => {
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
    expect(result.current.playbackState.playbackStatus).toBe('ended');
    expect(result.current.playbackState.currentTime).toBe(0);
    // activeTrackId should remain (track didn't error, it just finished)
    expect(result.current.playbackState.activeTrackId).toBe('track-1');
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

  it('clears playback state on stop and stays inactive after remount', async () => {
    const useTrackAudioPlayer = await importFresh();
    const firstMount = renderHook(() => useTrackAudioPlayer());
    const queue = [
      {
        id: 'track-1',
        title: 'Test Song',
        audioUrl: 'https://cdn.example.com/song.mp3',
        releaseTitle: 'Test Album',
        artistName: 'Test Artist',
        artworkUrl: 'https://cdn.example.com/art.jpg',
        hasLyrics: true,
      },
      {
        id: 'track-2',
        title: 'Next Song',
        audioUrl: 'https://cdn.example.com/next.mp3',
      },
    ];

    await act(async () => {
      await firstMount.result.current.toggleTrack(queue[0], { queue });
    });
    act(() => {
      mockAudio.paused = false;
      mockAudio.currentTime = 42;
      mockAudio.duration = 180;
      fireAudioEvent('play');
      fireAudioEvent('playing');
      fireAudioEvent('loadedmetadata');
      fireAudioEvent('timeupdate');
    });

    expect(firstMount.result.current.playbackState).toMatchObject({
      activeTrackId: 'track-1',
      isPlaying: true,
      playbackStatus: 'playing',
      currentTime: 42,
      duration: 180,
      trackTitle: 'Test Song',
      releaseTitle: 'Test Album',
      artistName: 'Test Artist',
      artworkUrl: 'https://cdn.example.com/art.jpg',
      hasLyrics: true,
      queueLength: 2,
      queueIndex: 0,
      hasNext: true,
      hasPrevious: false,
    });

    const pauseCallsBeforeStop = mockAudio.pause.mock.calls.length;
    act(() => {
      firstMount.result.current.stop();
    });

    expect(mockAudio.pause).toHaveBeenCalledTimes(pauseCallsBeforeStop + 1);
    expect(mockAudio.src).toBe('');
    expect(firstMount.result.current.playbackState).toEqual({
      activeTrackId: null,
      sourceKind: null,
      isPlaying: false,
      playbackStatus: 'idle',
      lastErrorReason: null,
      currentTime: 0,
      duration: 0,
      trackTitle: null,
      releaseTitle: null,
      artistName: null,
      artworkUrl: null,
      hasLyrics: false,
      queueLength: 0,
      queueIndex: -1,
      hasNext: false,
      hasPrevious: false,
    });

    firstMount.unmount();
    const remount = renderHook(() => useTrackAudioPlayer());

    expect(remount.result.current.playbackState.activeTrackId).toBeNull();
    expect(remount.result.current.playbackState.playbackStatus).toBe('idle');
    expect(mockAudio.src).toBe('');
  });

  it('preserves the active track and playhead while shell consumers remount', async () => {
    const useTrackAudioPlayer = await importFresh();
    const firstMount = renderHook(() => useTrackAudioPlayer());

    await act(async () => {
      await firstMount.result.current.toggleTrack({
        id: 'track-1',
        title: 'Test Song',
        audioUrl: 'https://cdn.example.com/song.mp3',
        hasLyrics: true,
      });
    });
    act(() => {
      mockAudio.paused = false;
      mockAudio.currentTime = 42;
      mockAudio.duration = 180;
      fireAudioEvent('playing');
      fireAudioEvent('loadedmetadata');
      fireAudioEvent('timeupdate');
    });

    const audioBeforeTransition = mockAudio;
    const pauseCallsBeforeTransition = mockAudio.pause.mock.calls.length;
    firstMount.unmount();
    const remount = renderHook(() => useTrackAudioPlayer());

    expect(mockAudio).toBe(audioBeforeTransition);
    expect(mockAudio.pause).toHaveBeenCalledTimes(pauseCallsBeforeTransition);
    expect(mockAudio.src).toBe('https://cdn.example.com/song.mp3');
    expect(remount.result.current.playbackState).toMatchObject({
      activeTrackId: 'track-1',
      currentTime: 42,
      duration: 180,
      hasLyrics: true,
      isPlaying: true,
      playbackStatus: 'playing',
    });
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

    const pauseCallsBeforeInterruption = mockAudio.pause.mock.calls.length;
    act(() => {
      engine.pausePlaybackForInterruption();
    });
    expect(mockAudio.pause).toHaveBeenCalledTimes(
      pauseCallsBeforeInterruption + 1
    );
    expect(result.current.playbackState.isPlaying).toBe(false);
    expect(result.current.playbackState.playbackStatus).toBe('interrupted');
    act(() => {
      mockAudio.paused = true;
      fireAudioEvent('pause');
    });
    expect(result.current.playbackState.playbackStatus).toBe('interrupted');

    act(() => {
      engine.resumePlaybackAfterInterruption();
    });
    expect(mockAudio.play).toHaveBeenCalledTimes(1);
    expect(result.current.playbackState.isPlaying).toBe(false);
    expect(result.current.playbackState.playbackStatus).toBe('paused');

    act(() => {
      engine.resumePlaybackAfterInterruption({ resume: true });
    });
    expect(mockAudio.play).toHaveBeenCalledTimes(1);
  });

  it('adopts canonical loading, buffering, seeking, stalled, and recovery states', async () => {
    const useTrackAudioPlayer = await importFresh();
    const { result } = renderHook(() => useTrackAudioPlayer());

    await act(async () => {
      await result.current.toggleTrack({
        id: 'track-1',
        title: 'Test Song',
        audioUrl: 'https://cdn.example.com/song.mp3',
      });
    });

    expect(result.current.playbackState.playbackStatus).toBe('loading');

    act(() => {
      mockAudio.paused = false;
      fireAudioEvent('play');
    });
    expect(result.current.playbackState.playbackStatus).toBe('loading');
    expect(result.current.playbackState.isPlaying).toBe(true);

    act(() => {
      fireAudioEvent('playing');
    });
    expect(result.current.playbackState.playbackStatus).toBe('playing');

    act(() => {
      fireAudioEvent('waiting');
    });
    expect(result.current.playbackState.playbackStatus).toBe('buffering');
    expect(result.current.playbackState.isPlaying).toBe(true);

    act(() => {
      fireAudioEvent('canplay');
    });
    expect(result.current.playbackState.playbackStatus).toBe('playing');
    expect(result.current.playbackState.isPlaying).toBe(true);

    act(() => {
      fireAudioEvent('seeking');
    });
    expect(result.current.playbackState.playbackStatus).toBe('seeking');
    expect(result.current.playbackState.isPlaying).toBe(true);

    act(() => {
      mockAudio.currentTime = 24;
      fireAudioEvent('seeked');
    });
    expect(result.current.playbackState).toMatchObject({
      playbackStatus: 'playing',
      currentTime: 24,
      isPlaying: true,
    });

    act(() => {
      fireAudioEvent('stalled');
    });
    expect(result.current.playbackState.playbackStatus).toBe('stalled');
    expect(result.current.playbackState.isPlaying).toBe(true);

    act(() => {
      fireAudioEvent('playing');
    });
    expect(result.current.playbackState.playbackStatus).toBe('playing');
  });

  it('keeps paused media paused when it becomes playable', async () => {
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
      mockAudio.paused = true;
      fireAudioEvent('canplay');
    });

    expect(result.current.playbackState).toMatchObject({
      playbackStatus: 'paused',
      isPlaying: false,
    });
  });

  it('publishes seeking state immediately and clamps cue jumps', async () => {
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
      mockAudio.duration = 30;
      fireAudioEvent('playing');
      result.current.seek(99);
    });

    expect(mockAudio.currentTime).toBe(30);
    expect(result.current.playbackState).toMatchObject({
      playbackStatus: 'seeking',
      currentTime: 30,
      isPlaying: true,
    });

    act(() => {
      fireAudioEvent('seeked');
    });
    expect(result.current.playbackState.playbackStatus).toBe('playing');
  });

  it('ignores invalid cue jumps and missing media without changing state', async () => {
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
      mockAudio.duration = 0;
      result.current.seek(10);
      result.current.seek(Number.NaN);
      mockAudio.duration = Number.POSITIVE_INFINITY;
      result.current.seek(10);
    });
    expect(mockAudio.currentTime).toBe(0);
    expect(result.current.playbackState.playbackStatus).toBe('loading');

    vi.stubGlobal('Audio', undefined);
    vi.resetModules();
    const usePlayerWithoutAudio = await importFresh();
    const withoutAudio = renderHook(() => usePlayerWithoutAudio());
    act(() => {
      withoutAudio.result.current.seek(10);
    });
    expect(withoutAudio.result.current.playbackState.playbackStatus).toBe(
      'idle'
    );
    withoutAudio.unmount();
    vi.stubGlobal('Audio', MockAudioConstructor);
  });

  it('publishes metadata duration and resets progress throttling after seek', async () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(1000);
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
      mockAudio.duration = 90;
      fireAudioEvent('loadedmetadata');
    });
    expect(result.current.playbackState.duration).toBe(90);

    act(() => {
      mockAudio.currentTime = 5;
      fireAudioEvent('timeupdate');
    });
    expect(result.current.playbackState.currentTime).toBe(5);

    nowSpy.mockReturnValue(1100);
    act(() => {
      mockAudio.currentTime = 6;
      fireAudioEvent('timeupdate');
    });
    expect(result.current.playbackState.currentTime).toBe(5);

    act(() => {
      fireAudioEvent('seeked');
      mockAudio.currentTime = 7;
      fireAudioEvent('timeupdate');
    });
    expect(result.current.playbackState.currentTime).toBe(7);
    nowSpy.mockRestore();
  });

  it('keeps nested interruption state until the final hold releases', async () => {
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
      engine.pausePlaybackForInterruption();
      mockAudio.paused = true;
      fireAudioEvent('pause');
    });

    expect(result.current.playbackState.playbackStatus).toBe('interrupted');

    act(() => {
      engine.resumePlaybackAfterInterruption({ resume: true });
    });
    expect(result.current.playbackState.playbackStatus).toBe('interrupted');
    expect(mockAudio.play).toHaveBeenCalledTimes(1);

    act(() => {
      engine.resumePlaybackAfterInterruption({ resume: true });
    });
    expect(result.current.playbackState.playbackStatus).toBe('paused');
    expect(mockAudio.play).toHaveBeenCalledTimes(2);

    act(() => {
      mockAudio.paused = false;
      fireAudioEvent('play');
      fireAudioEvent('playing');
    });
    expect(result.current.playbackState.playbackStatus).toBe('playing');
  });

  it('does not pause or auto-resume a track that was already paused', async () => {
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
      mockAudio.paused = true;
      fireAudioEvent('pause');
    });
    const pauseCalls = mockAudio.pause.mock.calls.length;
    const playCalls = mockAudio.play.mock.calls.length;

    act(() => {
      engine.pausePlaybackForInterruption();
      engine.resumePlaybackAfterInterruption({ resume: true });
    });

    expect(mockAudio.pause).toHaveBeenCalledTimes(pauseCalls);
    expect(mockAudio.play).toHaveBeenCalledTimes(playCalls);
    expect(result.current.playbackState.playbackStatus).toBe('paused');
  });

  it('does not auto-resume when media pauses before state catches up', async () => {
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
    });
    expect(result.current.playbackState.isPlaying).toBe(true);

    const playCalls = mockAudio.play.mock.calls.length;
    act(() => {
      mockAudio.paused = true;
      engine.pausePlaybackForInterruption();
      engine.resumePlaybackAfterInterruption({ resume: true });
    });

    expect(mockAudio.play).toHaveBeenCalledTimes(playCalls);
    expect(result.current.playbackState.playbackStatus).toBe('paused');
  });

  it('ignores a stray interruption release without corrupting the next hold', async () => {
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
      mockAudio.paused = true;
      fireAudioEvent('pause');
      engine.resumePlaybackAfterInterruption({ resume: true });
      engine.pausePlaybackForInterruption();
    });

    expect(result.current.playbackState.playbackStatus).toBe('interrupted');
  });

  it('lets an explicit play override clear interruption ownership', async () => {
    const useTrackAudioPlayer = await importFresh();
    const engine = await import(
      '@/components/organisms/release-sidebar/useTrackAudioPlayer'
    );
    const { result } = renderHook(() => useTrackAudioPlayer());
    const track = {
      id: 'track-1',
      title: 'Test Song',
      audioUrl: 'https://cdn.example.com/song.mp3',
    };

    await act(async () => {
      await result.current.toggleTrack(track);
    });
    act(() => {
      mockAudio.paused = false;
      fireAudioEvent('playing');
      engine.pausePlaybackForInterruption();
      mockAudio.paused = true;
      fireAudioEvent('pause');
    });

    await act(async () => {
      await result.current.toggleTrack(track);
    });
    expect(result.current.playbackState).toMatchObject({
      isPlaying: false,
      playbackStatus: 'paused',
    });
    act(() => {
      mockAudio.paused = false;
      fireAudioEvent('play');
      fireAudioEvent('playing');
    });
    expect(result.current.playbackState.playbackStatus).toBe('playing');

    const playCalls = mockAudio.play.mock.calls.length;
    act(() => {
      engine.resumePlaybackAfterInterruption({ resume: true });
    });
    expect(mockAudio.play).toHaveBeenCalledTimes(playCalls);
  });

  it('does not publish an interruption release during a normal pause toggle', async () => {
    const useTrackAudioPlayer = await importFresh();
    const { result } = renderHook(() => useTrackAudioPlayer());
    const track = {
      id: 'track-1',
      title: 'Test Song',
      audioUrl: 'https://cdn.example.com/song.mp3',
    };

    await act(async () => {
      await result.current.toggleTrack(track);
    });
    act(() => {
      mockAudio.paused = false;
      fireAudioEvent('playing');
    });
    expect(result.current.playbackState.playbackStatus).toBe('playing');

    await act(async () => {
      await result.current.toggleTrack(track);
    });
    expect(result.current.playbackState).toMatchObject({
      isPlaying: true,
      playbackStatus: 'playing',
    });
  });

  it('fails closed when interruption resume is rejected', async () => {
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
    });

    mockAudio.play.mockRejectedValueOnce(new Error('Resume blocked'));
    await act(async () => {
      engine.resumePlaybackAfterInterruption({ resume: true });
      await Promise.resolve();
    });

    expect(result.current.playbackState).toMatchObject({
      activeTrackId: null,
      isPlaying: false,
      playbackStatus: 'error',
      lastErrorReason: 'play_rejected',
    });
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
    expect(mockAudio.pause.mock.calls.length).toBeGreaterThanOrEqual(1);
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
    expect(audioInstances[0]?.pause).toHaveBeenCalledTimes(2);
    expect(audioInstances[0]?.src).toBe('');
    expect(audioInstances[1]?.src).toBe('https://cdn.example.com/second.mp3');
    expect(result.current.playbackState.activeTrackId).toBe('track-2');
    expect(result.current.playbackState.trackTitle).toBe('Second Song');
  });
});
