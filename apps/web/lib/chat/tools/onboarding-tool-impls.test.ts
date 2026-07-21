import type { UIMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { normalizeArtistMetrics } from '@/lib/onboarding/canonical-metrics';
import {
  createOnboardingTurnState,
  deriveOnboardingTurnStateFromMessages,
} from './onboarding-tool-impls';

vi.mock('server-only', () => ({}));

const confirmedMetrics = normalizeArtistMetrics(
  { spotifyFollowers: 28_000_000 },
  { source: 'spotify_api', updatedAt: '2026-07-01T00:00:00.000Z' }
);

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
        metrics: confirmedMetrics,
        artist: {
          id: '1Cs0zKBU1kc0i8ypK3B9ai',
          name: 'David Guetta',
          imageUrl: 'https://i.scdn.co/image/david.jpg',
          followers: 28_000_000,
          metrics: confirmedMetrics,
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
    expect(state.artistMetrics?.spotifyFollowers).toBe(28_000_000);
    expect(state.artistMetrics?.source).toBe('spotify_api');
    expect(state.spotifyPopularity).toBe(84);
    expect(state.spotifyGenres).toEqual(['edm']);
    expect(state.signals).toEqual([{ audienceBand: 'over_500k' }]);
  });

  it('does not rehydrate monthly listeners into spotifyFollowers', () => {
    const message = {
      id: 'assistant-2',
      role: 'assistant',
      parts: [
        {
          type: 'dynamic-tool',
          toolName: 'confirmSpotifyArtist',
          toolCallId: 'tool-confirm-2',
          state: 'output-available',
          input: { spotifyArtistId: 'abc' },
          output: {
            action: 'spotify_artist_confirmed',
            spotifyArtistId: 'abc',
            artist: {
              id: 'abc',
              name: 'Test',
              monthlyListeners: 900_000,
            },
          },
        },
      ],
    } satisfies UIMessage;

    const state = createOnboardingTurnState({
      sessionId: 'session-2',
      turnCount: 1,
      messages: [message],
    });

    expect(state.spotifyFollowers).toBeNull();
    expect(state.artistMetrics?.monthlyListeners).toBe(900_000);
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
