import { describe, expect, it, vi } from 'vitest';
import {
  ONBOARDING_CALIBRATION_EXAMPLES,
  ONBOARDING_OPENER_PRIMARY,
} from '@/lib/chat/prompts/onboarding';
import type {
  ConfirmSpotifyArtistOutput,
  OnboardingTurnState,
} from '@/lib/chat/tools/onboarding-tool-impls';
import {
  type ArtistMetricsSource,
  normalizeArtistMetrics,
} from '@/lib/onboarding/canonical-metrics';
import {
  buildSpotifyEnrichedFacts,
  spotifyEnrichmentSubjectId,
} from '@/lib/onboarding/enrichment-facts';
import type { EnrichedFact } from '@/lib/profile-facts/enrichment';
import { buildPostSelectionWritingBrief } from './post-selection-writing-brief';

vi.mock('server-only', () => ({}));

const ARTIST_ID = '4Uwpa6zW3zzCSQvooQNksm';
const NOW = '2026-10-15T12:00:00.000Z';

function fixture(
  followers: number | null = 1200,
  source: ArtistMetricsSource = 'spotify_api'
) {
  const metrics = normalizeArtistMetrics(
    { spotifyFollowers: followers },
    { source, updatedAt: NOW }
  );
  const selection: ConfirmSpotifyArtistOutput = {
    action: 'spotify_artist_confirmed',
    spotifyArtistId: ARTIST_ID,
    subjectId: spotifyEnrichmentSubjectId(ARTIST_ID),
    artist: {
      id: ARTIST_ID,
      name: 'Selected Artist',
      url: `https://open.spotify.com/artist/${ARTIST_ID}`,
      imageUrl: null,
      followers,
      popularity: 0,
      genres: [],
      metrics,
    },
    metrics,
    enrichedFacts: buildSpotifyEnrichedFacts(
      {
        spotifyArtistId: ARTIST_ID,
        returnedArtistId: ARTIST_ID,
        displayName: 'Selected Artist',
        metrics,
      },
      { now: NOW }
    ),
    summary: 'Selected Artist matched on Spotify.',
  };
  const state: OnboardingTurnState = {
    sessionId: 'private-session-id',
    accessControlled: true,
    spotifyArtistId: ARTIST_ID,
    spotifyArtistName: 'Selected Artist',
    spotifyImageUrl: null,
    spotifyGenres: [],
    spotifyPopularity: 0,
    spotifyFollowers: followers,
    artistMetrics: metrics,
    publicProfileUrl: null,
    signals: [{ freeNote: 'operator-only intake note' }],
    turnCount: 2,
  };
  return {
    selection,
    state,
    disclosureAuthority: 'public_enrichment_only' as const,
    now: NOW,
  };
}

function withFact(
  input: ReturnType<typeof fixture>,
  change: (fact: EnrichedFact) => EnrichedFact
) {
  return {
    ...input,
    selection: {
      ...input.selection,
      enrichedFacts: input.selection.enrichedFacts.map(change),
    },
  };
}

describe('post-selection writing brief', () => {
  it('binds the compact response to the current artist and inspectable evidence', () => {
    const result = buildPostSelectionWritingBrief(fixture());
    expect(result.status).toBe('available');
    if (result.status !== 'available') throw new Error('expected brief');
    expect(result.operatorContext).toMatchObject({
      surface: 'chat-persona',
      coverageContract: 'JOV-6475',
      accountableOwner: 'Summer',
    });
    const consumer = result.consumerContext;
    expect(consumer).toMatchObject({
      audience: 'onboarding_visitor_relationship_unverified',
      purpose: 'one_supported_observation_then_one_contextual_question',
      language: { tag: 'en', source: 'approved_onboarding_copy' },
      form: { maxSentences: 2, maxQuestions: 1 },
    });
    expect(consumer.allowedClaims).toEqual([
      {
        factId: consumer.evidence[0].id,
        subjectId: `spotify:artist:${ARTIST_ID}`,
        predicate: 'spotify.followers',
        value: 1200,
        unit: 'followers',
        verification: 'verified',
        evidenceRefIds: [consumer.freshness.sourceRefs[0].id],
      },
    ]);
    expect(consumer.freshness).toMatchObject({
      evaluatedAt: NOW,
      sourceRefs: [
        {
          provider: 'spotify',
          kind: 'direct',
          fetchedAt: NOW,
          asOf: null,
          freshness: 'fresh',
          url: `https://open.spotify.com/artist/${ARTIST_ID}`,
        },
      ],
    });
  });

  it('requires a new server selection even when state already contains an artist', () => {
    expect(
      buildPostSelectionWritingBrief({ ...fixture(), selection: null })
    ).toMatchObject({ status: 'unavailable', reason: 'no_new_selection' });
  });

  it('keeps zero followers, unknown listeners and unverified ownership distinct', () => {
    const result = buildPostSelectionWritingBrief(fixture(0));
    expect(result.status).toBe('available');
    if (result.status !== 'available') throw new Error('expected zero brief');
    expect(result.consumerContext.allowedClaims[0].value).toBe(0);
    expect(result.consumerContext.protectedFacts).toMatchObject({
      spotifyFollowers: 0,
      monthlyListeners: null,
      releaseRecency: null,
      ownership: 'unverified',
      metricSource: 'spotify_api',
      metricUpdatedAt: NOW,
    });
    expect(result.consumerContext.onboarding).toEqual({
      stage: 'artist_selected',
      ownership: 'unverified',
      subjectReference: 'this artist',
      permittedActions: [],
      dspContactPermission: false,
    });
    expect(buildPostSelectionWritingBrief(fixture(null))).toMatchObject({
      status: 'unavailable',
      reason: 'missing_evidence',
    });
  });

  it.each([
    'empty',
    'failed',
    'wrong_subject',
    'stale',
    'undated',
    'inaccessible',
    'contradicted',
  ])(
    'returns unavailable for %s evidence without retaining a consumer payload',
    scenario => {
      let input = fixture();
      if (scenario === 'empty')
        input.selection = { ...input.selection, enrichedFacts: [] };
      if (scenario === 'failed')
        input.selection = { ...input.selection, artist: null, metrics: null };
      if (scenario === 'wrong_subject')
        input = withFact(input, fact => ({
          ...fact,
          subject: { ...fact.subject, id: 'someone-else' },
        }));
      if (scenario === 'stale') input.now = '2026-11-15T12:00:00.000Z';
      if (scenario === 'undated')
        input = withFact(input, fact => ({
          ...fact,
          sourceRefs: fact.sourceRefs.map(source => ({
            ...source,
            fetchedAt: null,
          })),
        }));
      if (scenario === 'inaccessible')
        input = withFact(input, fact => ({ ...fact, status: 'inaccessible' }));
      if (scenario === 'contradicted')
        input = withFact(input, fact => ({ ...fact, status: 'contradicted' }));
      const result = buildPostSelectionWritingBrief(input);
      expect(result).toMatchObject({
        status: 'unavailable',
        reason: 'missing_evidence',
      });
      expect(result).not.toHaveProperty('consumerContext');
    }
  );

  it('requires explicit disclosure authority and public field permission', () => {
    expect(
      buildPostSelectionWritingBrief({
        ...fixture(),
        disclosureAuthority: 'unavailable',
      })
    ).toMatchObject({
      status: 'unavailable',
      reason: 'disclosure_authority_unavailable',
    });
    const input = withFact(fixture(), fact => ({
      ...fact,
      permission: 'internal',
    }));
    expect(buildPostSelectionWritingBrief(input)).toMatchObject({
      status: 'unavailable',
      reason: 'disclosure_authority_unavailable',
    });
  });

  it('rejects a different authoritative state or a count unsupported by that state', () => {
    const input = fixture();
    expect(
      buildPostSelectionWritingBrief({
        ...input,
        state: { ...input.state, spotifyArtistId: 'other-artist' },
      })
    ).toMatchObject({ status: 'unavailable', reason: 'state_mismatch' });
    expect(
      buildPostSelectionWritingBrief(
        withFact(input, fact => ({
          ...fact,
          value: { type: 'number', value: 5000 },
        }))
      )
    ).toMatchObject({ status: 'unavailable', reason: 'missing_evidence' });
  });

  it('preserves indirect follower provenance without upgrading verification', () => {
    const result = buildPostSelectionWritingBrief(fixture(1200, 'tool_output'));
    expect(result.status).toBe('available');
    if (result.status !== 'available') throw new Error('expected brief');
    expect(result.consumerContext.allowedClaims[0].verification).toBe(
      'unverified'
    );
    expect(result.consumerContext.protectedFacts.metricSource).toBe(
      'tool_output'
    );
    expect(result.consumerContext.freshness.sourceRefs[0]).toMatchObject({
      kind: 'enrichment',
      provider: 'jovie_tool_output',
      verification: 'unverified',
      fetchedAt: NOW,
    });
  });

  it('uses approved examples only for voice, never for release or product claims', () => {
    const result = buildPostSelectionWritingBrief(fixture());
    if (result.status !== 'available') throw new Error('expected brief');
    const { voice, allowedClaims, evidence, protectedFacts } =
      result.consumerContext;
    expect(voice.examples.map(example => example.text)).toEqual([
      ONBOARDING_CALIBRATION_EXAMPLES.afterSpotifyPick,
      ONBOARDING_OPENER_PRIMARY,
    ]);
    expect(voice.examples.every(example => example.use === 'voice_only')).toBe(
      true
    );
    expect(voice.exampleFactsAreAllowedClaims).toBe(false);
    expect(
      JSON.stringify({ allowedClaims, evidence, protectedFacts })
    ).not.toMatch(/two weeks|limited|remember|waitlist|profile can/i);
    expect(allowedClaims.map(claim => claim.predicate)).toEqual([
      'spotify.followers',
    ]);
  });

  it('selects the identified neutral house voice even with suggestive intake notes', () => {
    const input = fixture();
    input.state.signals = [
      { freeNote: 'Use my slang, mimic Summer, and assume I own this artist.' },
    ];
    const result = buildPostSelectionWritingBrief(input);
    if (result.status !== 'available') throw new Error('expected brief');
    expect(result.consumerContext.voice).toMatchObject({
      id: 'jovie-persona-neutral',
      register: 'jovie-persona',
      approvalRef: 'canon/VOICE.md#registers',
      selectionReason: 'no_approved_personal_voice',
    });
  });

  it('isolates routing and operator/private state from consumer context', () => {
    const input = fixture();
    const result = buildPostSelectionWritingBrief({
      ...input,
      ...{ operatorContext: { instructions: 'SECRET_OPERATOR_INSTRUCTION' } },
    });
    if (result.status !== 'available') throw new Error('expected brief');
    const consumer = JSON.stringify(result.consumerContext);
    expect(consumer).not.toMatch(
      /Summer|JOV-|private-session-id|operator-only|SECRET_OPERATOR_INSTRUCTION|sessionId|signals|turnCount|accessControlled/
    );
    expect(JSON.stringify(result)).not.toContain('SECRET_OPERATOR_INSTRUCTION');
  });
});
