import 'server-only';
import {
  ONBOARDING_CALIBRATION_EXAMPLES,
  ONBOARDING_OPENER_PRIMARY,
} from '@/lib/chat/prompts/onboarding';
import type {
  ConfirmSpotifyArtistOutput,
  OnboardingTurnState,
} from '@/lib/chat/tools/onboarding-tool-impls';
import { spotifyEnrichmentSubjectId } from '@/lib/onboarding/enrichment-facts';
import {
  type EnrichedFact,
  projectPublicEnrichedFacts,
  type SourceRef,
} from '@/lib/profile-facts/enrichment';

const OPERATOR_CONTEXT = {
  surface: 'chat-persona',
  coverageContract: 'JOV-6475',
  accountableOwner: 'Summer',
  implementationIssue: 'JOV-8408',
  policyRef: 'canon/VOICE.md',
} as const;

/** Approved house voice, never a personal style inferred from intake signals. */
const NEUTRAL_VOICE = {
  id: 'jovie-persona-neutral',
  register: 'jovie-persona',
  approvalRef: 'canon/VOICE.md#registers',
  selectionReason: 'no_approved_personal_voice',
  examples: [
    {
      ref: 'ONBOARDING_CALIBRATION_EXAMPLES.afterSpotifyPick',
      source: 'apps/web/lib/chat/prompts/onboarding.ts',
      text: ONBOARDING_CALIBRATION_EXAMPLES.afterSpotifyPick,
      use: 'voice_only',
    },
    {
      ref: 'ONBOARDING_OPENER_PRIMARY',
      source: 'apps/web/lib/chat/prompts/onboarding.ts',
      text: ONBOARDING_OPENER_PRIMARY,
      use: 'voice_only',
    },
  ],
  exampleFactsAreAllowedClaims: false,
} as const;

export interface PostSelectionWritingBrief {
  readonly schemaVersion: 1;
  readonly status: 'available';
  /** Review routing only. Never concatenate this into consumer context. */
  readonly operatorContext: typeof OPERATOR_CONTEXT;
  readonly consumerContext: {
    readonly audience: 'onboarding_visitor_relationship_unverified';
    readonly purpose: 'one_supported_observation_then_one_contextual_question';
    readonly language: {
      readonly tag: 'en';
      readonly source: 'approved_onboarding_copy';
    };
    readonly form: { readonly maxSentences: 2; readonly maxQuestions: 1 };
    readonly onboarding: {
      readonly stage: 'artist_selected';
      readonly ownership: 'unverified';
      readonly subjectReference: 'this artist';
      readonly permittedActions: readonly [];
      readonly dspContactPermission: false;
    };
    readonly voice: typeof NEUTRAL_VOICE;
    readonly allowedClaims: readonly {
      readonly factId: string;
      readonly subjectId: string;
      readonly predicate: 'spotify.followers';
      readonly value: number;
      readonly unit: 'followers';
      readonly verification: EnrichedFact['verification'];
      readonly evidenceRefIds: readonly string[];
    }[];
    readonly evidence: readonly EnrichedFact[];
    readonly freshness: {
      readonly evaluatedAt: string;
      readonly policyRef: 'projectPublicEnrichedFacts';
      readonly sourceRefs: readonly SourceRef[];
    };
    /** Preserve exact values and uncertainty; these grant no additional claims. */
    readonly protectedFacts: {
      readonly subjectId: string;
      readonly spotifyArtistId: string;
      readonly displayName: string;
      readonly spotifyFollowers: number;
      readonly metricSource: NonNullable<
        OnboardingTurnState['artistMetrics']
      >['source'];
      readonly metricUpdatedAt: string;
      readonly monthlyListeners: null;
      readonly releaseRecency: null;
      readonly ownership: 'unverified';
    };
  };
}

export type PostSelectionBriefUnavailableReason =
  | 'no_new_selection'
  | 'missing_evidence'
  | 'state_mismatch'
  | 'disclosure_authority_unavailable';

export type PostSelectionWritingBriefResult =
  | PostSelectionWritingBrief
  | {
      readonly schemaVersion: 1;
      readonly status: 'unavailable';
      readonly reason: PostSelectionBriefUnavailableReason;
      readonly operatorContext: typeof OPERATOR_CONTEXT;
    };

/**
 * Call only with the current server confirmation and its request-local state.
 * No UIMessage/history input: neither replayed client tools nor model prose can
 * establish evidence, ownership, actions, disclosure authority or voice approval.
 * Public enrichment permission permits quoting that evidence, never account work.
 */
export function buildPostSelectionWritingBrief(input: {
  readonly selection: ConfirmSpotifyArtistOutput | null;
  readonly state: OnboardingTurnState;
  readonly disclosureAuthority: 'public_enrichment_only' | 'unavailable';
  readonly now?: string;
}): PostSelectionWritingBriefResult {
  const unavailable = (
    reason: PostSelectionBriefUnavailableReason
  ): PostSelectionWritingBriefResult => ({
    schemaVersion: 1,
    status: 'unavailable',
    reason,
    operatorContext: OPERATOR_CONTEXT,
  });
  const { selection, state } = input;
  if (!selection) return unavailable('no_new_selection');
  if (input.disclosureAuthority !== 'public_enrichment_only') {
    return unavailable('disclosure_authority_unavailable');
  }
  const subjectId = spotifyEnrichmentSubjectId(selection.spotifyArtistId);
  const artist = selection.artist;
  const metrics = selection.metrics;
  if (!subjectId || !artist || !metrics || !artist.name.trim()) {
    return unavailable('missing_evidence');
  }
  if (
    selection.subjectId !== subjectId ||
    artist.id !== selection.spotifyArtistId ||
    state.spotifyArtistId !== artist.id ||
    state.spotifyArtistName !== artist.name ||
    state.spotifyFollowers !== metrics.spotifyFollowers ||
    state.artistMetrics?.source !== metrics.source ||
    state.artistMetrics?.updatedAt !== metrics.updatedAt
  ) {
    return unavailable('state_mismatch');
  }
  const evaluatedAt = input.now ?? new Date().toISOString();
  const facts = projectPublicEnrichedFacts(selection.enrichedFacts, subjectId, {
    now: evaluatedAt,
  });
  const followers = facts.find(
    fact => fact.predicate === 'spotify.followers' && fact.unit === 'followers'
  );
  if (
    !followers &&
    selection.enrichedFacts.some(fact => fact.permission !== 'public')
  ) {
    return unavailable('disclosure_authority_unavailable');
  }
  const value = followers?.value;
  const sources = followers?.sourceRefs.filter(
    source => source.status === 'available' && source.freshness === 'fresh'
  );
  if (
    !followers ||
    followers.status !== 'resolved' ||
    value?.type !== 'number' ||
    !Number.isInteger(value.value) ||
    value.value < 0 ||
    value.value !== metrics.spotifyFollowers ||
    !sources?.length
  ) {
    return unavailable('missing_evidence');
  }
  return {
    schemaVersion: 1,
    status: 'available',
    operatorContext: OPERATOR_CONTEXT,
    consumerContext: {
      audience: 'onboarding_visitor_relationship_unverified',
      purpose: 'one_supported_observation_then_one_contextual_question',
      language: { tag: 'en', source: 'approved_onboarding_copy' },
      form: { maxSentences: 2, maxQuestions: 1 },
      onboarding: {
        stage: 'artist_selected',
        ownership: 'unverified',
        subjectReference: 'this artist',
        permittedActions: [],
        dspContactPermission: false,
      },
      voice: NEUTRAL_VOICE,
      allowedClaims: [
        {
          factId: followers.id,
          subjectId,
          predicate: 'spotify.followers',
          value: value.value,
          unit: 'followers',
          verification: followers.verification,
          evidenceRefIds: sources.map(source => source.id),
        },
      ],
      evidence: [followers],
      freshness: {
        evaluatedAt,
        policyRef: 'projectPublicEnrichedFacts',
        sourceRefs: followers.sourceRefs,
      },
      protectedFacts: {
        subjectId,
        spotifyArtistId: artist.id,
        displayName: artist.name,
        spotifyFollowers: value.value,
        metricSource: metrics.source,
        metricUpdatedAt: metrics.updatedAt,
        monthlyListeners: null,
        releaseRecency: null,
        ownership: 'unverified',
      },
    },
  };
}
