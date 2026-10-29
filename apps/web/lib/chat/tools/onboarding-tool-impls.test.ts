import type { UIMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { normalizeArtistMetrics } from '@/lib/onboarding/canonical-metrics';
import {
  advanceOnboardingProfileDraft,
  emptyOnboardingProfileDraft,
} from '@/lib/onboarding/profile-draft';
import { getSpotifyArtist } from '@/lib/spotify';
import {
  buildConfirmSpotifyArtistOutput,
  buildOnboardingTools,
  createOnboardingTurnState,
  deriveOnboardingTurnStateFromMessages,
} from './onboarding-tool-impls';

vi.mock('server-only', () => ({}));
const catalogMocks = vi.hoisted(() => ({
  fetchPreview: vi.fn().mockResolvedValue(null),
  recordFunnelStep: vi.fn().mockResolvedValue(undefined),
  recordStage: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/lib/onboarding/catalog-preview.server', () => ({
  fetchOnboardingCatalogPreview: catalogMocks.fetchPreview,
}));
vi.mock('@/lib/analytics/signup-funnel.server', () => ({
  recordFunnelStep: catalogMocks.recordFunnelStep,
}));
vi.mock('@/lib/acquisition/artist-offer-funnel.server', () => ({
  recordArtistOfferStage: catalogMocks.recordStage,
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));
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

describe('golden-path admission gates publishing, not paying', () => {
  it('still offers checkout after an admit that requires proof', async () => {
    const lowFollowerMetrics = normalizeArtistMetrics(
      { spotifyFollowers: 3_200 },
      { source: 'spotify_api', updatedAt: '2026-07-01T00:00:00.000Z' }
    );
    const state = createOnboardingTurnState({
      sessionId: 'session-golden',
      turnCount: 1,
      accessControlled: true,
      goldenPathVerdict: 'ELIGIBLE',
      messages: [
        {
          ...assistantMessage,
          parts: [
            {
              type: 'dynamic-tool',
              toolName: 'confirmSpotifyArtist',
              toolCallId: 'tool-confirm-low',
              state: 'output-available',
              input: { spotifyArtistId: '4Uwpa6zW3zzCSQvooQNksm' },
              output: {
                action: 'spotify_artist_confirmed',
                spotifyArtistId: '4Uwpa6zW3zzCSQvooQNksm',
                metrics: lowFollowerMetrics,
                artist: {
                  id: '4Uwpa6zW3zzCSQvooQNksm',
                  name: 'Mid Artist',
                  imageUrl: null,
                  followers: 3_200,
                  metrics: lowFollowerMetrics,
                  popularity: 30,
                  genres: [],
                },
              },
            },
          ],
        } as UIMessage,
      ],
    });
    const tools = buildOnboardingTools(state);
    const next = (await (
      tools.proposeNextStep as unknown as {
        execute: () => Promise<{
          decision: { kind: string; proofRequired?: boolean };
        }>;
      }
    ).execute()) as { decision: { kind: string; proofRequired?: boolean } };
    expect(next.decision).toMatchObject({
      kind: 'instant_access',
      proofRequired: true,
    });

    const checkout = await (
      tools.proposeCheckout as unknown as {
        execute: (input: { plan?: string }) => Promise<{ action: string }>;
      }
    ).execute({});
    // Paying never publishes a page; proof does. Checkout stays available.
    expect(checkout.action).toBe('propose_checkout');
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

describe('adaptive job access and current offer', () => {
  it('does not reuse music qualification for a founder job or an unresolved priority', async () => {
    const state = createOnboardingTurnState({
      sessionId: 'multiple-jobs',
      turnCount: 3,
      messages: [assistantMessage],
    });
    state.profileDraft = advanceOnboardingProfileDraft(
      emptyOnboardingProfileDraft(),
      {
        id: 'founder',
        text: 'I am a founder https://company.example I want buyer contact',
      }
    );
    const tools = buildOnboardingTools(state);
    await expect(
      tools.proposeNextStep.execute?.({}, {} as never)
    ).resolves.toMatchObject({ decision: { kind: 'waitlist' } });
    await expect(
      tools.proposeCheckout.execute?.({ plan: 'free' }, {} as never)
    ).resolves.toMatchObject({ action: 'checkout_unavailable' });
    state.profileDraft = advanceOnboardingProfileDraft(state.profileDraft, {
      id: 'role-conflict',
      text: 'I am also a musician',
    });
    await expect(
      tools.proposeNextStep.execute?.({}, {} as never)
    ).resolves.toMatchObject({
      decision: {
        kind: 'needs_more_info',
        rationale: 'role_priority_required',
      },
    });
  });

  it.each(['free', 'pro'] as const)(
    'rejects Max and permits self-service %s for a qualified artist',
    async plan => {
      const state = createOnboardingTurnState({
        sessionId: 'artist-offer',
        turnCount: 3,
        messages: [assistantMessage],
      });
      const tools = buildOnboardingTools(state);
      await expect(
        tools.proposeCheckout.execute?.({ plan: 'max' }, {} as never)
      ).resolves.toMatchObject({ action: 'checkout_unavailable' });
      await expect(
        tools.proposeCheckout.execute?.({ plan }, {} as never)
      ).resolves.toMatchObject({ action: 'propose_checkout', plan });
    }
  );
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

  it('carries the real catalog into the preview and records the funnel step (JOV-9758)', async () => {
    vi.mocked(getSpotifyArtist).mockResolvedValueOnce(artist);
    const catalog = {
      total: 24,
      releases: [
        {
          id: 'album1',
          title: 'Latest single',
          releaseType: 'single' as const,
          releaseDate: '2026-08-14',
          artworkUrl: 'https://i.scdn.co/image/album1',
          spotifyUrl: 'https://open.spotify.com/album/album1',
        },
      ],
    };
    catalogMocks.fetchPreview.mockResolvedValueOnce(catalog);
    const state = createOnboardingTurnState({
      sessionId: 'catalog-fixture',
      turnCount: 1,
    });
    const output = await buildConfirmSpotifyArtistOutput(id, state);
    expect(catalogMocks.fetchPreview).toHaveBeenCalledWith(id);
    expect(output.catalog).toEqual(catalog);
    expect(state.catalogPreview).toEqual(catalog);
    await vi.waitFor(() =>
      expect(catalogMocks.recordFunnelStep).toHaveBeenCalledWith({
        funnel: 'artist_signup',
        step: 'catalog_preview',
        surface: 'onboarding',
      })
    );

    // A later turn rehydrates the catalog from history without refetching.
    const rehydrated = createOnboardingTurnState({
      sessionId: 'catalog-fixture',
      turnCount: 2,
      messages: [
        {
          id: 'assistant-catalog',
          role: 'assistant',
          parts: [
            {
              type: 'dynamic-tool',
              toolName: 'confirmSpotifyArtist',
              toolCallId: 'tool-confirm-catalog',
              state: 'output-available',
              input: { spotifyArtistId: id },
              output,
            },
          ],
        },
      ],
    });
    expect(rehydrated.catalogPreview).toEqual(catalog);
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
