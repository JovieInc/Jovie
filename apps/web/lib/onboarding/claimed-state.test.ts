import { describe, expect, it } from 'vitest';
import type { PersistedToolEvent } from '@/lib/chat/tool-events';
import {
  deriveClaimedOnboardingStateFromMessageRows,
  deriveClaimedOnboardingStateFromToolEvents,
} from './claimed-state';

function event(
  toolName: string,
  output: Record<string, unknown>,
  input?: Record<string, unknown>
): PersistedToolEvent {
  return {
    schemaVersion: 2,
    toolCallId: `${toolName}-${Math.random().toString(36).slice(2)}`,
    toolName,
    state: 'succeeded',
    input,
    output,
    uiHint: 'artifact',
  };
}

describe('claimed onboarding state', () => {
  it('derives selected artist, handle, social links, and interview signals from tool events', () => {
    const state = deriveClaimedOnboardingStateFromToolEvents([
      event('confirmSpotifyArtist', {
        action: 'spotify_artist_confirmed',
        spotifyArtistId: '1Cs0zKBU1kc0i8ypK3B9ai',
        artist: {
          id: '1Cs0zKBU1kc0i8ypK3B9ai',
          name: 'David Guetta',
          url: 'https://open.spotify.com/artist/1Cs0zKBU1kc0i8ypK3B9ai',
          imageUrl: 'https://i.scdn.co/image/david.jpg',
          followers: 28_000_000,
          popularity: 84,
          genres: ['edm', 'pop dance'],
        },
      }),
      event('checkHandle', {
        action: 'check_handle',
        handle: '@davidguetta',
      }),
      event('proposeSocialLink', {
        action: 'propose_social_link',
        url: 'https://instagram.com/davidguetta',
      }),
      event(
        'recordInterviewSignal',
        { action: 'signal_recorded', signalCount: 1 },
        { audienceBand: 'over_500k', releaseStage: 'ongoing_rollout' }
      ),
    ]);

    expect(state.artist).toEqual(
      expect.objectContaining({
        id: '1Cs0zKBU1kc0i8ypK3B9ai',
        name: 'David Guetta',
        followers: 28_000_000,
        popularity: 84,
      })
    );
    expect(state.handle).toBe('davidguetta');
    expect(state.socialLinks).toEqual(['https://instagram.com/davidguetta']);
    expect(state.interviewSignals).toEqual([
      { audienceBand: 'over_500k', releaseStage: 'ongoing_rollout' },
    ]);
  });

  it('decodes persisted message rows and refuses invalid handles', () => {
    const rows = [
      {
        toolCalls: [
          event('checkHandle', {
            action: 'check_handle',
            handle: 'admin',
          }),
          event('recordInterviewSignal', {
            action: 'signal_recorded',
            signal: { currentTool: { name: 'Linktree' } },
          }),
        ],
      },
    ];

    const state = deriveClaimedOnboardingStateFromMessageRows(rows);

    expect(state.handle).toBeNull();
    expect(state.interviewSignals).toEqual([
      { currentTool: { name: 'Linktree' } },
    ]);
  });
});
