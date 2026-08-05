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

export interface CollaboratorProfileReconciliationResult {
  readonly candidates: number;
  readonly created: number;
  readonly deferred: boolean;
  readonly reused: number;
  readonly conflicted: number;
  readonly metadataUnavailable: number;
}

interface CandidateOutcome {
  readonly status: 'created' | 'reused' | 'conflicted';
  readonly handle?: string;
}

interface LockedRegistryArtist {
  readonly id: string;
  readonly metadata: Record<string, unknown> | null;
  readonly spotifyId: string | null;
}

const MAX_CREDITED_ARTISTS_PER_RECONCILIATION = 24;
const PROFILE_RECONCILIATION_CONFLICT_KEY = 'publicProfileReconciliation';

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
        ...(artist.metadata ?? {}),
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
  spotifyArtist: SpotifyArtistProfileData | undefined
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

      if (!lockedArtist || lockedArtist.spotifyId !== candidate.spotifyId) {
        return { status: 'conflicted' };
      }
      if (lockedArtist.creatorProfileId) {
        return { status: 'reused' };
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
        };
      }

      const handle = buildUnclaimedArtistHandle(candidate.artistId);
      const [handleOwner] = await tx
        .select({ id: creatorProfiles.id })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.usernameNormalized, handle))
        .limit(1);

      // The handle encodes the full registry UUID, so an occupied handle with
      // no exact Spotify-ID match indicates corrupted or manually forged data.
      if (handleOwner) {
        await markArtistProfileConflict(tx, lockedArtist, 'handle_collision');
        return { status: 'conflicted' };
      }

      const displayName = spotifyArtist?.name?.trim() || lockedArtist.name;
      const avatarUrl =
        spotifyArtist?.images?.find(image => image.url.trim())?.url ??
        lockedArtist.imageUrl;
      const spotifyUrl = buildSpotifyArtistUrl(candidate.spotifyId);
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

      return { status: 'created', handle: createdProfile.usernameNormalized };
    },
    { isolationLevel: 'serializable' }
  );
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

  let created = 0;
  let reused = 0;
  let conflicted = 0;
  let metadataUnavailable = 0;
  const handlesToInvalidate = new Set<string>();

  for (const { candidate, spotifyArtist } of plan) {
    if (!spotifyArtist) metadataUnavailable += 1;

    try {
      const outcome = await reconcileCandidate(candidate, spotifyArtist);
      if (outcome.status === 'created') created += 1;
      else if (outcome.status === 'reused') reused += 1;
      else conflicted += 1;
      if (outcome.handle) handlesToInvalidate.add(outcome.handle);
    } catch (error) {
      conflicted += 1;
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
      {
        source: 'spotify_release_credit',
        creatorProfileId,
        ...result,
      }
    );
  }

  if (candidateSelection.deferred) {
    await captureWarning('Credited artist profile reconciliation was bounded', {
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
    const cacheResults = await Promise.allSettled(
      [...handlesToInvalidate].map(handle => invalidateProfileCache(handle))
    );
    const failedHandles = [...handlesToInvalidate].filter(
      (_, index) => cacheResults[index]?.status === 'rejected'
    );
    if (failedHandles.length > 0) {
      // CLI backfills have no Next static-generation store. The identity writes
      // are already committed and must retain an accurate success receipt;
      // cache refresh remains observable best-effort for the next request.
      await Promise.allSettled([
        captureWarning('Credited artist profile cache invalidation deferred', {
          source: 'spotify_release_credit',
          creatorProfileId,
          failedHandles,
        }),
      ]);
    }
  }

  return result;
}
