import type { UIMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { normalizeArtistMetrics } from '@/lib/onboarding/canonical-metrics';
import { getSpotifyArtist } from '@/lib/spotify';
import {
  buildConfirmSpotifyArtistOutput,
  buildOnboardingTools,
  createOnboardingTurnState,
  deriveOnboardingTurnStateFromMessages,
} from './onboarding-tool-impls';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/spotify', () => ({
  getSpotifyArtist: vi.fn(),
  buildSpotifyArtistUrl: (id: string) =>
    `https://open.spotify.com/artist/${id}`,
}));

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
  it('restores the first public profile link so non-artists can reserve (JOV-3379)', () => {
    const state = createOnboardingTurnState({
      sessionId: 'session-social',
      turnCount: 2,
      accessControlled: true,
      messages: [
        {
          id: 'assistant-social',
          role: 'assistant',
          parts: [
            {
              type: 'dynamic-tool',
              toolName: 'proposeSocialLink',
              toolCallId: 'tool-social',
              state: 'output-available',
              input: { url: 'https://averychen.design' },
              output: {
                action: 'propose_social_link',
                url: 'https://averychen.design',
              },
            },
          ],
        } satisfies UIMessage,
      ],
    });

    expect(state.spotifyArtistId).toBeNull();
    expect(state.publicProfileUrl).toBe('https://averychen.design');
  });

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

describe('proposeNextStep controlled access', () => {
  it('keeps collecting information until a confirmed artist can be persisted', async () => {
    const tools = buildOnboardingTools(
      createOnboardingTurnState({
        sessionId: 'session-controlled-empty',
        turnCount: 3,
        accessControlled: true,
      })
    );
    const proposeNextStep = tools.proposeNextStep as unknown as {
      execute: () => Promise<{ decision: { kind: string; rationale: string } }>;
    };

    const result = await proposeNextStep.execute();

    expect(result.decision).toMatchObject({
      kind: 'needs_more_info',
      rationale: 'public_profile_required_for_waitlist',
    });
  });

  it('waitlists every anonymous visitor while the access gate is enabled', async () => {
    const tools = buildOnboardingTools(
      createOnboardingTurnState({
        sessionId: 'session-controlled',
        turnCount: 3,
        accessControlled: true,
        messages: [assistantMessage],
      })
    );
    const proposeNextStep = tools.proposeNextStep as unknown as {
      execute: () => Promise<{ decision: { kind: string; rationale: string } }>;
    };

    const result = await proposeNextStep.execute();

    expect(result.decision).toMatchObject({
      kind: 'waitlist',
      rationale: 'controlled_access_gate_enabled',
    });
  });
});

describe('confirmSpotifyArtist tool (JOV-7134)', () => {
  it('never lets the model confirm or swap an artist id', async () => {
    const state = createOnboardingTurnState({ sessionId: 's', turnCount: 3 });
    const tools = buildOnboardingTools(state);
    const run = (id: string) =>
      tools.confirmSpotifyArtist.execute?.(
        { spotifyArtistId: id },
        {} as never
      );

    await expect(run('invented-id')).resolves.toMatchObject({
      action: 'spotify_artist_unconfirmed',
    });
    expect(state.spotifyArtistId).toBeNull();

    deriveOnboardingTurnStateFromMessages(state, [assistantMessage]);
    await expect(run('0000000000000000000000')).resolves.toMatchObject({
      action: 'spotify_artist_confirmed',
      spotifyArtistId: '1Cs0zKBU1kc0i8ypK3B9ai',
      artist: { name: 'David Guetta', followers: 28_000_000 },
    });
    expect(state.spotifyArtistId).toBe('1Cs0zKBU1kc0i8ypK3B9ai');
  });
});

describe('confirmed artist field provenance', () => {
  const id = '1Cs0zKBU1kc0i8ypK3B9ai';
  const artist = {
    id,
    name: 'David Guetta',
    followers: { total: 28_000_000 },
    images: [{ url: 'https://i.scdn.co/image/david.jpg', height: 0, width: 0 }],
    popularity: 84,
    genres: ['edm'],
  };

  it('exposes actual server API fixture facts in the structured tool result', async () => {
    vi.mocked(getSpotifyArtist).mockResolvedValueOnce(artist);
    const state = createOnboardingTurnState({
      sessionId: 'source-fixture',
      turnCount: 1,
    });
    const output = await buildConfirmSpotifyArtistOutput(id, state);
    expect(output.subjectId).toBe(`spotify:artist:${id}`);
    expect(output.enrichedFacts[0]).toMatchObject({
      predicate: 'spotify.followers',
      value: { type: 'number', value: 28_000_000 },
      verification: 'verified',
      permission: 'public',
    });
    expect(output.enrichedFacts[0].sourceRefs[0]).toMatchObject({
      kind: 'direct',
      provider: 'spotify',
      originUrl: `https://open.spotify.com/artist/${id}`,
      fetchedAt: output.metrics?.updatedAt,
    });
    expect(state.artistMetrics).toEqual(output.metrics);
  });

  it('rejects wrong-identity API data before it can contaminate the accumulator', async () => {
    vi.mocked(getSpotifyArtist).mockResolvedValueOnce({
      ...artist,
      id: '4Uwpa6zW3zzCSQvooQNksm',
    });
    const state = createOnboardingTurnState({
      sessionId: 'wrong-source',
      turnCount: 1,
    });
    const output = await buildConfirmSpotifyArtistOutput(id, state);
    expect(output).toMatchObject({
      artist: null,
      metrics: null,
      enrichedFacts: [],
    });
    expect(state.spotifyArtistName).toBeNull();
    expect(state.spotifyFollowers).toBeNull();
  });

  it('retains truthful unavailable output on absent or failing providers', async () => {
    for (const failure of [false, true]) {
      if (failure)
        vi.mocked(getSpotifyArtist).mockRejectedValueOnce(
          new Error('fixture unavailable')
        );
      else vi.mocked(getSpotifyArtist).mockResolvedValueOnce(null);
      const output = await buildConfirmSpotifyArtistOutput(
        id,
        createOnboardingTurnState({ sessionId: 'missing-source', turnCount: 1 })
      );
      expect(output).toMatchObject({
        artist: null,
        metrics: null,
        enrichedFacts: [],
        subjectId: `spotify:artist:${id}`,
      });
    }
  });

  it('echoes returning-session retrieval date and exact identity without a new provider lookup', async () => {
    const state = createOnboardingTurnState({
      sessionId: 'returning-source',
      turnCount: 2,
      messages: [assistantMessage],
    });
    const callsBefore = vi.mocked(getSpotifyArtist).mock.calls.length;
    const output = await buildOnboardingTools(
      state
    ).confirmSpotifyArtist.execute?.(
      { spotifyArtistId: 'invented-id' },
      {} as never
    );
    expect(output).toMatchObject({
      subjectId: `spotify:artist:${id}`,
      enrichedFacts: [
        {
          status: 'stale',
          verification: 'unverified',
          sourceRefs: [{ fetchedAt: confirmedMetrics.updatedAt }],
        },
      ],
    });
    expect(vi.mocked(getSpotifyArtist).mock.calls.length).toBe(callsBefore);
  });
});
