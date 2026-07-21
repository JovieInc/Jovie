'use client';

import {
  type AudioPlaybackEvent,
  type AudioPlaybackStatus,
  getNextAudioPlaybackStatus,
} from '@jovie/audio-contracts';
import { useCallback, useEffect, useState } from 'react';
import {
  type InteractionLatencyMarkHandle,
  markInteractionStart,
  measureInteractionPoint,
} from '@/lib/monitoring/interaction-latency';

export interface AudioTrackSource {
  readonly id: string;
  readonly title: string;
  /** Required when loading a new track; omit when resuming the same track. */
  readonly audioUrl?: string;
  /** ISRC code for the track — used to fetch a fresh preview URL if the stored one expires. */
  readonly isrc?: string | null;
  readonly releaseTitle?: string;
  readonly artistName?: string;
  readonly artworkUrl?: string | null;
  readonly hasLyrics?: boolean;
}

export interface ToggleTrackOptions {
  /** Ordered playable context for next/previous transport in the shell player. */
  readonly queue?: readonly AudioTrackSource[];
}

export interface PlaybackState {
  readonly activeTrackId: string | null;
  readonly isPlaying: boolean;
  readonly playbackStatus: AudioPlaybackStatus;
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
  readonly queueLength: number;
  readonly queueIndex: number;
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
}

let _audio: HTMLAudioElement | null = null;
/** Monotonically increasing token — guards against stale play() promises from prior track switches. */
let _playToken = 0;
/** ISRC of the currently active track — used for preview URL refresh on expiration. */
let _activeTrackIsrc: string | null = null;
/** Whether we already attempted a preview URL refresh for this track. Prevents infinite retry loops. */
let _hasRetriedRefresh = false;
let _queue: readonly AudioTrackSource[] = [];
let _queueIndex = -1;
/** Nested audio-focus holds (dictation / local preview). Resume is opt-in. */
let _interruptionDepth = 0;
let _wasPlayingBeforeInterruption = false;
let _mediaSessionBound = false;
let _playLatencyMark: InteractionLatencyMarkHandle | null = null;
let _seekLatencyMark: InteractionLatencyMarkHandle | null = null;
let _bufferingLatencyMark: InteractionLatencyMarkHandle | null = null;
/** ~4 Hz progress notify for cross-surface scrub without rAF thrash. */
const PROGRESS_NOTIFY_MS = 250;

function createAudioElement(): HTMLAudioElement {
  const audio = new Audio();
  audio.preload = 'metadata';
  bindAudioEvents(audio);
  return audio;
}

/** Lazily create the Audio element — safe to call during SSR (returns null server-side). */
function getAudio(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  if (!_audio) {
    _audio = createAudioElement();
  }
  return _audio;
}

function replaceAudioElement(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  _seekLatencyMark = finishLatencyMark(_seekLatencyMark, 'superseded');
  _bufferingLatencyMark = finishLatencyMark(
    _bufferingLatencyMark,
    'superseded'
  );
  const previousAudio = _audio;
  const nextAudio = createAudioElement();
  _audio = nextAudio;
  if (previousAudio) {
    previousAudio.pause();
    previousAudio.src = '';
  }
  return nextAudio;
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
    prev.currentTime !== state.currentTime ||
    prev.duration !== state.duration
  ) {
    syncMediaSession();
  }
}

function getTransitionStatus(
  event: AudioPlaybackEvent,
  audio: HTMLAudioElement | null
): AudioPlaybackStatus {
  return getNextAudioPlaybackStatus({
    current: state.playbackStatus,
    event,
    hasActiveTrack: state.activeTrackId !== null,
    isPaused: audio?.paused ?? true,
  });
}

function finishLatencyMark(
  mark: InteractionLatencyMarkHandle | null,
  point: string
): null {
  const measureName = measureInteractionPoint(mark, point);
  if (
    mark &&
    typeof performance !== 'undefined' &&
    typeof performance.clearMarks === 'function'
  ) {
    performance.clearMarks(mark.startMark);
    performance.clearMarks(`${mark.id}:${point}`);
  }
  if (
    measureName &&
    typeof performance !== 'undefined' &&
    typeof performance.clearMeasures === 'function'
  ) {
    performance.clearMeasures(measureName);
  }
  return null;
}

function startLatencyMark(
  name: string,
  previousMark: InteractionLatencyMarkHandle | null
): InteractionLatencyMarkHandle | null {
  finishLatencyMark(previousMark, 'superseded');
  return markInteractionStart(name);
}

function isCurrentPlaybackRequest(
  audio: HTMLAudioElement,
  token: number,
  trackId: string
): boolean {
  return (
    _audio === audio && _playToken === token && state.activeTrackId === trackId
  );
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
      const trackId = state.activeTrackId;
      const token = ++_playToken;
      _playLatencyMark = startLatencyMark('audio-play', _playLatencyMark);
      void audio.play().catch(() => {
        if (isCurrentPlaybackRequest(audio, token, trackId)) {
          handlePlaybackFailure(audio, 'play_rejected');
        }
      });
    });
    session.setActionHandler('pause', () => {
      _playToken += 1;
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
    try {
      session.setPositionState?.();
    } catch {
      // Some partial Media Session implementations reject clearing state.
    }
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
    } else if (typeof session.setPositionState === 'function') {
      session.setPositionState();
    }
  } catch {
    // setPositionState throws when position > duration during short previews.
  }
}

function seekToTime(time: number): void {
  const audio = getAudio();
  if (!audio || !Number.isFinite(time)) return;
  if (!Number.isFinite(audio.duration) || audio.duration === 0) return;
  _seekLatencyMark = startLatencyMark('audio-seek', _seekLatencyMark);
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
  _playToken += 1;
  if (_audio === audio) {
    _audio = null;
  }
  if (audio) {
    audio.pause();
    audio.src = '';
  }
  _activeTrackIsrc = null;
  _hasRetriedRefresh = false;
  _playLatencyMark = finishLatencyMark(_playLatencyMark, 'failed');
  _seekLatencyMark = finishLatencyMark(_seekLatencyMark, 'failed');
  _bufferingLatencyMark = finishLatencyMark(_bufferingLatencyMark, 'failed');
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
    ...getQueueSnapshot(),
  });
  notifyPlaybackError(reason);
}

async function loadAndPlayTrack(track: AudioTrackSource): Promise<void> {
  const audio =
    state.activeTrackId && state.activeTrackId !== track.id
      ? replaceAudioElement()
      : getAudio();
  if (!audio) return;

  if (!track.audioUrl) {
    handlePlaybackFailure(audio, 'missing_source');
    return;
  }

  const token = ++_playToken;
  _activeTrackIsrc = track.isrc ?? null;
  _hasRetriedRefresh = false;
  audio.pause();
  audio.src = track.audioUrl;
  _playLatencyMark = startLatencyMark('audio-play', _playLatencyMark);
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
    ...getQueueSnapshot(),
  });

  try {
    await audio.play();
  } catch (error) {
    if (isCurrentPlaybackRequest(audio, token, track.id)) {
      handlePlaybackFailure(audio, 'play_rejected');
    }
    throw error;
  }

  if (!isCurrentPlaybackRequest(audio, token, track.id)) {
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
  // -Infinity (not 0): with performance.now() clocked from process start, a
  // timeupdate fired within the first PROGRESS_NOTIFY_MS of uptime would be
  // swallowed by the throttle when initialized to 0, dropping the first
  // progress update (surfaced as a shard-order-dependent unit test flake).
  let lastNotifiedAt = -Infinity;
  const bindCurrentAudioEvent = (
    event: keyof HTMLMediaElementEventMap,
    handler: () => void
  ) => {
    el.addEventListener(event, () => {
      if (_audio !== el) return;
      handler();
    });
  };

  bindCurrentAudioEvent('timeupdate', () => {
    // ~4 Hz keeps cross-surface scrub bars smooth without rAF thrash.
    const now =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (lastNotifiedAt > 0 && now - lastNotifiedAt < PROGRESS_NOTIFY_MS) return;
    lastNotifiedAt = now;
    setState({
      currentTime: el.currentTime,
      duration: Number.isFinite(el.duration) ? el.duration : 0,
    });
  });

  bindCurrentAudioEvent('play', () => {
    if (_interruptionDepth > 0) return;
    setState({
      isPlaying: true,
      playbackStatus: getTransitionStatus('play', el),
      lastErrorReason: null,
    });
  });
  bindCurrentAudioEvent('playing', () => {
    if (_interruptionDepth > 0) return;
    _playLatencyMark = finishLatencyMark(_playLatencyMark, 'audible');
    _bufferingLatencyMark = finishLatencyMark(
      _bufferingLatencyMark,
      'recovered'
    );
    setState({
      isPlaying: true,
      playbackStatus: getTransitionStatus('playing', el),
      lastErrorReason: null,
    });
  });
  bindCurrentAudioEvent('pause', () =>
    setState({
      isPlaying: false,
      playbackStatus: getTransitionStatus('pause', el),
    })
  );
  bindCurrentAudioEvent('waiting', () => {
    if (_interruptionDepth > 0) return;
    _bufferingLatencyMark ??= markInteractionStart('audio-buffering');
    setState({ playbackStatus: getTransitionStatus('waiting', el) });
  });
  bindCurrentAudioEvent('canplay', () => {
    if (_interruptionDepth > 0) return;
    _bufferingLatencyMark = finishLatencyMark(
      _bufferingLatencyMark,
      'recovered'
    );
    setState({ playbackStatus: getTransitionStatus('canplay', el) });
  });
  bindCurrentAudioEvent('stalled', () => {
    if (_interruptionDepth > 0) return;
    _bufferingLatencyMark ??= markInteractionStart('audio-buffering');
    _bufferingLatencyMark = finishLatencyMark(_bufferingLatencyMark, 'stalled');
    _bufferingLatencyMark = markInteractionStart('audio-buffering');
    setState({ playbackStatus: getTransitionStatus('stalled', el) });
  });
  bindCurrentAudioEvent('ended', () => {
    if (_interruptionDepth > 0) return;
    const nextIndex = _queueIndex + 1;
    const nextTrack = getQueueTrackAt(nextIndex);
    if (nextTrack) {
      void advanceQueueToIndex(nextIndex);
      return;
    }

    setState({
      isPlaying: false,
      playbackStatus: getTransitionStatus('ended', el),
      currentTime: 0,
      ...getQueueSnapshot(),
    });
  });
  bindCurrentAudioEvent('loadedmetadata', () => {
    setState({
      duration: Number.isFinite(el.duration) ? el.duration : 0,
    });
  });
  bindCurrentAudioEvent('seeking', () => {
    if (_interruptionDepth > 0) return;
    _seekLatencyMark ??= markInteractionStart('audio-seek');
    setState({ playbackStatus: getTransitionStatus('seeking', el) });
  });
  bindCurrentAudioEvent('seeked', () => {
    if (_interruptionDepth > 0) return;
    lastNotifiedAt = -Infinity; // invalidate throttle so next timeupdate fires
    _seekLatencyMark = finishLatencyMark(_seekLatencyMark, 'settled');
    setState({
      playbackStatus: getTransitionStatus('seeked', el),
      currentTime: el.currentTime,
      duration: Number.isFinite(el.duration) ? el.duration : 0,
    });
  });
  bindCurrentAudioEvent('error', () => {
    // Guard: only handle errors when a track is actively loaded.
    // The audio element can fire stale error events (e.g., after tab
    // backgrounding/resuming) even when src is already cleared.
    if (!state.activeTrackId) return;

    // Only attempt a preview URL refresh for network errors (code 2),
    // which indicate an expired Deezer token (403). Decode errors (code 3)
    // and unsupported source errors (code 4) won't be fixed by a fresh URL.
    // Use numeric literal (2) instead of MediaError.MEDIA_ERR_NETWORK since
    // the MediaError global is unavailable in some test environments (jsdom).
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
            // Guard: only act if the same track is still active.
            // If the user switched tracks while the fetch was in-flight,
            // the new track owns the audio element. Do nothing.
            if (_audio !== el || state.activeTrackId !== trackIdAtError) return;

            if (data?.previewUrl) {
              const refreshedAudio = replaceAudioElement();
              if (!refreshedAudio) {
                handlePlaybackFailure(el, 'media_error');
                return;
              }
              refreshedAudio.src = data.previewUrl;
              const token = ++_playToken;
              _playLatencyMark = startLatencyMark(
                'audio-play',
                _playLatencyMark
              );
              refreshedAudio.play().catch(() => {
                if (
                  isCurrentPlaybackRequest(
                    refreshedAudio,
                    token,
                    trackIdAtError
                  )
                ) {
                  handlePlaybackFailure(refreshedAudio, 'media_error');
                }
              });
            } else {
              handlePlaybackFailure(el, 'media_error');
            }
          }
        )
        .catch(() => {
          // Only fail if the errored track is still active
          if (_audio === el && state.activeTrackId === trackIdAtError) {
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
  if (state.activeTrackId) {
    setState({
      playbackStatus: getTransitionStatus('interruption_start', audio),
    });
  }
  if (audio && !audio.paused) {
    _playToken += 1;
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
  const audio = getAudio();
  if (!shouldResume) {
    if (state.activeTrackId) {
      setState({
        playbackStatus: getTransitionStatus('interruption_end', audio),
      });
    }
    return;
  }

  if (!audio || !state.activeTrackId) return;
  const trackId = state.activeTrackId;
  const token = ++_playToken;
  _playLatencyMark = startLatencyMark('audio-play', _playLatencyMark);
  void audio.play().catch(() => {
    if (isCurrentPlaybackRequest(audio, token, trackId)) {
      handlePlaybackFailure(audio, 'play_rejected');
    }
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

      // Intentional play clears dictation/local-preview holds.
      if (_interruptionDepth > 0) {
        _interruptionDepth = 0;
        _wasPlayingBeforeInterruption = false;
      }

      // Same track — toggle pause/resume
      if (state.activeTrackId === track.id) {
        if (audio.paused) {
          const token = ++_playToken;
          _playLatencyMark = startLatencyMark('audio-play', _playLatencyMark);
          try {
            await audio.play();
          } catch (error) {
            if (isCurrentPlaybackRequest(audio, token, track.id)) {
              handlePlaybackFailure(audio, 'play_rejected');
            }
            throw error;
          }
        } else {
          _playToken += 1;
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
      _audio = null;
      audio.pause();
      audio.src = '';
    }
    _activeTrackIsrc = null;
    _hasRetriedRefresh = false;
    clearPlaybackQueue();
    _playLatencyMark = finishLatencyMark(_playLatencyMark, 'stopped');
    _seekLatencyMark = finishLatencyMark(_seekLatencyMark, 'stopped');
    _bufferingLatencyMark = finishLatencyMark(_bufferingLatencyMark, 'stopped');
    setState({
      activeTrackId: null,
      isPlaying: false,
      playbackStatus: getTransitionStatus('stop', audio),
      lastErrorReason: null,
      currentTime: 0,
      duration: 0,
      trackTitle: null,
      releaseTitle: null,
      artistName: null,
      artworkUrl: null,
      hasLyrics: false,
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
