import 'server-only';

import {
  and,
  sql as drizzleSql,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
} from 'drizzle-orm';
import { invalidateProfileCache } from '@/lib/cache/profile';
import type { DbOrTransaction } from '@/lib/db';
import { db } from '@/lib/db';
import {
  artists,
  discogReleases,
  releaseArtists,
} from '@/lib/db/schema/content';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureWarning } from '@/lib/error-tracking';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { publicReleaseEligibilitySqlPredicate } from '@/lib/profile/public-release-eligibility';
import { lockSpotifyProfileIdentity } from '@/lib/profile/spotify-profile-identity';
import { buildStructuredCreditProfileMarker } from '@/lib/profile/unclaimed-artist-profile';
import { buildSpotifyArtistUrl, getSpotifyArtistsBatch } from '@/lib/spotify';
import { logger } from '@/lib/utils/logger';
import { PUBLIC_ARTIST_COLLABORATOR_ROLES } from './artist-credit-policy';
import { buildUnclaimedArtistHandle } from './artist-profile-routing';
import {
  buildCreditedArtistReconciliationPlan,
  type CreditedArtistCandidate,
  type SpotifyArtistProfileData,
} from './collaborator-profile-plan';
import { composeFriendlyArtistHandleCandidates } from './friendly-artist-handle';
import {
  buildInitialUnclaimedEnrichmentReceipt,
  enrichUnclaimedArtistProfileIdentity,
  lookupUnclaimedArtistIdentity,
  type UnclaimedArtistIdentityLookup,
} from './unclaimed-artist-enrichment';
import {
  evaluateUnclaimedArtistIdentity,
  observationsFromMusicFetchArtist,
  UNCLAIMED_IDENTITY_ENRICHMENT_KEY,
} from './unclaimed-artist-identity';

export interface CollaboratorProfileReconciliationResult {
  readonly candidates: number;
  readonly created: number;
  readonly deferred: boolean;
  readonly reused: number;
  readonly conflicted: number;
  readonly metadataUnavailable: number;
}

export interface UnclaimedArtistProfileEnsureResult {
  readonly status: 'created' | 'reused' | 'conflicted' | 'unavailable';
  readonly handle: string | null;
}

interface CandidateOutcome {
  readonly status: 'created' | 'reused' | 'conflicted';
  readonly handle?: string;
  /** Bound profile when the artist now has one (created or reused). */
  readonly profileId?: string;
}

interface CandidateReconciliationState {
  conflicted: number;
  created: number;
  metadataUnavailable: number;
  reused: number;
  readonly handlesToInvalidate: Set<string>;
}

interface LockedRegistryArtist {
  readonly id: string;
  readonly metadata: Record<string, unknown> | null;
  readonly spotifyId: string | null;
}

const MAX_CREDITED_ARTISTS_PER_RECONCILIATION = 24;
const PROFILE_RECONCILIATION_CONFLICT_KEY = 'publicProfileReconciliation';

function isMissingNextStaticGenerationStore(reason: unknown): boolean {
  return (
    reason instanceof Error &&
    reason.message.includes('static generation store missing')
  );
}

async function getCreditedArtistCandidates(
  creatorProfileId: string,
  ownerSpotifyId: string
): Promise<{
  readonly candidates: CreditedArtistCandidate[];
  readonly deferred: boolean;
}> {
  const rows = await db
    .selectDistinct({
      artistId: artists.id,
      name: artists.name,
      spotifyId: artists.spotifyId,
      imageUrl: artists.imageUrl,
    })
    .from(releaseArtists)
    .innerJoin(discogReleases, eq(releaseArtists.releaseId, discogReleases.id))
    .innerJoin(artists, eq(releaseArtists.artistId, artists.id))
    .where(
      and(
        eq(discogReleases.creatorProfileId, creatorProfileId),
        inArray(releaseArtists.role, PUBLIC_ARTIST_COLLABORATOR_ROLES),
        isNotNull(artists.spotifyId),
        ne(artists.spotifyId, ownerSpotifyId),
        isNull(artists.creatorProfileId),
        drizzleSql`COALESCE(${artists.metadata}->${PROFILE_RECONCILIATION_CONFLICT_KEY}->>'status', '') <> 'conflicted'`,
        publicReleaseEligibilitySqlPredicate()
      )
    )
    .orderBy(artists.id)
    .limit(MAX_CREDITED_ARTISTS_PER_RECONCILIATION + 1);

  const candidates = rows
    .filter(
      (row): row is CreditedArtistCandidate =>
        Boolean(row.spotifyId) && row.spotifyId !== ownerSpotifyId
    )
    .map(row => ({ ...row, spotifyId: row.spotifyId! }))
    .slice(0, MAX_CREDITED_ARTISTS_PER_RECONCILIATION);

  return {
    candidates,
    deferred: rows.length > MAX_CREDITED_ARTISTS_PER_RECONCILIATION,
  };
}

async function bindOwnerRegistryArtist(
  tx: DbOrTransaction,
  creatorProfileId: string,
  spotifyId: string
): Promise<void> {
  await lockSpotifyProfileIdentity(tx, spotifyId);

  const [otherExactProfile] = await tx
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.spotifyId, spotifyId),
        ne(creatorProfiles.id, creatorProfileId)
      )
    )
    .limit(1);
  if (otherExactProfile) {
    throw new Error(
      'Owner Spotify identity requires an explicit verified profile merge'
    );
  }

  const [otherRegistryBinding] = await tx
    .select({ creatorProfileId: artists.creatorProfileId })
    .from(artists)
    .where(
      and(
        eq(artists.spotifyId, spotifyId),
        isNotNull(artists.creatorProfileId),
        ne(artists.creatorProfileId, creatorProfileId)
      )
    )
    .limit(1);
  if (otherRegistryBinding) {
    throw new Error(
      'Owner registry identity requires an explicit verified profile merge'
    );
  }

  await tx
    .update(artists)
    .set({ creatorProfileId, updatedAt: new Date() })
    .where(
      and(eq(artists.spotifyId, spotifyId), isNull(artists.creatorProfileId))
    );
}

async function markArtistProfileConflict(
  tx: DbOrTransaction,
  artist: LockedRegistryArtist,
  reason: 'duplicate_profiles' | 'handle_collision' | 'profile_insert'
): Promise<void> {
  await tx
    .update(artists)
    .set({
      metadata: {
        ...artist.metadata,
        [PROFILE_RECONCILIATION_CONFLICT_KEY]: {
          status: 'conflicted',
          reason,
          spotifyId: artist.spotifyId,
          observedAt: new Date().toISOString(),
        },
      },
      updatedAt: new Date(),
    })
    .where(eq(artists.id, artist.id));
}

async function reconcileCandidate(
  candidate: CreditedArtistCandidate,
  spotifyArtist: SpotifyArtistProfileData | undefined,
  identityLookup?: UnclaimedArtistIdentityLookup
): Promise<CandidateOutcome> {
  return withSystemIngestionSession(
    async tx => {
      // Keep lock ordering identical to onboarding/owner binding: identity
      // advisory lock first, then registry row lock. This avoids a cycle where
      // one transaction owns the row while another owns the identity lock.
      await lockSpotifyProfileIdentity(tx, candidate.spotifyId);

      const [lockedArtist] = await tx
        .select({
          id: artists.id,
          creatorProfileId: artists.creatorProfileId,
          name: artists.name,
          spotifyId: artists.spotifyId,
          imageUrl: artists.imageUrl,
          metadata: artists.metadata,
        })
        .from(artists)
        .where(eq(artists.id, candidate.artistId))
        .for('update')
        .limit(1);

      if (lockedArtist?.spotifyId !== candidate.spotifyId) {
        return { status: 'conflicted' };
      }
      if (lockedArtist.creatorProfileId) {
        return {
          status: 'reused',
          profileId: lockedArtist.creatorProfileId,
        };
      }

      const exactProfiles = await tx
        .select({
          id: creatorProfiles.id,
          usernameNormalized: creatorProfiles.usernameNormalized,
        })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.spotifyId, candidate.spotifyId))
        .limit(2);

      // Multiple exact-ID profiles are an existing data conflict. Never choose
      // one by name, recency, or claimed state; an operator must resolve it.
      if (exactProfiles.length > 1) {
        await markArtistProfileConflict(tx, lockedArtist, 'duplicate_profiles');
        return { status: 'conflicted' };
      }

      const exactProfile = exactProfiles[0];
      if (exactProfile) {
        await tx
          .update(artists)
          .set({
            creatorProfileId: exactProfile.id,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(artists.id, candidate.artistId),
              isNull(artists.creatorProfileId)
            )
          );
        return {
          status: 'reused',
          handle: exactProfile.usernameNormalized,
          profileId: exactProfile.id,
        };
      }

      const spotifyUrl = buildSpotifyArtistUrl(candidate.spotifyId);

      // JOV-6529: evaluate the prefetched identity-source evidence. The
      // evaluation is pure — no I/O inside this serializable transaction —
      // and only exact provider/entity matches feed it.
      const identityEvaluation = identityLookup?.artistData
        ? evaluateUnclaimedArtistIdentity(
            observationsFromMusicFetchArtist(
              identityLookup.artistData,
              spotifyUrl,
              new Date().toISOString()
            )
          )
        : undefined;

      // JOV-6528: compose friendly candidates from the identity signals the
      // exact-ID match already validated, then take the first one that is
      // free. The deterministic opaque `a_*` handle is the last-resort
      // fallback so ingest can never fail closed for lack of a friendly
      // candidate. Handles are resolved in-rank inside the same serializable
      // transaction that inserts the profile — no name-only identity is ever
      // established here.
      const composed = composeFriendlyArtistHandleCandidates({
        registryName: lockedArtist.name,
        providerArtist: spotifyArtist,
        identityHandles: identityEvaluation?.handleEvidence,
      });

      let handle: string | null = null;
      if (composed.accepted.length > 0) {
        const candidateHandles = composed.accepted.map(c => c.handle);
        const takenHandles = await tx
          .select({
            usernameNormalized: creatorProfiles.usernameNormalized,
          })
          .from(creatorProfiles)
          .where(inArray(creatorProfiles.usernameNormalized, candidateHandles));
        const takenSet = new Set(
          takenHandles.map(row => row.usernameNormalized)
        );
        handle =
          candidateHandles.find(candidate => !takenSet.has(candidate)) ?? null;
      }
      if (!handle) {
        handle = buildUnclaimedArtistHandle(candidate.artistId);
      }

      const [handleOwner] = await tx
        .select({ id: creatorProfiles.id })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.usernameNormalized, handle))
        .limit(1);

      // An occupied fallback handle (the encoded full registry UUID) with
      // no exact Spotify-ID match indicates corrupted or manually forged
      // data. An occupied friendly candidate was already skipped above.
      if (handleOwner) {
        await markArtistProfileConflict(tx, lockedArtist, 'handle_collision');
        return { status: 'conflicted' };
      }

      const displayName = spotifyArtist?.name?.trim() || lockedArtist.name;
      const avatarUrl =
        spotifyArtist?.images?.find(image => image.url.trim())?.url ??
        lockedArtist.imageUrl;
      const now = new Date();

      const [createdProfile] = await tx
        .insert(creatorProfiles)
        .values({
          creatorType: 'creator',
          username: handle,
          usernameNormalized: handle,
          displayName,
          avatarUrl,
          spotifyId: candidate.spotifyId,
          spotifyUrl,
          genres: spotifyArtist?.genres ? [...spotifyArtist.genres] : null,
          spotifyFollowers: spotifyArtist?.followers?.total ?? null,
          spotifyPopularity: spotifyArtist?.popularity ?? null,
          isPublic: true,
          isVerified: false,
          isFeatured: false,
          isClaimed: false,
          // Unconsented profiles are excluded from marketing/featured use.
          marketingOptOut: true,
          ingestionStatus: 'idle',
          ingestionSourcePlatform: 'spotify_release_credit',
          settings: {
            unclaimedArtistProfile: buildStructuredCreditProfileMarker({
              artistRegistryId: candidate.artistId,
              providerArtistId: candidate.spotifyId,
            }),
            // Share-readiness receipt starts at not_checked; the bounded
            // enrichment pass rewrites it after commit (JOV-6529).
            [UNCLAIMED_IDENTITY_ENRICHMENT_KEY]:
              buildInitialUnclaimedEnrichmentReceipt({
                providerArtistId: candidate.spotifyId,
                observedAt: now.toISOString(),
              }),
          },
          theme: {},
          createdAt: now,
          updatedAt: now,
        })
        .returning({
          id: creatorProfiles.id,
          usernameNormalized: creatorProfiles.usernameNormalized,
        });

      if (!createdProfile) {
        await markArtistProfileConflict(tx, lockedArtist, 'profile_insert');
        return { status: 'conflicted' };
      }

      await tx
        .insert(socialLinks)
        .values({
          creatorProfileId: createdProfile.id,
          platform: 'spotify',
          platformType: 'spotify',
          url: spotifyUrl,
          displayText: '',
          sortOrder: 0,
          isActive: true,
          state: 'active',
          confidence: '1.00',
          sourcePlatform: 'spotify',
          sourceType: 'ingested',
          evidence: {
            sources: ['structured_spotify_release_credit'],
            signals: [candidate.artistId, candidate.spotifyId],
          },
          verificationStatus: 'unverified',
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing();

      const [boundArtist] = await tx
        .update(artists)
        .set({
          creatorProfileId: createdProfile.id,
          imageUrl: lockedArtist.imageUrl ?? avatarUrl,
          updatedAt: now,
        })
        .where(
          and(
            eq(artists.id, candidate.artistId),
            isNull(artists.creatorProfileId)
          )
        )
        .returning({ id: artists.id });

      if (!boundArtist) {
        throw new Error('Artist profile binding lost its identity lock');
      }

      return {
        status: 'created',
        handle: createdProfile.usernameNormalized,
        profileId: createdProfile.id,
      };
    },
    { isolationLevel: 'serializable' }
  );
}

/**
 * Ensure one exact structured-credit entity has a public, claim-safe profile.
 *
 * The public `/artists/:artistId` route uses this bounded path when an older
 * catalog was rendered before the importer/backfill could materialize the
 * profile. Eligibility is still derived from a public release-credit edge;
 * arbitrary registry rows and name-only identities are never promoted.
 */
export async function ensureUnclaimedArtistProfileForEntity(
  artistId: string
): Promise<UnclaimedArtistProfileEnsureResult> {
  const [candidate] = await db
    .select({
      artistId: artists.id,
      name: artists.name,
      spotifyId: artists.spotifyId,
      imageUrl: artists.imageUrl,
      creatorProfileId: artists.creatorProfileId,
    })
    .from(releaseArtists)
    .innerJoin(discogReleases, eq(releaseArtists.releaseId, discogReleases.id))
    .innerJoin(artists, eq(releaseArtists.artistId, artists.id))
    .innerJoin(
      creatorProfiles,
      eq(discogReleases.creatorProfileId, creatorProfiles.id)
    )
    .where(
      and(
        eq(artists.id, artistId),
        isNull(artists.creatorProfileId),
        isNotNull(artists.spotifyId),
        eq(creatorProfiles.isPublic, true),
        inArray(releaseArtists.role, PUBLIC_ARTIST_COLLABORATOR_ROLES),
        publicReleaseEligibilitySqlPredicate()
      )
    )
    .limit(1);

  if (!candidate?.spotifyId || candidate.creatorProfileId) {
    return { status: 'unavailable', handle: null };
  }

  const candidateSpotifyUrl = buildSpotifyArtistUrl(candidate.spotifyId);
  const [spotifyArtist, identityLookup] = await Promise.all([
    getSpotifyArtistsBatch([candidate.spotifyId]).then(rows => rows[0]),
    lookupUnclaimedArtistIdentity(candidateSpotifyUrl),
  ]);
  let outcome: CandidateOutcome;
  try {
    outcome = await reconcileCandidate(
      {
        artistId: candidate.artistId,
        name: candidate.name,
        spotifyId: candidate.spotifyId,
        imageUrl: candidate.imageUrl,
      },
      spotifyArtist,
      identityLookup
    );
  } catch (error) {
    await captureWarning(
      'Structured artist entity profile ensure failed closed',
      error,
      { source: 'public_artist_entity_route', artistId }
    );
    return { status: 'conflicted', handle: null };
  }

  if (outcome.status === 'conflicted') {
    return { status: 'conflicted', handle: outcome.handle ?? null };
  }

  // Bounded identity enrichment (JOV-6529). Best-effort: a failure must not
  // turn a committed exact-ID binding into a conflict — the receipt stays
  // `not_checked` and the pass retries on the next hit.
  if (outcome.profileId) {
    try {
      await enrichUnclaimedArtistProfileIdentity({
        profileId: outcome.profileId,
        spotifyId: candidate.spotifyId,
        spotifyUrl: candidateSpotifyUrl,
        lookup: identityLookup,
      });
    } catch (error) {
      await captureWarning(
        'Unclaimed artist identity enrichment failed',
        error,
        {
          source: 'public_artist_entity_route',
          artistId,
          profileId: outcome.profileId,
        }
      );
    }
  }

  const [resolved] = await db
    .select({ usernameNormalized: creatorProfiles.usernameNormalized })
    .from(artists)
    .innerJoin(
      creatorProfiles,
      eq(artists.creatorProfileId, creatorProfiles.id)
    )
    .where(and(eq(artists.id, artistId), eq(creatorProfiles.isPublic, true)))
    .limit(1);

  if (!resolved?.usernameNormalized) {
    return { status: 'unavailable', handle: null };
  }

  await invalidateProfileCache(resolved.usernameNormalized).catch(() => {
    // The route still has a committed identity binding; cache refresh is
    // best-effort when this helper runs outside a Next request context.
  });

  return {
    status: outcome.status,
    handle: resolved.usernameNormalized,
  };
}

function recordCandidateOutcome(
  state: CandidateReconciliationState,
  outcome: CandidateOutcome
): void {
  switch (outcome.status) {
    case 'created':
      state.created += 1;
      break;
    case 'reused':
      state.reused += 1;
      break;
    case 'conflicted':
      state.conflicted += 1;
      break;
  }
  if (outcome.handle) state.handlesToInvalidate.add(outcome.handle);
}

async function reconcileCandidatePlan(
  creatorProfileId: string,
  plan: ReturnType<typeof buildCreditedArtistReconciliationPlan>
): Promise<CandidateReconciliationState> {
  const state: CandidateReconciliationState = {
    created: 0,
    reused: 0,
    conflicted: 0,
    metadataUnavailable: 0,
    handlesToInvalidate: new Set<string>(),
  };

  for (const { candidate, spotifyArtist } of plan) {
    if (!spotifyArtist) state.metadataUnavailable += 1;

    const spotifyUrl = buildSpotifyArtistUrl(candidate.spotifyId);
    // Prefetch the identity-source lookup outside any transaction so the
    // serializable profile write never performs network I/O (JOV-6529).
    const identityLookup = await lookupUnclaimedArtistIdentity(spotifyUrl);

    try {
      const outcome = await reconcileCandidate(
        candidate,
        spotifyArtist,
        identityLookup
      );
      recordCandidateOutcome(state, outcome);

      // Enrichment runs post-commit for both created and reused profiles,
      // which is also the idempotent backfill path for profiles minted
      // before the stage existed. It never touches claimed profiles.
      if (
        outcome.profileId &&
        (outcome.status === 'created' || outcome.status === 'reused')
      ) {
        try {
          await enrichUnclaimedArtistProfileIdentity({
            profileId: outcome.profileId,
            spotifyId: candidate.spotifyId,
            spotifyUrl,
            lookup: identityLookup,
          });
        } catch (error) {
          await captureWarning(
            'Unclaimed artist identity enrichment failed',
            error,
            {
              source: 'spotify_release_credit',
              creatorProfileId,
              artistId: candidate.artistId,
              profileId: outcome.profileId,
            }
          );
        }
      }
    } catch (error) {
      state.conflicted += 1;
      await captureWarning(
        'Credited artist profile reconciliation failed closed',
        error,
        {
          creatorProfileId,
          artistId: candidate.artistId,
          spotifyId: candidate.spotifyId,
        }
      );
    }
  }

  return state;
}

/**
 * Reconcile imported Spotify release credits into claim-safe Jovie profiles.
 *
 * Exact provider IDs are the only dedupe key. Missing provider metadata still
 * produces an explicit minimal profile from the canonical registry row; a
 * display name is never used to claim, merge, or reserve a human handle.
 */
export async function reconcileCreditedArtistProfiles(
  creatorProfileId: string,
  ownerSpotifyId: string
): Promise<CollaboratorProfileReconciliationResult> {
  const [owner] = await db
    .select({
      usernameNormalized: creatorProfiles.usernameNormalized,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, creatorProfileId))
    .limit(1);
  await withSystemIngestionSession(tx =>
    bindOwnerRegistryArtist(tx, creatorProfileId, ownerSpotifyId)
  );

  const candidateSelection = await getCreditedArtistCandidates(
    creatorProfileId,
    ownerSpotifyId
  );
  const spotifyArtists = await getSpotifyArtistsBatch(
    candidateSelection.candidates.map(candidate => candidate.spotifyId)
  );
  const plan = buildCreditedArtistReconciliationPlan(
    candidateSelection.candidates,
    spotifyArtists
  );

  const {
    conflicted,
    created,
    handlesToInvalidate,
    metadataUnavailable,
    reused,
  } = await reconcileCandidatePlan(creatorProfileId, plan);

  const result = {
    candidates: plan.length,
    created,
    deferred: candidateSelection.deferred,
    reused,
    conflicted,
    metadataUnavailable,
  };

  if (created > 0 || reused > 0) {
    logger.info('Credited artist profiles reconciled', {
      creatorProfileId,
      ...result,
    });
  }

  if (conflicted > 0) {
    await captureWarning(
      'Credited artist profile identity conflicts detected',
      undefined,
      {
        source: 'spotify_release_credit',
        creatorProfileId,
        ...result,
      }
    );
  }

  // Expected per-run cap. Remaining rows retry on the next import/backfill
  // (`result.deferred`). Passing this receipt as captureWarning's error
  // argument filed Linear as `Error: {"source":"spotify_release_credit",...}`
  // (JOV-5263).
  if (candidateSelection.deferred) {
    logger.info('Credited artist profile reconciliation was bounded', {
      source: 'spotify_release_credit',
      creatorProfileId,
      processed: plan.length,
      limit: MAX_CREDITED_ARTISTS_PER_RECONCILIATION,
      retry: 'next_spotify_import_or_backfill',
    });
  }

  // Refresh both sides of the new relationship: a previously cached owner
  // page must gain the link immediately, and an exact-ID profile may have a
  // cached 404 or stale claim state under its current handle.
  if (created > 0 || reused > 0) {
    if (owner?.usernameNormalized) {
      handlesToInvalidate.add(owner.usernameNormalized);
    }
    const handles = [...handlesToInvalidate];
    const cacheResults = await Promise.allSettled(
      handles.map(handle => invalidateProfileCache(handle))
    );
    const failures = handles.flatMap((handle, index) => {
      const cacheResult = cacheResults[index];
      return cacheResult?.status === 'rejected'
        ? [{ handle, reason: cacheResult.reason }]
        : [];
    });
    if (failures.length > 0) {
      const failedHandles = failures.map(failure => failure.handle);
      // CLI / script callers have no Next static-generation store. Identity
      // writes are already committed; do not file that expected miss as a
      // Sentry exception (JOV-5264 titled the context bag as the error).
      if (
        failures.every(({ reason }) =>
          isMissingNextStaticGenerationStore(reason)
        )
      ) {
        logger.info(
          'Credited artist profile cache invalidation skipped without Next store',
          { creatorProfileId, failedHandles }
        );
      } else {
        const unexpected = failures.find(
          ({ reason }) => !isMissingNextStaticGenerationStore(reason)
        );
        await captureWarning(
          'Credited artist profile cache invalidation deferred',
          unexpected?.reason,
          {
            source: 'spotify_release_credit',
            creatorProfileId,
            failedHandles,
          }
        );
      }
    }
  }

  return result;
}
