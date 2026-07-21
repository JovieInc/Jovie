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
