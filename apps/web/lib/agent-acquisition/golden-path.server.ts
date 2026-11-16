import 'server-only';

import { and, eq, gt, isNull } from 'drizzle-orm';
import { BASE_URL } from '@/constants/app';
import { publicCreatorName } from '@/lib/agent/public-catalog';
import { requiresClaimVerification } from '@/lib/claim/claim-verification';
import { lookupArtistReach } from '@/lib/claim/claim-verification.server';
import { db } from '@/lib/db';
import { agentVisibilityDrafts } from '@/lib/db/schema/agent-drafts';
import {
  fetchOnboardingCatalogPreview,
  isValueBeforePaywallEnabled,
} from '@/lib/onboarding/catalog-preview.server';
import { checkOnboardingHandleAvailability } from '@/lib/onboarding/reserved-handle';
import { isPublicProfileIndexable } from '@/lib/profile/public-profile-indexing-policy';
import { getProfileByUsername } from '@/lib/services/profile/queries';
import { decideGoldenPathAdmissionForArtist } from '@/lib/waitlist/golden-path-admission.server';
import { PROMO_SPEND_BANDS } from '@/lib/waitlist/role-qualification';
import { agentClaimUrl } from './claim-handoff';
import { draftTokenHash, verifyDraftCapability } from './draft-capability';
import { invalidInputError } from './draft-contract';
import type { AgentVisibilityDraftPreview } from './draft-preview';
import { type AgentDraftRow, loadAgentDraftForMutation } from './draft-store';
import {
  answerQuestionSchema,
  claimHandleSchema,
  type DraftRef,
  draftRefSchema,
  type GoldenPathDraftState,
  type GoldenPathQualificationView,
  presentGoldenPathQualification,
  publishProfileSchema,
  shareProfileSchema,
  shareTextFor,
} from './golden-path';

/**
 * Golden-path tool implementations (founder order 2026-11-09).
 *
 * Same server logic as the web /start flow — no parallel business logic:
 * - handle availability: `checkOnboardingHandleAvailability` (handle-availability
 *   canon, numbered alternatives included);
 * - high-reach artists: `requiresClaimVerification` → the existing
 *   verification path, never self-serve identity attachment;
 * - qualification: the shared admission decision
 *   (`decideGoldenPathAdmissionForArtist`) via the `presentGoldenPathQualification`
 *   seam — the parallel `decideQualification` PR swaps in there;
 * - setup: the value-before-paywall catalog preview
 *   (`ONBOARDING_VALUE_BEFORE_PAYWALL`);
 * - publish: never agent-side. Claiming never publishes (draft-claim.server);
 *   the person publishes from their signed-in dashboard. The tool routes
 *   there instead of inventing an unauthenticated publish;
 * - upgrade: the existing /claim/start checkout entry (offer truth is shown
 *   there; prices are never restated here).
 *
 * Auth model is the existing draft capability: the HMAC draft_token scopes
 * every mutation to one seven-day draft, exactly like workspace.create_draft
 * and release.prepare_launch. Nothing here writes an account; the person
 * claims and publishes through their authenticated Jovie session.
 */

const unavailable = () => ({
  status: 'error' as const,
  code: 'DRAFT_UNAVAILABLE' as const,
  next_action: 'artist.search_or_import' as const,
  retryable: false,
});

type GoldenPathPreview = AgentVisibilityDraftPreview & {
  readonly golden_path?: GoldenPathDraftState;
};

function readGoldenPath(row: AgentDraftRow): GoldenPathDraftState {
  return (row.preview as GoldenPathPreview).golden_path ?? {};
}

/**
 * Read-modify-write of the draft's golden-path state, guarded on the same
 * liveness predicates as every other draft mutation (unclaimed, unexpired).
 * Returns the fresh row, or null when the draft vanished, was claimed or
 * expired between the read and the write.
 */
async function updateGoldenPathState(
  ref: DraftRef,
  patch: (current: GoldenPathDraftState) => GoldenPathDraftState
): Promise<AgentDraftRow | null> {
  const now = new Date();
  const row = await loadAgentDraftForMutation(ref.draft_id, ref.draft_token);
  if (!row) return null;
  const current = readGoldenPath(row);
  const next = patch(current);
  await db
    .update(agentVisibilityDrafts)
    .set({
      preview: { ...row.preview, golden_path: next },
    })
    .where(
      and(
        eq(agentVisibilityDrafts.id, row.id),
        eq(agentVisibilityDrafts.capabilityHash, row.capabilityHash),
        gt(agentVisibilityDrafts.expiresAt, now),
        isNull(agentVisibilityDrafts.claimedAt)
      )
    );
  const fresh = await loadAgentDraftForMutation(ref.draft_id, ref.draft_token);
  return fresh;
}

/** Spotify drafts carry the exact artist id; other providers have no id yet. */
function spotifyIdOf(row: AgentDraftRow): string | null {
  return row.preview.provider === 'spotify' ? row.preview.external_id : null;
}

function claimUrlFor(row: AgentDraftRow): string {
  return agentClaimUrl(row);
}

// ---------------------------------------------------------------------------
// claim_handle
// ---------------------------------------------------------------------------

export type ClaimHandleResult = Awaited<ReturnType<typeof claimHandle>>;

export async function claimHandle(input: unknown) {
  const parsed = claimHandleSchema.safeParse(input);
  if (!parsed.success) return invalidInputError(parsed.error);
  const row = await loadAgentDraftForMutation(
    parsed.data.draft_id,
    parsed.data.draft_token
  );
  if (!row) return unavailable();

  // The canonical availability read: reserved words, format, taken handles,
  // numbered `suggestedAlternatives` (never silent swaps).
  const availability = await checkOnboardingHandleAvailability(
    parsed.data.handle
  );

  // High-reach artists go to the existing verification path; unknown reach
  // (non-Spotify drafts) fails closed into it too, as /claim/start does.
  const spotifyId = spotifyIdOf(row);
  const reach = spotifyId ? await lookupArtistReach(spotifyId) : null;
  const requiresVerification = requiresClaimVerification(
    reach?.followers ?? null
  );

  const recorded = availability.available
    ? await updateGoldenPathState(parsed.data, current => ({
        ...current,
        handle: availability.handle,
      }))
    : null;
  if (availability.available && !recorded) return unavailable();

  return {
    status: availability.available
      ? ('reserved' as const)
      : ('unavailable' as const),
    reason: availability.reason,
    handle: availability.handle,
    ...(availability.suggestedAlternatives
      ? { suggested_alternatives: availability.suggestedAlternatives }
      : {}),
    ...(availability.error ? { message: availability.error } : {}),
    requires_verification: requiresVerification,
    // The person, not the agent, claims: reservation completes when they
    // sign in through the claim page. Nothing is public until they publish.
    claim_url: claimUrlFor(row),
    next_action: requiresVerification
      ? ('send_user_claim_url_verification' as const)
      : ('send_user_claim_url' as const),
    retryable: false,
  };
}

// ---------------------------------------------------------------------------
// answer_onboarding_question
// ---------------------------------------------------------------------------

export type AnswerQuestionResult = Awaited<
  ReturnType<typeof answerOnboardingQuestion>
>;

export async function answerOnboardingQuestion(input: unknown) {
  const parsed = answerQuestionSchema.safeParse(input);
  if (!parsed.success) return invalidInputError(parsed.error);
  const { question, answer, ...ref } = parsed.data;

  if (question === 'promoSpend') {
    const isBand = (PROMO_SPEND_BANDS as readonly string[]).includes(answer);
    if (!isBand) {
      return {
        status: 'error' as const,
        code: 'INVALID_INPUT' as const,
        message: `promoSpend must be one of: ${PROMO_SPEND_BANDS.join(', ')}.`,
        retryable: false,
      };
    }
  }

  const row = await updateGoldenPathState(ref, current => ({
    ...current,
    answers: {
      ...current.answers,
      [question]: answer,
    },
  }));
  if (!row) return unavailable();

  const stored = readGoldenPath(row).answers ?? {};
  const missing = (['lastGrowthAttempt', 'promoSpend'] as const).filter(
    id => !stored[id]
  );

  return {
    status: 'recorded' as const,
    recorded: question,
    remaining_questions: missing,
    next_action: missing.length
      ? ('answer_onboarding_question' as const)
      : ('get_qualification' as const),
    retryable: false,
  };
}

// ---------------------------------------------------------------------------
// get_qualification
// ---------------------------------------------------------------------------

/**
 * SEAM for the parallel qualification PR: when `decideQualification` +
 * `capability_wants` land, they replace the body of this function. Until
 * then the shared admission decision is the single qualification gate.
 */
async function decideGoldenPathQualificationForDraft(
  row: AgentDraftRow
): Promise<GoldenPathQualificationView> {
  const spotifyId = spotifyIdOf(row);
  const reach = spotifyId ? await lookupArtistReach(spotifyId) : null;
  const decision = await decideGoldenPathAdmissionForArtist({
    spotifyArtistId: spotifyId,
    reach: reach?.followers ?? null,
  });
  return presentGoldenPathQualification(decision);
}

export type QualificationResult = Awaited<ReturnType<typeof getQualification>>;

export async function getQualification(input: unknown) {
  const parsed = draftRefSchema.safeParse(input);
  if (!parsed.success) return invalidInputError(parsed.error);
  const row = await loadAgentDraftForMutation(
    parsed.data.draft_id,
    parsed.data.draft_token
  );
  if (!row) return unavailable();

  const verdict = await decideGoldenPathQualificationForDraft(row);
  const answers = readGoldenPath(row).answers ?? {};
  return {
    status: verdict.status,
    reason: verdict.reason,
    ...(verdict.message ? { message: verdict.message } : {}),
    requires_verification: verdict.requiresVerification,
    answers_recorded: {
      lastGrowthAttempt: answers.lastGrowthAttempt ?? null,
      promoSpend: answers.promoSpend ?? null,
    },
    next_action:
      verdict.status === 'qualified'
        ? ('build_profile' as const)
        : ('send_user_claim_url' as const),
    claim_url: claimUrlFor(row),
    retryable: false,
  };
}

// ---------------------------------------------------------------------------
// build_profile (setup — value before paywall)
// ---------------------------------------------------------------------------

export type BuildProfileResult = Awaited<ReturnType<typeof buildProfile>>;

export async function buildProfile(input: unknown) {
  const parsed = draftRefSchema.safeParse(input);
  if (!parsed.success) return invalidInputError(parsed.error);
  const row = await loadAgentDraftForMutation(
    parsed.data.draft_id,
    parsed.data.draft_token
  );
  if (!row) return unavailable();

  // The value-before-paywall catalog preview, same as the web /start flow.
  // Kill-switched and Spotify-id-gated; a failed lookup is identity-only.
  const spotifyId = spotifyIdOf(row);
  const catalog = spotifyId
    ? await fetchOnboardingCatalogPreview(spotifyId)
    : null;

  const row2 = catalog
    ? await updateGoldenPathState(parsed.data, current => ({
        ...current,
        catalog,
      }))
    : row;
  if (catalog && !row2) return unavailable();

  const preview = (row2 ?? row).preview;
  return {
    status: 'draft_ready' as const,
    draft_id: row.id,
    artist: {
      name: preview.display_name,
      image_url: preview.image_url,
      bio: preview.bio,
      genres: preview.genres,
      source_url: preview.source_url,
    },
    catalog: catalog
      ? {
          total: catalog.total,
          releases: catalog.releases,
        }
      : null,
    value_enabled: isValueBeforePaywallEnabled(),
    next_action: 'get_qualification' as const,
    retryable: false,
  };
}

// ---------------------------------------------------------------------------
// publish_profile
// ---------------------------------------------------------------------------

export type PublishProfileResult = Awaited<ReturnType<typeof publishProfile>>;

export async function publishProfile(input: unknown) {
  const parsed = publishProfileSchema.safeParse(input);
  if (!parsed.success) return invalidInputError(parsed.error);
  const capability = verifyDraftCapability(parsed.data.draft_token);
  const now = new Date();
  // Every other tool only reads unclaimed drafts; publish must also answer
  // once the draft IS claimed, so look up both states by id + capability hash.
  const [row] = capability
    ? await db
        .select()
        .from(agentVisibilityDrafts)
        .where(
          and(
            eq(agentVisibilityDrafts.id, capability.draft_id),
            eq(
              agentVisibilityDrafts.capabilityHash,
              draftTokenHash(parsed.data.draft_token)
            ),
            gt(agentVisibilityDrafts.expiresAt, now)
          )
        )
        .limit(1)
    : [];
  if (!row) return unavailable();

  // Claiming never publishes (draft-claim.server). The person publishes from
  // their signed-in dashboard; an agent capability cannot and never will.
  if (!row.claimedAt) {
    return {
      status: 'claim_required' as const,
      claim_url: claimUrlFor(row),
      next_action: 'send_user_claim_url' as const,
      message:
        'Show claim_url to the artist. They sign in on Jovie and publish from their dashboard; nothing is public until they publish it.',
      retryable: false,
    };
  }
  return {
    status: 'claimed' as const,
    next_action: 'share_profile' as const,
    message:
      'Draft claimed. The artist publishes the profile from their Jovie dashboard; nothing is public until they publish it.',
    retryable: false,
  };
}

// ---------------------------------------------------------------------------
// share_profile (read-only)
// ---------------------------------------------------------------------------

export type ShareProfileResult = Awaited<ReturnType<typeof shareProfile>>;

export async function shareProfile(input: unknown) {
  const parsed = shareProfileSchema.safeParse(input);
  if (!parsed.success) return invalidInputError(parsed.error);

  const profile = await getProfileByUsername(parsed.data.username);
  if (!profile || profile.isPublic !== true) {
    return {
      status: 'not_public' as const,
      message:
        'No public Jovie profile for that handle. Publish first, then share.',
      retryable: false,
    };
  }
  const handle = profile.usernameNormalized || profile.username.toLowerCase();
  // Same discovery chokepoint as every other public surface: excluded
  // (reserved/QA/unindexed) handles never get a share URL.
  if (!isPublicProfileIndexable(handle, publicCreatorName(profile))) {
    return {
      status: 'not_public' as const,
      message:
        'No public Jovie profile for that handle. Publish first, then share.',
      retryable: false,
    };
  }
  const profileUrl = `${BASE_URL}/${handle}`;
  return {
    status: 'ok' as const,
    profile_url: profileUrl,
    share_text: shareTextFor(publicCreatorName(profile), profileUrl),
    retryable: false,
  };
}

// ---------------------------------------------------------------------------
// start_upgrade (read-only — returns the existing checkout entry)
// ---------------------------------------------------------------------------

export type StartUpgradeResult = Awaited<ReturnType<typeof startUpgrade>>;

export async function startUpgrade(input: unknown) {
  const parsed = draftRefSchema.safeParse(input);
  if (!parsed.success) return invalidInputError(parsed.error);
  const row = await loadAgentDraftForMutation(
    parsed.data.draft_id,
    parsed.data.draft_token
  );
  if (!row) return unavailable();

  // The existing self-serve claim checkout entry. Offer truth (plan, price)
  // renders there; prices are never restated by this tool.
  const spotifyId = spotifyIdOf(row);
  return {
    status: 'ok' as const,
    checkout_url: spotifyId
      ? `${BASE_URL}/claim/start?spotify=${encodeURIComponent(spotifyId)}`
      : `${BASE_URL}/claim/start?new=1`,
    next_action: 'open_checkout' as const,
    retryable: false,
  };
}
