import type { UIMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import {
  createOnboardingTurnState,
  deriveOnboardingTurnStateFromMessages,
} from './onboarding-tool-impls';

vi.mock('server-only', () => ({}));

const assistantMessage = {
  id: 'assistant-1',
  role: 'assistant',
  parts: [
    {
      type: 'dynamic-tool',
      toolName: 'confirmSpotifyArtist',
      toolCallId: 'tool-confirm',
      state: 'output-available',
      input: { spotifyArtistId: '1Cs0zKBU1kc0i8ypK3B9ai' },
      output: {
        action: 'spotify_artist_confirmed',
        spotifyArtistId: '1Cs0zKBU1kc0i8ypK3B9ai',
        artist: {
          id: '1Cs0zKBU1kc0i8ypK3B9ai',
          name: 'David Guetta',
          imageUrl: 'https://i.scdn.co/image/david.jpg',
          followers: 28_000_000,
          popularity: 84,
          genres: ['edm'],
        },
      },
    },
    {
      type: 'dynamic-tool',
      toolName: 'recordInterviewSignal',
      toolCallId: 'tool-signal',
      state: 'output-available',
      input: { audienceBand: 'over_500k' },
      output: { action: 'signal_recorded', signalCount: 1 },
    },
  ],
} satisfies UIMessage;

describe('onboarding tool state rehydration', () => {
  it('restores selected Spotify artist and interview signal from prior tool parts', () => {
    const state = createOnboardingTurnState({
      sessionId: 'session-1',
      turnCount: 2,
      messages: [assistantMessage],
    });

    expect(state.spotifyArtistId).toBe('1Cs0zKBU1kc0i8ypK3B9ai');
    expect(state.spotifyArtistName).toBe('David Guetta');
    expect(state.spotifyFollowers).toBe(28_000_000);
    expect(state.spotifyPopularity).toBe(84);
    expect(state.spotifyGenres).toEqual(['edm']);
    expect(state.signals).toEqual([{ audienceBand: 'over_500k' }]);
  });

  it('can hydrate an existing accumulator before the current tool turn appends more signal', () => {
    const state = createOnboardingTurnState({
      sessionId: 'session-1',
      turnCount: 3,
    });

    deriveOnboardingTurnStateFromMessages(state, [assistantMessage]);
    state.signals.push({ releaseStage: 'ongoing_rollout' });

    expect(state.signals).toEqual([
      { audienceBand: 'over_500k' },
      { releaseStage: 'ongoing_rollout' },
    ]);
  });
});
