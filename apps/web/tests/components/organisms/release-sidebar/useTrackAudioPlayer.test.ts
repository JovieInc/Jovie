import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioTrackSource } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';

let audioEventListeners: Record<string, Array<() => void>>;
let mockAudio: {
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  paused: boolean;
  src: string;
  currentTime: number;
  duration: number;
};
let nextPlayMock: ReturnType<typeof vi.fn> | null = null;

function createMockAudio() {
  audioEventListeners = {};
  mockAudio = {
    play: nextPlayMock ?? vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    addEventListener: vi.fn((event: string, handler: () => void) => {
      (audioEventListeners[event] ??= []).push(handler);
    }),
    paused: true,
    src: '',
    currentTime: 0,
    duration: 0,
  };
  nextPlayMock = null;
  return mockAudio;
}

function fireAudioEvent(event: string) {
  for (const handler of audioEventListeners[event] ?? []) handler();
}

vi.stubGlobal('Audio', function MockAudio() {
  return createMockAudio();
});

async function setup() {
  const mod = await import(
    '@/components/organisms/release-sidebar/useTrackAudioPlayer'
  );
  return { mod, result: renderHook(() => mod.useTrackAudioPlayer()).result };
}

const CDN = 'https://cdn.example.com';
const song = (id: string, extra: object = {}) => ({
  id,
  title: 'Test Song',
  audioUrl: `${CDN}/song.mp3`,
  ...extra,
});

const ps = (r: { current: any }) => r.current.playbackState;

const play = async (result: { current: any }, t: object) => {
  await act(async () => {
    await result.current.toggleTrack(t);
  });
  act(() => {
    mockAudio.paused = false;
    fireAudioEvent('play');
  });
};

describe('useTrackAudioPlayer', () => {
  beforeEach(() => {
    vi.resetModules();
    nextPlayMock = null;
  });

  it('plays a new track and sets metadata', async () => {
    const { result } = await setup();

    await act(async () => {
      await result.current.toggleTrack(
        song('track-1', {
          releaseTitle: 'Test Album',
          artistName: 'Test Artist',
          artworkUrl: `${CDN}/art.jpg`,
        })
      );
    });
    act(() => {
      fireAudioEvent('play');
    });

    expect(ps(result)).toMatchObject({
      activeTrackId: 'track-1',
      trackTitle: 'Test Song',
      releaseTitle: 'Test Album',
      artistName: 'Test Artist',
      artworkUrl: `${CDN}/art.jpg`,
      isPlaying: true,
    });
    expect(mockAudio.src).toBe(`${CDN}/song.mp3`);
    expect(mockAudio.play).toHaveBeenCalledTimes(1);
  });

  it('toggles pause/resume when called with the same track ID', async () => {
    const { result } = await setup();
    const track = song('track-1');

    await play(result, track);
    expect(ps(result).isPlaying).toBe(true);

    await act(async () => {
      await result.current.toggleTrack(track);
    });
    act(() => {
      mockAudio.paused = true;
      fireAudioEvent('pause');
    });
    expect(mockAudio.pause).toHaveBeenCalled();
    expect(ps(result).isPlaying).toBe(false);

    await act(async () => {
      await result.current.toggleTrack(track);
    });
    act(() => {
      mockAudio.paused = false;
      fireAudioEvent('play');
    });
    expect(mockAudio.play).toHaveBeenCalledTimes(2);
    expect(ps(result).isPlaying).toBe(true);
  });

  it('resets state and notifies error listeners on audio error', async () => {
    const { result } = await setup();
    const errorCb = vi.fn();
    act(() => {
      result.current.onError(errorCb);
    });

    await act(async () => {
      await result.current.toggleTrack(
        song('track-1', {
          releaseTitle: 'Album',
          artistName: 'Artist',
          artworkUrl: `${CDN}/art.jpg`,
        })
      );
    });
    expect(ps(result).activeTrackId).toBe('track-1');

    act(() => {
      fireAudioEvent('error');
    });

    expect(ps(result)).toMatchObject({
      activeTrackId: null,
      isPlaying: false,
      trackTitle: null,
      releaseTitle: null,
      artistName: null,
      artworkUrl: null,
    });
    expect(errorCb).toHaveBeenCalledTimes(1);
  });

  it('keeps error status when a queued pause event lands after failure', async () => {
    const { result } = await setup();

    await act(async () => {
      await result.current.toggleTrack(song('track-1'));
    });
    act(() => {
      fireAudioEvent('error');
    });
    expect(ps(result).playbackStatus).toBe('error');

    act(() => {
      fireAudioEvent('pause');
    });
    expect(ps(result).playbackStatus).toBe('error');
    expect(ps(result).isPlaying).toBe(false);
  });

  it('sets isPlaying to false and resets currentTime on ended event', async () => {
    const { result } = await setup();

    await play(result, song('track-1'));

    act(() => {
      mockAudio.currentTime = 30;
      mockAudio.duration = 180;
      fireAudioEvent('timeupdate');
    });
    expect(ps(result).currentTime).toBe(30);

    act(() => {
      fireAudioEvent('ended');
    });
    expect(ps(result).isPlaying).toBe(false);
    expect(ps(result).currentTime).toBe(0);
    expect(ps(result).activeTrackId).toBe('track-1');
  });

  const queue = (): AudioTrackSource[] => [
    song('track-1', { title: 'First Song', audioUrl: `${CDN}/first.mp3` }),
    song('track-2', { title: 'Second Song', audioUrl: `${CDN}/second.mp3` }),
  ];

  it('stores queue metadata and advances to the next queued track on ended', async () => {
    const { result } = await setup();
    const q = queue();

    await act(async () => {
      await result.current.toggleTrack(q[0], { queue: q });
    });
    act(() => {
      fireAudioEvent('play');
    });
    expect(ps(result)).toMatchObject({
      queueLength: 2,
      queueIndex: 0,
      hasNext: true,
      hasPrevious: false,
    });

    await act(async () => {
      fireAudioEvent('ended');
    });
    expect(ps(result)).toMatchObject({
      activeTrackId: 'track-2',
      trackTitle: 'Second Song',
      queueIndex: 1,
      hasNext: false,
      hasPrevious: true,
    });
    expect(mockAudio.src).toBe(`${CDN}/second.mp3`);
  });

  it('moves to the previous queued track when playPrevious is called', async () => {
    const { result } = await setup();
    const q = queue();

    await act(async () => {
      await result.current.toggleTrack(q[1], { queue: q });
    });
    act(() => {
      fireAudioEvent('play');
    });
    expect(ps(result).activeTrackId).toBe('track-2');
    expect(ps(result).hasPrevious).toBe(true);

    await act(async () => {
      await result.current.playPrevious();
    });
    expect(ps(result).activeTrackId).toBe('track-1');
    expect(ps(result).trackTitle).toBe('First Song');
    expect(mockAudio.src).toBe(`${CDN}/first.mp3`);
  });

  it('clears playback state on stop and stays inactive after remount', async () => {
    const { result } = await setup();
    const q = queue();
    q[0] = {
      ...q[0],
      releaseTitle: 'Test Album',
      artistName: 'Test Artist',
      artworkUrl: `${CDN}/art.jpg`,
      hasLyrics: true,
    };

    await act(async () => {
      await result.current.toggleTrack(q[0], { queue: q });
    });
    act(() => {
      mockAudio.paused = false;
      mockAudio.currentTime = 42;
      mockAudio.duration = 180;
      fireAudioEvent('play');
      fireAudioEvent('loadedmetadata');
      fireAudioEvent('timeupdate');
    });

    expect(ps(result)).toMatchObject({
      activeTrackId: 'track-1',
      isPlaying: true,
      playbackStatus: 'playing',
      currentTime: 42,
      duration: 180,
      trackTitle: 'First Song',
      releaseTitle: 'Test Album',
      artistName: 'Test Artist',
      artworkUrl: `${CDN}/art.jpg`,
      hasLyrics: true,
      queueLength: 2,
      queueIndex: 0,
      hasNext: true,
      hasPrevious: false,
    });

    const pauseCallsBeforeStop = mockAudio.pause.mock.calls.length;
    act(() => {
      result.current.stop();
    });

    expect(mockAudio.pause).toHaveBeenCalledTimes(pauseCallsBeforeStop + 1);
    expect(mockAudio.src).toBe('');
    expect(ps(result)).toEqual({
      activeTrackId: null,
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
      bpm: null,
      musicalKey: null,
      queueLength: 0,
      queueIndex: -1,
      hasNext: false,
      hasPrevious: false,
    });
  });

  it('resets state and notifies listeners when play() rejects', async () => {
    nextPlayMock = vi.fn().mockRejectedValue(new Error('Playback blocked'));

    const { result } = await setup();
    const errorCb = vi.fn();
    act(() => {
      result.current.onError(errorCb);
    });

    await act(async () => {
      await expect(result.current.toggleTrack(song('track-1'))).rejects.toThrow(
        'Playback blocked'
      );
    });

    expect(ps(result)).toMatchObject({
      activeTrackId: null,
      isPlaying: false,
      trackTitle: null,
    });
    expect(mockAudio.src).toBe('');
    expect(errorCb).toHaveBeenCalledTimes(1);
  });

  it('pauses for interruptions and stays paused by default', async () => {
    const { mod, result } = await setup();

    await play(result, song('track-1'));

    act(() => {
      mod.pausePlaybackForInterruption();
    });
    expect(mockAudio.pause).toHaveBeenCalled();
    act(() => {
      mockAudio.paused = true;
      fireAudioEvent('pause');
    });

    act(() => {
      mod.resumePlaybackAfterInterruption();
    });
    expect(mockAudio.play).toHaveBeenCalledTimes(1);
    expect(ps(result).isPlaying).toBe(false);
  });

  it('switches source onto a single active track', async () => {
    const { result } = await setup();

    await act(async () => {
      await result.current.toggleTrack(
        song('track-1', { title: 'First', audioUrl: `${CDN}/first.mp3` })
      );
    });
    await act(async () => {
      await result.current.toggleTrack(
        song('track-2', { title: 'Second', audioUrl: `${CDN}/second.mp3` })
      );
    });

    expect(ps(result).activeTrackId).toBe('track-2');
    expect(mockAudio.src).toBe(`${CDN}/second.mp3`);
    expect(mockAudio.pause.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps the latest track active when an earlier play() resolves late', async () => {
    let resolveFirstPlay: (() => void) | undefined;
    let resolveSecondPlay: (() => void) | undefined;
    nextPlayMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            resolveFirstPlay = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            resolveSecondPlay = resolve;
          })
      );

    const { result } = await setup();

    await act(async () => {
      const firstToggle = result.current.toggleTrack(
        song('track-1', { title: 'First Song', audioUrl: `${CDN}/first.mp3` })
      );
      const secondToggle = result.current.toggleTrack(
        song('track-2', { title: 'Second Song', audioUrl: `${CDN}/second.mp3` })
      );
      resolveSecondPlay?.();
      await secondToggle;
      resolveFirstPlay?.();
      await firstToggle;
    });

    expect(mockAudio.pause).toHaveBeenCalledTimes(2);
    expect(mockAudio.src).toBe(`${CDN}/second.mp3`);
    expect(ps(result).activeTrackId).toBe('track-2');
    expect(ps(result).trackTitle).toBe('Second Song');
  });

  it('syncs now-playing metadata for the active track’s release without resetting playback', async () => {
    const { mod, result } = await setup();

    await act(async () => {
      await result.current.toggleTrack(
        song('track-9', {
          title: 'Old Song',
          releaseId: 'release-1',
          releaseTitle: 'Old Album',
          artworkUrl: `${CDN}/old.jpg`,
        })
      );
    });
    act(() => {
      fireAudioEvent('play');
    });

    act(() => {
      mod.updateNowPlayingForRelease({
        id: 'release-1',
        title: 'New Album',
        artworkUrl: `${CDN}/new.jpg`,
        artistNames: ['New Artist'],
      });
    });

    expect(ps(result)).toMatchObject({
      releaseTitle: 'New Album',
      artworkUrl: `${CDN}/new.jpg`,
      artistName: 'New Artist',
      trackTitle: 'Old Song',
      activeTrackId: 'track-9',
      isPlaying: true,
    });
    expect(mockAudio.src).toBe(`${CDN}/song.mp3`);
    expect(mockAudio.play).toHaveBeenCalledTimes(1);
  });

  it('ignores now-playing updates for a different release', async () => {
    const { mod, result } = await setup();

    await act(async () => {
      await result.current.toggleTrack(
        song('track-9', {
          title: 'Old Song',
          releaseId: 'release-1',
          releaseTitle: 'Old Album',
        })
      );
    });

    act(() => {
      mod.updateNowPlayingForRelease({ id: 'release-2', title: 'Unrelated' });
    });

    expect(ps(result).releaseTitle).toBe('Old Album');
    expect(ps(result).trackTitle).toBe('Old Song');
  });
});
