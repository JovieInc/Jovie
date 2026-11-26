import { getCachedCurrentUser } from '@/lib/auth/cached';
import { pickWaitlistPrimarySocialUrl } from '@/lib/onboarding/apply-post-keep-enrichment';
import { deriveClaimedOnboardingStateFromMessageRows } from '@/lib/onboarding/claimed-state';
import type { PostKeepEnrichmentNotes } from '@/lib/onboarding/post-keep-enrichment-notes';
import { normalizeEmail } from '@/lib/utils/email';
import { waitlistRequestSchema } from '@/lib/validation/schemas';
import {
  submitWaitlistAccessRequest,
  type WaitlistAccessRequestResult,
} from '@/lib/waitlist/access-request';
import { scoreAdmissionCandidate } from '@/lib/waitlist/admission-score';
import { decideGoldenPathAdmissionForArtist } from '@/lib/waitlist/golden-path-admission.server';
import { mergePostKeepEnrichmentOntoWaitlistEntry } from '@/lib/waitlist/post-keep-enrichment';

export class WaitlistPersistenceError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super('Waitlist request could not be saved');
    this.name = 'WaitlistPersistenceError';
    this.cause = cause;
  }
}

export class WaitlistIntakeRequiredError extends Error {
  constructor() {
    super('A confirmed artist or social profile is required for waitlist');
    this.name = 'WaitlistIntakeRequiredError';
  }
}

function deriveFullName(params: {
  readonly userFullName: string | null | undefined;
  readonly userUsername: string | null | undefined;
  readonly email: string;
}): string {
  const fromUser = (params.userFullName ?? '').trim();
  if (fromUser) return fromUser;
  const fromUsername = (params.userUsername ?? '').trim();
  if (fromUsername) return fromUsername;
  return params.email.split('@')[0]?.trim() || 'Jovie user';
}

async function createWaitlistReceipt(params: {
  readonly appUserId: string;
  readonly messageRows: readonly { toolCalls: unknown }[];
  readonly enrichment: PostKeepEnrichmentNotes | null;
}): Promise<WaitlistAccessRequestResult> {
  const currentUser = await getCachedCurrentUser();
  const emailRaw = currentUser?.primaryEmailAddress?.emailAddress;
  if (!emailRaw) throw new Error('Verified email is required for waitlist');

  const state = deriveClaimedOnboardingStateFromMessageRows(params.messageRows);
  const primarySocialUrl = pickWaitlistPrimarySocialUrl({
    stateSocialUrl: state.socialLinks[0],
    artistUrl: state.artist?.url,
    enrichment: params.enrichment,
  });
  if (!primarySocialUrl) throw new WaitlistIntakeRequiredError();

  const goldenPathAdmission = await decideGoldenPathAdmissionForArtist({
    spotifyArtistId: state.artist?.id ?? null,
    reach: state.artist?.followers ?? null,
  });

  const admissionScore = scoreAdmissionCandidate({
    identityResolved: Boolean(state.artist?.id),
    followers: state.artist?.followers ?? null,
    popularity: state.artist?.popularity ?? null,
    catalogReleases: state.catalogPreview?.total ?? null,
    latestReleaseAt: state.catalogPreview?.releases[0]?.releaseDate ?? null,
    releaseStage:
      state.interviewSignals.findLast(signal => signal.releaseStage)
        ?.releaseStage ?? null,
    chatTurns: params.messageRows.length,
  });

  const email = normalizeEmail(emailRaw);
  const waitlistData = waitlistRequestSchema.parse({
    primaryGoal: null,
    primarySocialUrl,
    spotifyUrl: state.artist?.url ?? null,
    spotifyArtistName: state.artist?.name ?? null,
    heardAbout: 'onboarding_chat',
    selectedPlan: null,
  });

  const result = await submitWaitlistAccessRequest({
    appUserId: params.appUserId,
    email,
    emailRaw,
    fullName: deriveFullName({
      userFullName: currentUser.fullName,
      userUsername: currentUser.username,
      email,
    }),
    data: waitlistData,
    goldenPathAdmission,
    admissionScore,
    source: 'onboarding_chat_claim',
  });
  await mergePostKeepEnrichmentOntoWaitlistEntry({
    entryId: result.entryId,
    enrichment: params.enrichment,
  });
  return result;
}

export async function createWaitlistReceiptOrThrow(params: {
  readonly appUserId: string;
  readonly messageRows: readonly { toolCalls: unknown }[];
  readonly enrichment: PostKeepEnrichmentNotes | null;
}): Promise<WaitlistAccessRequestResult> {
  try {
    return await createWaitlistReceipt(params);
  } catch (error) {
    if (error instanceof WaitlistIntakeRequiredError) throw error;
    throw new WaitlistPersistenceError(error);
  }
}
