'use client';

import { useCallback, useEffect, useState } from 'react';

export interface AudioTrackSource {
  readonly id: string;
  readonly title: string;
  /** Owning release id — lets mutations refresh now-playing metadata. */
  readonly releaseId?: string;
  /** Required for a new track; omit when resuming the same track. */
  readonly audioUrl?: string;
  /** ISRC — used to fetch a fresh preview URL if the stored one expires. */
  readonly isrc?: string | null;
  readonly releaseTitle?: string;
  readonly artistName?: string;
  readonly artworkUrl?: string | null;
  readonly hasLyrics?: boolean;
  /** Analyzed tempo, when known. Never fabricated — omit rather than guess. */
  readonly bpm?: number | null;
  /** Musical/Camelot key, when known. Never fabricated — omit rather than guess. */
  readonly musicalKey?: string | null;
}

export interface ToggleTrackOptions {
  /** Ordered playable context for next/previous transport. */
  readonly queue?: readonly AudioTrackSource[];
}

interface PlaybackState {
  readonly activeTrackId: string | null;
  readonly isPlaying: boolean;
  readonly playbackStatus: 'idle' | 'loading' | 'playing' | 'paused' | 'error';
  readonly lastErrorReason:
    | 'play_rejected'
    | 'media_error'
    | 'missing_source'
    | null;
  readonly currentTime: number;
  readonly duration: number;
  readonly trackTitle: string | null;
  readonly releaseTitle: string | null;
  readonly artistName: string | null;
  readonly artworkUrl: string | null;
  readonly hasLyrics: boolean;
  /** Analyzed tempo for the active track — null when absent, never fabricated. */
  readonly bpm: number | null;
  /** Musical/Camelot key — null when absent, never fabricated. */
  readonly musicalKey: string | null;
  readonly queueLength: number;
  readonly queueIndex: number;
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
}

let _audio: HTMLAudioElement | null = null;
/** Guards against stale play() promises from prior track switches. */
let _playToken = 0;
/** Active track's ISRC — used for preview URL refresh on expiration. */
let _activeTrackIsrc: string | null = null;
/** Active track's release id — syncs now-playing metadata on mutations. */
let _activeTrackReleaseId: string | null = null;
/** Whether a preview URL refresh was already attempted (prevents loops). */
let _hasRetriedRefresh = false;
let _queue: readonly AudioTrackSource[] = [];
let _queueIndex = -1;
/** Nested audio-focus holds (dictation/local preview). Resume is opt-in. */
let _interruptionDepth = 0;
let _wasPlayingBeforeInterruption = false;
let _mediaSessionBound = false;
/** ~4 Hz progress notify for cross-surface scrub without rAF thrash. */
const PROGRESS_NOTIFY_MS = 250;

/** Lazily create the Audio element — safe to call during SSR (returns null server-side). */
function getAudio(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  if (!_audio) {
    _audio = new Audio();
    _audio.preload = 'metadata';
    bindAudioEvents(_audio);
  }
  return _audio;
}

function isPlayableTrack(track: AudioTrackSource): boolean {
  return Boolean(track.audioUrl);
}

function getQueueSnapshot(): Pick<
  PlaybackState,
  'queueLength' | 'queueIndex' | 'hasNext' | 'hasPrevious'
> {
  return {
    queueLength: _queue.length,
    queueIndex: _queueIndex,
    hasNext: _queueIndex >= 0 && _queueIndex < _queue.length - 1,
    hasPrevious: _queueIndex > 0,
  };
}

function setPlaybackQueue(
  queue: readonly AudioTrackSource[] | undefined,
  activeTrackId: string
): void {
  if (!queue || queue.length === 0) {
    _queue = [];
    _queueIndex = -1;
    return;
  }

  _queue = queue.filter(isPlayableTrack);
  _queueIndex = _queue.findIndex(track => track.id === activeTrackId);
}

function clearPlaybackQueue(): void {
  _queue = [];
  _queueIndex = -1;
}

function getQueueTrackAt(index: number): AudioTrackSource | null {
  if (index < 0 || index >= _queue.length) return null;
  return _queue[index] ?? null;
}

let state: PlaybackState = {
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
};

const listeners = new Set<() => void>();
const errorListeners = new Set<
  (reason: PlaybackState['lastErrorReason']) => void
>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setState(partial: Partial<PlaybackState>): void {
  const prev = state;
  state = { ...state, ...partial };
  notify();

  if (
    prev.activeTrackId !== state.activeTrackId ||
    prev.trackTitle !== state.trackTitle ||
    prev.artistName !== state.artistName ||
    prev.releaseTitle !== state.releaseTitle ||
    prev.artworkUrl !== state.artworkUrl ||
    prev.isPlaying !== state.isPlaying ||
    prev.duration !== state.duration
  ) {
    syncMediaSession();
  }
}

function getMediaSession(): MediaSession | null {
  if (typeof navigator === 'undefined') return null;
  if (!('mediaSession' in navigator)) return null;
  return navigator.mediaSession;
}

function bindMediaSessionHandlers(): void {
  if (_mediaSessionBound) return;
  const session = getMediaSession();
  if (!session) return;

  try {
    session.setActionHandler('play', () => {
      const audio = getAudio();
      if (!audio || !state.activeTrackId) return;
      void audio.play().catch(() => {
        handlePlaybackFailure(audio, 'play_rejected');
      });
    });
    session.setActionHandler('pause', () => {
      getAudio()?.pause();
    });
    session.setActionHandler('previoustrack', () => {
      if (state.hasPrevious) {
        void advanceQueueToIndex(_queueIndex - 1);
      }
    });
    session.setActionHandler('nexttrack', () => {
      if (state.hasNext) {
        void advanceQueueToIndex(_queueIndex + 1);
      }
    });
    session.setActionHandler('seekto', details => {
      if (typeof details.seekTime !== 'number') return;
      seekToTime(details.seekTime);
    });
    _mediaSessionBound = true;
  } catch {
    // Some browsers reject unsupported action handlers — ignore.
  }
}

function syncMediaSession(): void {
  const session = getMediaSession();
  if (!session) return;

  bindMediaSessionHandlers();

  if (!state.activeTrackId) {
    session.metadata = null;
    session.playbackState = 'none';
    return;
  }

  try {
    session.metadata = new MediaMetadata({
      title: state.trackTitle ?? 'Unknown track',
      artist: state.artistName ?? '',
      album: state.releaseTitle ?? '',
      artwork: state.artworkUrl
        ? [{ src: state.artworkUrl, sizes: '512x512' }]
        : [],
    });
  } catch {
    // MediaMetadata construction can throw on invalid artwork URLs.
  }

  session.playbackState = state.isPlaying ? 'playing' : 'paused';

  try {
    if (
      Number.isFinite(state.duration) &&
      state.duration > 0 &&
      typeof session.setPositionState === 'function'
    ) {
      session.setPositionState({
        duration: state.duration,
        position: Math.min(state.currentTime, state.duration),
        playbackRate: 1,
      });
    }
  } catch {
    // setPositionState throws when position > duration during short previews.
  }
}

function seekToTime(time: number): void {
  const audio = getAudio();
  if (!audio || !Number.isFinite(time)) return;
  if (!Number.isFinite(audio.duration) || audio.duration === 0) return;
  audio.currentTime = Math.max(0, Math.min(time, audio.duration));
}

function notifyPlaybackError(reason: PlaybackState['lastErrorReason']): void {
  for (const cb of errorListeners) {
    cb(reason);
  }
}

function handlePlaybackFailure(
  audio: HTMLAudioElement | null,
  reason: PlaybackState['lastErrorReason']
): void {
  if (audio) {
    audio.pause();
    audio.src = '';
  }
  _activeTrackReleaseId = null;
  clearPlaybackQueue();
  setState({
    activeTrackId: null,
    isPlaying: false,
    playbackStatus: 'error',
    lastErrorReason: reason,
    currentTime: 0,
    duration: 0,
    trackTitle: null,
    releaseTitle: null,
    artistName: null,
    artworkUrl: null,
    hasLyrics: false,
    bpm: null,
    musicalKey: null,
    ...getQueueSnapshot(),
  });
  notifyPlaybackError(reason);
}

async function loadAndPlayTrack(track: AudioTrackSource): Promise<void> {
  const audio = getAudio();
  if (!audio) return;

  if (!track.audioUrl) {
    handlePlaybackFailure(audio, 'missing_source');
    return;
  }

  const token = ++_playToken;
  _activeTrackIsrc = track.isrc ?? null;
  _activeTrackReleaseId = track.releaseId ?? null;
  _hasRetriedRefresh = false;
  audio.pause();
  audio.src = track.audioUrl;
  setState({
    activeTrackId: track.id,
    isPlaying: false,
    playbackStatus: 'loading',
    lastErrorReason: null,
    currentTime: 0,
    duration: 0,
    trackTitle: track.title,
    releaseTitle: track.releaseTitle ?? null,
    artistName: track.artistName ?? null,
    artworkUrl: track.artworkUrl ?? null,
    hasLyrics: Boolean(track.hasLyrics),
    bpm: track.bpm ?? null,
    musicalKey: track.musicalKey ?? null,
    ...getQueueSnapshot(),
  });

  try {
    await audio.play();
  } catch (error) {
    if (_playToken === token) {
      handlePlaybackFailure(audio, 'play_rejected');
    }
    throw error;
  }

  if (_playToken !== token) {
    return;
  }
}

async function advanceQueueToIndex(index: number): Promise<void> {
  const track = getQueueTrackAt(index);
  if (!track) return;

  _queueIndex = index;
  await loadAndPlayTrack(track);
}

function bindAudioEvents(el: HTMLAudioElement): void {
  // -Infinity (not 0): performance.now() is clocked from process start, so a
  // timeupdate within the first PROGRESS_NOTIFY_MS of uptime would otherwise
  // be swallowed by the throttle.
  let lastNotifiedAt = -Infinity;
  el.addEventListener('timeupdate', () => {
    // ~4 Hz keeps cross-surface scrub bars smooth without rAF thrash.
    const now =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - lastNotifiedAt < PROGRESS_NOTIFY_MS) return;
    lastNotifiedAt = now;
    setState({
      currentTime: el.currentTime,
      duration: Number.isFinite(el.duration) ? el.duration : 0,
    });
  });

  el.addEventListener('play', () =>
    setState({
      isPlaying: true,
      playbackStatus: 'playing',
      lastErrorReason: null,
    })
  );
  el.addEventListener('pause', () =>
    setState({
      isPlaying: false,
      // A pause() queued inside handlePlaybackFailure lands here after the
      // error state is set and must not downgrade it to 'idle'.
      playbackStatus: state.activeTrackId
        ? 'paused'
        : state.playbackStatus === 'error'
          ? 'error'
          : 'idle',
    })
  );
  el.addEventListener('ended', () => {
    const nextIndex = _queueIndex + 1;
    const nextTrack = getQueueTrackAt(nextIndex);
    if (nextTrack) {
      void advanceQueueToIndex(nextIndex);
      return;
    }

    setState({
      isPlaying: false,
      playbackStatus: 'paused',
      currentTime: 0,
      ...getQueueSnapshot(),
    });
  });
  el.addEventListener('loadedmetadata', () => {
    setState({
      duration: Number.isFinite(el.duration) ? el.duration : 0,
    });
  });
  el.addEventListener('seeked', () => {
    lastNotifiedAt = -Infinity; // invalidate throttle so next timeupdate fires
    setState({
      currentTime: el.currentTime,
      duration: Number.isFinite(el.duration) ? el.duration : 0,
    });
  });
  el.addEventListener('error', () => {
    // Only handle errors while a track is loaded — the element can fire
    // stale error events after src is cleared.
    if (!state.activeTrackId) return;

    // Only network errors (code 2, e.g. expired Deezer token) justify a
    // preview URL refresh; decode/source errors won't be fixed by one.
    // Numeric literal because MediaError is unavailable in jsdom.
    const MEDIA_ERR_NETWORK = 2;
    const isNetworkError = el.error?.code === MEDIA_ERR_NETWORK;

    if (isNetworkError && _activeTrackIsrc && !_hasRetriedRefresh) {
      _hasRetriedRefresh = true;
      const trackIdAtError = state.activeTrackId;
      fetch(
        `/api/preview-url/refresh?isrc=${encodeURIComponent(_activeTrackIsrc)}`
      )
        .then(res => (res.ok ? res.json() : null))
        .then(
          (
            data: { previewUrl: string | null; source: string | null } | null
          ) => {
            // Only act if the same track still owns the audio element.
            if (state.activeTrackId !== trackIdAtError) return;

            if (data?.previewUrl) {
              el.src = data.previewUrl;
              el.play().catch(() => {
                handlePlaybackFailure(el, 'media_error');
              });
            } else {
              handlePlaybackFailure(el, 'media_error');
            }
          }
        )
        .catch(() => {
          // Only fail if the errored track is still active
          if (state.activeTrackId === trackIdAtError) {
            handlePlaybackFailure(el, 'media_error');
          }
        });
      return;
    }

    handlePlaybackFailure(el, 'media_error');
  });
}

/** Nested-safe pause for dictation / local preview. Default: no auto-resume. */
export function pausePlaybackForInterruption(): void {
  const audio = getAudio();
  if (_interruptionDepth === 0) {
    _wasPlayingBeforeInterruption = Boolean(
      audio && !audio.paused && state.isPlaying
    );
  }
  _interruptionDepth += 1;
  if (audio && !audio.paused) {
    audio.pause();
  }
}

/** Release interruption hold. Pass `{ resume: true }` to resume prior track. */
export function resumePlaybackAfterInterruption(
  options: { readonly resume?: boolean } = {}
): void {
  if (_interruptionDepth === 0) return;
  _interruptionDepth -= 1;
  if (_interruptionDepth > 0) return;

  const shouldResume = Boolean(options.resume) && _wasPlayingBeforeInterruption;
  _wasPlayingBeforeInterruption = false;
  if (!shouldResume) return;

  const audio = getAudio();
  if (!audio || !state.activeTrackId) return;
  void audio.play().catch(() => {
    handlePlaybackFailure(audio, 'play_rejected');
  });
}

/**
 * Refresh now-playing metadata when a mutation updates the active track's
 * release. Only display fields change — source, position, and queue are
 * untouched, so playback never resets. (Source swap: JOV-3689.)
 */
export function updateNowPlayingForRelease(release: {
  readonly id: string;
  readonly title: string;
  readonly artworkUrl?: string | null;
  readonly artistNames?: readonly string[];
  readonly lyrics?: string;
}): void {
  if (!state.activeTrackId) return;
  const isActiveRelease =
    state.activeTrackId === release.id || _activeTrackReleaseId === release.id;
  if (!isActiveRelease) return;

  setState({
    // Release-level previews use the release id as the track id — only they
    // adopt the release title as their label.
    trackTitle:
      state.activeTrackId === release.id ? release.title : state.trackTitle,
    releaseTitle: release.title,
    artistName: release.artistNames?.[0] ?? state.artistName,
    artworkUrl: release.artworkUrl ?? state.artworkUrl,
    hasLyrics:
      release.lyrics !== undefined
        ? Boolean(release.lyrics.trim())
        : state.hasLyrics,
  });
}

export function useTrackAudioPlayer() {
  const [playbackState, setPlaybackState] = useState<PlaybackState>(state);

  useEffect(() => {
    const listener = () => setPlaybackState(state);
    listeners.add(listener);
    setPlaybackState(state);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const toggleTrack = useCallback(
    async (track: AudioTrackSource, options?: ToggleTrackOptions) => {
      const audio = getAudio();
      if (!audio) return;

      // Intentional play clears any dictation/local-preview interruption hold.
      if (_interruptionDepth > 0) {
        _interruptionDepth = 0;
        _wasPlayingBeforeInterruption = false;
      }

      // Same track — toggle pause/resume
      if (state.activeTrackId === track.id) {
        if (audio.paused) {
          try {
            await audio.play();
          } catch (error) {
            handlePlaybackFailure(audio, 'play_rejected');
            throw error;
          }
        } else {
          audio.pause();
        }
        return;
      }

      if (options?.queue) {
        setPlaybackQueue(options.queue, track.id);
      } else {
        clearPlaybackQueue();
      }

      await loadAndPlayTrack(track);
    },
    []
  );

  const playNext = useCallback(async () => {
    if (!state.hasNext) return;
    await advanceQueueToIndex(_queueIndex + 1);
  }, []);

  const playPrevious = useCallback(async () => {
    if (!state.hasPrevious) return;
    await advanceQueueToIndex(_queueIndex - 1);
  }, []);

  const seek = useCallback((time: number) => {
    seekToTime(time);
  }, []);

  const stop = useCallback(() => {
    // Invalidate any in-flight play() from earlier toggleTrack calls
    _playToken += 1;
    _interruptionDepth = 0;
    _wasPlayingBeforeInterruption = false;
    const audio = getAudio();
    if (audio) {
      audio.pause();
      audio.src = '';
    }
    _activeTrackReleaseId = null;
    clearPlaybackQueue();
    setState({
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
      ...getQueueSnapshot(),
    });
  }, []);

  const onError = useCallback(
    (cb: (reason: PlaybackState['lastErrorReason']) => void) => {
      errorListeners.add(cb);
      return () => {
        errorListeners.delete(cb);
      };
    },
    []
  );

  return {
    playbackState,
    toggleTrack,
    playNext,
    playPrevious,
    seek,
    stop,
    onError,
    pauseForInterruption: pausePlaybackForInterruption,
    resumeAfterInterruption: resumePlaybackAfterInterruption,
  };
}
