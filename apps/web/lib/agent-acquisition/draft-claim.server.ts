import 'server-only';

import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { invalidateProxyUserStateCache } from '@/lib/auth/proxy-state';
import { withDbSessionTx } from '@/lib/auth/session';
import { invalidateProfileCache } from '@/lib/cache/profile';
import { requiresClaimVerification } from '@/lib/claim/claim-verification';
import { lookupArtistReach } from '@/lib/claim/claim-verification.server';
import { claimPrebuiltProfileForUser } from '@/lib/claim/finalize';
import { type DbOrTransaction, db } from '@/lib/db';
import { isUniqueViolation } from '@/lib/db/errors';
import { agentVisibilityDrafts } from '@/lib/db/schema/agent-drafts';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { normalizeArtistNameToHandleBase } from '@/lib/discography/friendly-artist-handle';
import { captureError } from '@/lib/error-tracking';
import { findAvailableHandle } from '@/lib/ingestion/flows/profile-operations';
import {
  assertSpotifyProfileIdentityAvailable,
  SpotifyProfileIdentityConflictError,
} from '@/lib/profile/spotify-profile-identity';
import { trackServerEventTx } from '@/lib/server-analytics';
import { isBlacklistedSpotifyId } from '@/lib/spotify/blacklist';
import { validateUsername } from '@/lib/validation/username';
import { isWaitlistGateEnabled } from '@/lib/waitlist/settings';
import { markWaitlistSignedUpInTx } from '@/lib/waitlist/signup';
import {
  agentDraftPreviewDigest,
  checkAgentClaimHandoff,
  isAgentDraftId,
} from './claim-handoff';
import {
  materializeAgentDraftRelease,
  trustedImageUrl,
} from './draft-materialize.server';
import {
  AGENT_CLAIM_RESERVATION_STALE_MS,
  releaseAgentDraft,
  reserveAgentDraft,
} from './draft-reservation.server';
import type { AgentDraftRow } from './draft-store';

/**
 * Person-side completion of an agent-created draft (JOV-9760).
 *
 * This module does not verify ownership itself. It routes every case into
 * the claim system that already exists:
 * - artist identity: exact Spotify artist ID, the same proof the onboarding
 *   direct claim accepts (`connectOnboardingSpotifyArtist`);
 * - high or unknown reach: `lookupArtistReach` + `requiresClaimVerification`;
 *   the person goes to the existing `/claim/start` verification path and
 *   nothing is linked (unknown reach fails closed here, as /claim/start does);
 * - waitlist: the onboarding gate (`markWaitlistSignedUpInTx`) applies;
 * - an existing Jovie profile for the artist: the existing
 *   `/{handle}/claim` direct-profile flow;
 * - ownership transfer: `claimPrebuiltProfileForUser` (lib/claim/finalize.ts)
 *   with the Spotify identity lock and uniqueness backstop.
 *
 * Claiming never publishes: the profile stays private and the release is a
 * draft until the owner publishes from the dashboard.
 */
export const AGENT_ACQUISITION_SETTINGS_KEY = 'agentAcquisition' as const;
export const AGENT_DRAFT_CLAIM_SOURCE = 'agent_draft_handoff' as const;

export interface AgentClaimPreview {
  readonly artistName: string;
  readonly provider: string;
  readonly sourceUrl: string;
  readonly imageUrl: string | null;
  readonly bio: string | null;
  readonly release: {
    readonly title: string | null;
    readonly artistName: string | null;
    readonly releaseDate: string | null;
    readonly artworkUrl: string | null;
    readonly links: Readonly<Record<string, string>>;
  } | null;
  readonly expiresAt: string;
  /** Bound into the claim form; the claim refuses a changed draft. */
  readonly digest: string;
}

export type AgentClaimView =
  | { readonly state: 'invalid' }
  | { readonly state: 'expired' }
  | {
      readonly state: 'claimed';
      readonly ownedByViewer: boolean;
      readonly handle: string | null;
    }
  | { readonly state: 'ready'; readonly preview: AgentClaimPreview };

export type AgentClaimResult =
  | { readonly status: 'claimed'; readonly handle: string }
  | { readonly status: 'invalid' | 'expired' | 'already_claimed' }
  | { readonly status: 'unsupported_provider' }
  | { readonly status: 'blocked_artist' }
  | { readonly status: 'artist_taken' }
  | { readonly status: 'existing_profile'; readonly handle: string }
  | { readonly status: 'verification_required'; readonly spotifyId: string }
  | { readonly status: 'has_profile'; readonly handle: string }
  | { readonly status: 'waitlist_pending' }
  | { readonly status: 'draft_changed' };

/** Statuses that may finish signup while the waitlist gate is on. */
const WAITLIST_CLEARED_STATUSES = new Set([
  'waitlist_approved',
  'onboarding_incomplete',
  'active',
]);

/** Plain `db` only: the drafts table is unreachable inside an RLS session. */
async function loadDraft(draftId: string): Promise<AgentDraftRow | null> {
  if (!isAgentDraftId(draftId)) return null;
  const [row] = await db
    .select()
    .from(agentVisibilityDrafts)
    .where(eq(agentVisibilityDrafts.id, draftId))
    .limit(1);
  return row ?? null;
}

async function findClaimedProfileForDraft(
  database: DbOrTransaction,
  draftId: string
) {
  const [profile] = await database
    .select({
      id: creatorProfiles.id,
      userId: creatorProfiles.userId,
      handle: creatorProfiles.usernameNormalized,
    })
    .from(creatorProfiles)
    .where(
      drizzleSql`${creatorProfiles.settings}->${AGENT_ACQUISITION_SETTINGS_KEY}->>'draft_id' = ${draftId}`
    )
    .limit(1);
  return profile ?? null;
}

function toPreview(row: AgentDraftRow): AgentClaimPreview {
  const { launch, ...artist } = row.preview;
  const release = launch?.result.release;
  return {
    artistName: artist.display_name,
    provider: artist.provider,
    sourceUrl: artist.source_url,
    imageUrl: trustedImageUrl(artist.image_url),
    bio: artist.bio,
    release: release
      ? {
          title: release.title,
          artistName: release.artist_name,
          releaseDate: release.release_date,
          artworkUrl: trustedImageUrl(release.artwork_url),
          links: launch.result.smart_link.links,
        }
      : null,
    expiresAt: row.expiresAt.toISOString(),
    digest: agentDraftPreviewDigest(row.preview),
  };
}

function isStaleReservation(row: AgentDraftRow, now = Date.now()): boolean {
  return Boolean(
    row.claimedAt &&
      now - row.claimedAt.getTime() > AGENT_CLAIM_RESERVATION_STALE_MS &&
      row.expiresAt.getTime() > now
  );
}

/** Read-only page state. Never discloses a draft without a valid handoff. */
export async function loadAgentClaimView(
  draftId: string,
  handoff: string | null | undefined,
  viewerUserId: string | null
): Promise<AgentClaimView> {
  const row = await loadDraft(draftId);
  const check = checkAgentClaimHandoff(row, handoff);
  if (check === 'invalid' || !row) return { state: 'invalid' };
  if (check === 'claimed') {
    const profile = await findClaimedProfileForDraft(db, row.id);
    // An abandoned reservation (no profile, stale, unexpired) can be claimed.
    if (!profile && isStaleReservation(row))
      return { state: 'ready', preview: toPreview(row) };
    const ownedByViewer = Boolean(
      viewerUserId && profile?.userId === viewerUserId
    );
    return {
      state: 'claimed',
      ownedByViewer,
      handle: ownedByViewer ? (profile?.handle ?? null) : null,
    };
  }
  if (check === 'expired') return { state: 'expired' };
  return { state: 'ready', preview: toPreview(row) };
}

function attribution(row: AgentDraftRow, now: Date) {
  const { acquisition } = row;
  return {
    schema: 'jovie-agent-acquisition/v1',
    draft_id: row.id,
    artist_id: row.artistId,
    agent_source: acquisition.agent_source ?? null,
    client: acquisition.client ?? null,
    installation_id: acquisition.installation_id ?? null,
    session_or_run_id: acquisition.session_or_run_id ?? null,
    intent: acquisition.intent ?? null,
    claimed_at: now.toISOString(),
  };
}

async function chooseHandle(
  tx: DbOrTransaction,
  artistName: string,
  draftId: string
): Promise<string> {
  const base = normalizeArtistNameToHandleBase(artistName).replaceAll('-', '');
  const fallback = `artist${draftId.replaceAll('-', '').slice(0, 8)}`;
  for (const candidateBase of [base, fallback]) {
    if (!candidateBase) continue;
    const handle = await findAvailableHandle(tx, candidateBase);
    if (handle && validateUsername(handle).isValid) return handle;
  }
  throw new Error('Agent draft claim found no free handle');
}

async function requireDelivery(
  event: string,
  delivery: Awaited<ReturnType<typeof trackServerEventTx>>
): Promise<void> {
  if (delivery.ok) return;
  throw new Error(`Agent claim funnel event rejected: ${event}`);
}

class ClaimStateError extends Error {
  constructor(readonly result: AgentClaimResult) {
    super(result.status);
  }
}

/**
 * Profile side of the claim, inside the session-scoped (RLS) transaction.
 * The draft row is deliberately not touched here: `agent_visibility_drafts`
 * is reachable only outside a session (owner-bridge policy), so it is
 * reserved by `reserveAgentDraft` before this runs and released if it fails.
 * The Spotify identity lock and unique index remain the backstop.
 */
async function claimInTransaction(
  tx: DbOrTransaction,
  userId: string,
  row: AgentDraftRow,
  spotifyId: string
): Promise<{ handle: string; profileId: string }> {
  const [owned] = await tx
    .select({ handle: creatorProfiles.usernameNormalized })
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.userId, userId),
        eq(creatorProfiles.isClaimed, true)
      )
    )
    .limit(1);
  if (owned)
    throw new ClaimStateError({ status: 'has_profile', handle: owned.handle });

  const now = new Date();
  const artist = row.preview;
  const handle = await chooseHandle(tx, artist.display_name, row.id);
  const [created] = await tx
    .insert(creatorProfiles)
    .values({
      creatorType: 'artist',
      username: handle,
      usernameNormalized: handle,
      // RLS: an authenticated insert must name the session user; the row
      // stays an unclaimed reservation until claimPrebuiltProfileForUser.
      userId,
      displayName: artist.display_name,
      bio: artist.bio,
      avatarUrl: trustedImageUrl(artist.image_url),
      isPublic: false,
      isClaimed: false,
      ingestionSourcePlatform: 'agent_draft',
      settings: { [AGENT_ACQUISITION_SETTINGS_KEY]: attribution(row, now) },
      theme: {},
      ingestionStatus: 'idle',
    })
    .returning({ id: creatorProfiles.id });
  if (!created)
    throw new Error('Agent draft claim profile insert returned no row');

  // Same lock + exact-ID recheck every Spotify attach takes.
  await assertSpotifyProfileIdentityAvailable(tx, spotifyId, created.id);
  await tx
    .update(creatorProfiles)
    .set({
      spotifyId,
      spotifyUrl: `https://open.spotify.com/artist/${spotifyId}`,
      updatedAt: now,
    })
    .where(eq(creatorProfiles.id, created.id));

  // Same waitlist gate onboarding applies before a signup completes.
  try {
    await markWaitlistSignedUpInTx(tx, userId);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Approved waitlist access is required')
    )
      throw new ClaimStateError({ status: 'waitlist_pending' });
    throw error;
  }

  await claimPrebuiltProfileForUser(tx, {
    userId,
    creatorProfileId: created.id,
    expectedUsername: handle,
    displayName: artist.display_name,
    source: AGENT_DRAFT_CLAIM_SOURCE,
    finalizeOnboarding: true,
    publish: false,
  });

  await requireDelivery(
    'claim_completed',
    await trackServerEventTx(
      tx,
      'claim_completed',
      { profileId: created.id, source: AGENT_DRAFT_CLAIM_SOURCE },
      { eventIdentity: `claim_completed:${created.id}` }
    )
  );
  await requireDelivery(
    'activation_achieved',
    await trackServerEventTx(
      tx,
      'activation_achieved',
      { profileId: created.id, source: AGENT_DRAFT_CLAIM_SOURCE },
      { eventIdentity: `activation_achieved:${created.id}` }
    )
  );
  return { handle, profileId: created.id };
}

/**
 * Claim for the signed-in session user. Every non-success outcome is a
 * typed state the page renders with a next action (JOV-INV-046).
 */
export async function claimAgentDraft(
  draftId: string,
  handoff: string,
  userId: string,
  reviewedDigest: string
): Promise<AgentClaimResult> {
  const row = await loadDraft(draftId);
  const check = checkAgentClaimHandoff(row, handoff);
  if (check === 'invalid' || !row) return { status: 'invalid' };
  if (check === 'expired') return { status: 'expired' };

  // A committed profile for this draft is the source of truth for ownership
  // and lets the owner's revisit finish materialization. It is checked for
  // 'valid' too: a lost acknowledgement may have released the reservation
  // after the profile committed.
  const prior = await findClaimedProfileForDraft(db, row.id);
  if (prior) {
    if (prior.userId !== userId) return { status: 'already_claimed' };
    if (check === 'valid') await reserveAgentDraft(row, new Date());
    await materializeAgentDraftRelease(row, prior.id, userId);
    return { status: 'claimed', handle: prior.handle };
  }
  // Claimed with no profile: an in-flight claim, or an abandoned one that may
  // be taken over once stale (and only while the draft is unexpired).
  const staleClaimedAt =
    check === 'claimed' && isStaleReservation(row) ? row.claimedAt : null;
  if (check === 'claimed' && !staleClaimedAt)
    return { status: 'already_claimed' };
  if (agentDraftPreviewDigest(row.preview) !== reviewedDigest)
    return { status: 'draft_changed' };

  const artist = row.preview;
  if (artist.provider !== 'spotify') return { status: 'unsupported_provider' };
  const spotifyId = artist.external_id;
  if (isBlacklistedSpotifyId(spotifyId)) return { status: 'blocked_artist' };

  const existing = await db
    .select({
      handle: creatorProfiles.usernameNormalized,
      userId: creatorProfiles.userId,
      isClaimed: creatorProfiles.isClaimed,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.spotifyId, spotifyId))
    .limit(2);
  if (existing.some(profile => profile.isClaimed && profile.userId !== userId))
    return { status: 'artist_taken' };
  const own = existing.find(profile => profile.userId === userId);
  if (own?.isClaimed) return { status: 'has_profile', handle: own.handle };
  const unclaimed = existing.find(profile => !profile.isClaimed);
  if (unclaimed)
    return { status: 'existing_profile', handle: unclaimed.handle };

  // Unknown reach fails closed: it cannot prove the artist is below the
  // self-serve threshold, so it goes to the existing verification path.
  const { followers } = await lookupArtistReach(spotifyId);
  if (followers === null || requiresClaimVerification(followers))
    return { status: 'verification_required', spotifyId };

  if (await isWaitlistGateEnabled()) {
    const [viewer] = await db
      .select({ userStatus: users.userStatus })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!viewer || !WAITLIST_CLEARED_STATUSES.has(viewer.userStatus))
      return { status: 'waitlist_pending' };
  }

  const reservedAt = new Date();
  if (!(await reserveAgentDraft(row, reservedAt, staleClaimedAt))) {
    const latest = await loadDraft(row.id);
    return latest?.claimedAt
      ? { status: 'already_claimed' }
      : { status: 'draft_changed' };
  }

  let claimed: { handle: string; profileId: string };
  try {
    claimed = await withDbSessionTx(async (tx, sessionUserId) => {
      if (sessionUserId !== userId) throw new Error('Session mismatch');
      return claimInTransaction(tx, userId, row, spotifyId);
    });
  } catch (error) {
    // The transaction may have committed even though the call threw (lost
    // acknowledgement). Never release a reservation that backs a profile.
    let committed: Awaited<ReturnType<typeof findClaimedProfileForDraft>>;
    try {
      committed = await findClaimedProfileForDraft(db, row.id);
    } catch {
      // Unknown outcome: keep the reservation; it becomes stale-reclaimable.
      throw error;
    }
    if (committed?.userId === userId) {
      try {
        await materializeAgentDraftRelease(row, committed.id, userId);
      } catch (materializeError) {
        await captureError(
          'Agent draft release materialization failed',
          materializeError,
          { route: '/claim/agent' }
        );
      }
      return { status: 'claimed', handle: committed.handle };
    }
    if (committed) throw error;
    await releaseAgentDraft(row.id, reservedAt);
    if (
      error instanceof SpotifyProfileIdentityConflictError ||
      isUniqueViolation(error, 'creator_profiles_spotify_id_unique')
    )
      return { status: 'artist_taken' };
    if (error instanceof ClaimStateError) return error.result;
    throw error;
  }

  await Promise.allSettled([
    invalidateProfileCache(claimed.handle),
    invalidateProxyUserStateCache(userId),
  ]);
  try {
    await materializeAgentDraftRelease(row, claimed.profileId, userId);
  } catch (error) {
    // The claim is committed; the owner's next visit retries this.
    await captureError('Agent draft release materialization failed', error, {
      route: '/claim/agent',
    });
  }
  return { status: 'claimed', handle: claimed.handle };
}
