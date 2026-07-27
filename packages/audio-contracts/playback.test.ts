import { describe, expect, it } from 'vitest';
import {
  AUDIO_PLAYBACK_EVENTS,
  AUDIO_PLAYBACK_SOURCE_KINDS,
  AUDIO_PLAYBACK_STATUSES,
  AUDIO_PREVIEW_SURFACE_REGISTRY,
  type AudioPlaybackEvent,
  type AudioPlaybackStatus,
  getAudioPreviewSurfaceState,
  getNextAudioPlaybackStatus,
} from './playback';

function transition(
  current: AudioPlaybackStatus,
  event: AudioPlaybackEvent,
  options: { readonly active?: boolean; readonly paused?: boolean } = {}
) {
  return getNextAudioPlaybackStatus({
    current,
    event,
    hasActiveTrack: options.active ?? true,
    isPaused: options.paused ?? false,
  });
}

describe('audio playback transition registry', () => {
  it('keeps every status and event unique', () => {
    expect(new Set(AUDIO_PLAYBACK_STATUSES).size).toBe(
      AUDIO_PLAYBACK_STATUSES.length
    );
    expect(new Set(AUDIO_PLAYBACK_EVENTS).size).toBe(
      AUDIO_PLAYBACK_EVENTS.length
    );
    expect(AUDIO_PLAYBACK_SOURCE_KINDS).toEqual([
      'catalog',
      'release-preview',
      'chat-upload-preview',
    ]);
    expect(new Set(AUDIO_PLAYBACK_SOURCE_KINDS).size).toBe(
      AUDIO_PLAYBACK_SOURCE_KINDS.length
    );
    expect(AUDIO_PREVIEW_SURFACE_REGISTRY).toEqual([
      { id: 'selectable', label: 'Preview in Player', pending: false },
      { id: 'loading', label: 'Loading in Player', pending: true },
      { id: 'buffering', label: 'Buffering in Player', pending: true },
      { id: 'seeking', label: 'Seeking in Player', pending: true },
      { id: 'playing', label: 'Playing in Player', pending: false },
      { id: 'paused', label: 'Paused in Player', pending: false },
    ]);
  });

  it.each([
    ['loading', false, 'loading'],
    ['buffering', false, 'buffering'],
    ['stalled', false, 'buffering'],
    ['seeking', false, 'seeking'],
    ['paused', false, 'paused'],
    ['playing', true, 'playing'],
  ] as const)('maps active %s playback to the canonical preview surface', (playbackStatus, isPlaying, expected) => {
    expect(
      getAudioPreviewSurfaceState({
        candidateId: 'track-1',
        candidateSourceKind: 'release-preview',
        activeTrackId: 'track-1',
        activeSourceKind: 'release-preview',
        playbackStatus,
        isPlaying,
      }).id
    ).toBe(expected);
  });

  it('requires both source identity fields before exposing active status', () => {
    const base = {
      candidateId: 'track-1',
      candidateSourceKind: 'release-preview' as const,
      playbackStatus: 'playing' as const,
      isPlaying: true,
    };
    expect(
      getAudioPreviewSurfaceState({
        ...base,
        activeTrackId: 'track-2',
        activeSourceKind: 'release-preview',
      }).id
    ).toBe('selectable');
    expect(
      getAudioPreviewSurfaceState({
        ...base,
        activeTrackId: 'track-1',
        activeSourceKind: 'chat-upload-preview',
      }).id
    ).toBe('selectable');
  });

  it('handles terminal and source lifecycle events', () => {
    expect(transition('playing', 'stop')).toBe('idle');
    expect(transition('playing', 'error')).toBe('error');
    expect(transition('idle', 'load', { active: false })).toBe('loading');
    expect(transition('playing', 'playing', { active: false })).toBe('idle');
    expect(transition('playing', 'ended')).toBe('ended');
  });

  it('distinguishes intent, audible playback, buffering, and stalls', () => {
    expect(transition('loading', 'play')).toBe('loading');
    expect(transition('paused', 'play')).toBe('playing');
    expect(transition('loading', 'playing')).toBe('playing');
    expect(transition('playing', 'waiting')).toBe('buffering');
    expect(transition('buffering', 'stalled')).toBe('stalled');
    expect(transition('buffering', 'canplay')).toBe('playing');
    expect(transition('buffering', 'canplay', { paused: true })).toBe('paused');
  });

  it('preserves interruption semantics through pause and seek events', () => {
    expect(transition('playing', 'pause', { paused: true })).toBe('paused');
    expect(transition('playing', 'interruption_start')).toBe('interrupted');
    expect(transition('interrupted', 'pause', { paused: true })).toBe(
      'interrupted'
    );
    expect(transition('playing', 'seeking')).toBe('seeking');
    expect(transition('seeking', 'seeked')).toBe('playing');
    expect(transition('seeking', 'seeked', { paused: true })).toBe('paused');
    expect(transition('interrupted', 'seeked', { paused: true })).toBe(
      'interrupted'
    );
    expect(transition('interrupted', 'interruption_end')).toBe('playing');
    expect(
      transition('interrupted', 'interruption_end', { paused: true })
    ).toBe('paused');
    expect(
      transition('playing', 'unknown' as AudioPlaybackEvent, { paused: true })
    ).toBe('playing');
  });

  it('keeps interruption ownership across queued media lifecycle events', () => {
    for (const event of [
      'play',
      'playing',
      'pause',
      'waiting',
      'canplay',
      'seeking',
      'seeked',
      'stalled',
    ] as const) {
      expect(
        getNextAudioPlaybackStatus({
          current: 'interrupted',
          event,
          hasActiveTrack: true,
          isPaused: event !== 'playing',
        })
      ).toBe('interrupted');
    }

    expect(
      getNextAudioPlaybackStatus({
        current: 'interrupted',
        event: 'ended',
        hasActiveTrack: true,
        isPaused: true,
      })
    ).toBe('ended');
  });
});
