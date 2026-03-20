import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Map of event name -> listener callbacks registered on the mock Audio element
let audioEventListeners: Record<string, Array<() => void>>;
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

function createMockAudio() {
  audioEventListeners = {};
  mockAudio = {
    play: vi.fn().mockResolvedValue(undefined),
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
  return mockAudio;
}

function fireAudioEvent(event: string) {
  const handlers = audioEventListeners[event];
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
  });
});
