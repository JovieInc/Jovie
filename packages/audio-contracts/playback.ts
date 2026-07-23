export const AUDIO_PLAYBACK_STATUSES = [
  'idle',
  'loading',
  'playing',
  'paused',
  'buffering',
  'seeking',
  'stalled',
  'interrupted',
  'ended',
  'error',
] as const;

export type AudioPlaybackStatus = (typeof AUDIO_PLAYBACK_STATUSES)[number];

export const AUDIO_PLAYBACK_EVENTS = [
  'load',
  'play',
  'playing',
  'pause',
  'waiting',
  'canplay',
  'seeking',
  'seeked',
  'stalled',
  'interruption_start',
  'interruption_end',
  'ended',
  'error',
  'stop',
] as const;

export type AudioPlaybackEvent = (typeof AUDIO_PLAYBACK_EVENTS)[number];

/** Canonical, value-free provenance for every source routed through playback. */
export const AUDIO_PLAYBACK_SOURCE_KINDS = [
  'catalog',
  'release-preview',
  'chat-upload-preview',
] as const;

export type AudioPlaybackSourceKind =
  (typeof AUDIO_PLAYBACK_SOURCE_KINDS)[number];

export const AUDIO_PREVIEW_SURFACE_REGISTRY = [
  { id: 'selectable', label: 'Preview in Player', pending: false },
  { id: 'loading', label: 'Loading in Player', pending: true },
  { id: 'buffering', label: 'Buffering in Player', pending: true },
  { id: 'seeking', label: 'Seeking in Player', pending: true },
  { id: 'playing', label: 'Playing in Player', pending: false },
  { id: 'paused', label: 'Paused in Player', pending: false },
] as const;

export type AudioPreviewSurfaceState =
  (typeof AUDIO_PREVIEW_SURFACE_REGISTRY)[number];

export interface AudioPreviewSurfaceInput {
  readonly candidateId: string;
  readonly candidateSourceKind: AudioPlaybackSourceKind;
  readonly activeTrackId: string | null;
  readonly activeSourceKind: AudioPlaybackSourceKind | null;
  readonly playbackStatus: AudioPlaybackStatus;
  readonly isPlaying: boolean;
}

export function getAudioPreviewSurfaceState({
  candidateId,
  candidateSourceKind,
  activeTrackId,
  activeSourceKind,
  playbackStatus,
  isPlaying,
}: AudioPreviewSurfaceInput): AudioPreviewSurfaceState {
  if (
    activeTrackId !== candidateId ||
    activeSourceKind !== candidateSourceKind
  ) {
    return AUDIO_PREVIEW_SURFACE_REGISTRY[0];
  }
  if (playbackStatus === 'loading') return AUDIO_PREVIEW_SURFACE_REGISTRY[1];
  if (playbackStatus === 'buffering' || playbackStatus === 'stalled') {
    return AUDIO_PREVIEW_SURFACE_REGISTRY[2];
  }
  if (playbackStatus === 'seeking') return AUDIO_PREVIEW_SURFACE_REGISTRY[3];
  return isPlaying
    ? AUDIO_PREVIEW_SURFACE_REGISTRY[4]
    : AUDIO_PREVIEW_SURFACE_REGISTRY[5];
}

export interface AudioPlaybackTransitionInput {
  readonly current: AudioPlaybackStatus;
  readonly event: AudioPlaybackEvent;
  readonly hasActiveTrack: boolean;
  readonly isPaused: boolean;
}

/** Pure transition contract shared by every playback surface and platform. */
export function getNextAudioPlaybackStatus({
  current,
  event,
  hasActiveTrack,
  isPaused,
}: AudioPlaybackTransitionInput): AudioPlaybackStatus {
  if (event === 'stop') return 'idle';
  if (event === 'error') return 'error';
  if (event === 'load') return 'loading';
  if (!hasActiveTrack) return 'idle';
  if (current === 'interrupted' && event !== 'interruption_end') {
    return event === 'ended' ? 'ended' : 'interrupted';
  }

  switch (event) {
    case 'play':
      return current === 'loading' ? 'loading' : 'playing';
    case 'playing':
      return 'playing';
    case 'pause':
      return 'paused';
    case 'waiting':
      return 'buffering';
    case 'canplay':
      return isPaused ? 'paused' : 'playing';
    case 'seeking':
      return 'seeking';
    case 'seeked':
      return isPaused ? 'paused' : 'playing';
    case 'stalled':
      return 'stalled';
    case 'interruption_start':
      return 'interrupted';
    case 'interruption_end':
      return isPaused ? 'paused' : 'playing';
    case 'ended':
      return 'ended';
    default:
      return current;
  }
}
