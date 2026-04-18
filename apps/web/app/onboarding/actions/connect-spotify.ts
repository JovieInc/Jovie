'use server';

import { and, eq, ne } from 'drizzle-orm';
import {
  unstable_noStore as noStore,
  revalidatePath,
  revalidateTag,
} from 'next/cache';
import { cookies } from 'next/headers';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';
import { invalidateProxyUserStateCache } from '@/lib/auth/proxy-state';
import { withDbSessionTx } from '@/lib/auth/session';
import { invalidateProfileCache } from '@/lib/cache/profile';
import { createSmartLinkContentTag } from '@/lib/cache/tags';
import {
  clearPendingClaimContext,
  readPendingClaimContext,
} from '@/lib/claim/context';
import { claimPrebuiltProfileForUser } from '@/lib/claim/finalize';
import { db } from '@/lib/db';
import { isUniqueViolation } from '@/lib/db/errors';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  type SpotifyImportResult,
  syncReleasesFromSpotify,
} from '@/lib/discography/spotify-import';
import {
  processDspArtistDiscoveryJobStandalone,
  processMusicFetchEnrichmentJob,
} from '@/lib/dsp-enrichment/jobs';
import { isE2EFastOnboardingEnabled } from '@/lib/e2e/runtime';
import { isSecureEnv } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { refreshFeaturedPlaylistFallbackCandidate } from '@/lib/profile/featured-playlist-fallback';
import { trackServerEvent } from '@/lib/server-analytics';
import { runBackgroundSyncOperations } from './sync';

const SPOTIFY_ALREADY_CLAIMED_MESSAGE =
  'This Spotify artist is already linked to another Jovie account. Please sign in with the original account or choose a different artist.';
const DSP_DISCOVERY_PROVIDERS = [
  'apple_music',
  'deezer',
  'musicbrainz',
] as const;

export interface ConnectOnboardingSpotifyArtistParams {
  artistName: string;
  includeTracks?: boolean;
  profileId: string;
  skipMusicFetchEnrichment?: boolean;
  spotifyArtistId: string;
  spotifyArtistUrl: string;
}

export interface ConnectOnboardingSpotifyArtistResult {
  artistName: string;
  imported: number;
  importing: boolean;
  message: string;
  success: boolean;
}

function isSpotifyIdUniqueViolation(error: unknown): boolean {
  return isUniqueViolation(error, 'creator_profiles_spotify_id_unique');
}

function normalizeSpotifyArtistUrl(rawUrl: string, spotifyArtistId: string) {
  const trimmedUrl = rawUrl.trim();
  if (!trimmedUrl) {
    return `https://open.spotify.com/artist/${encodeURIComponent(spotifyArtistId)}`;
  }

  try {
    const parsed = new URL(trimmedUrl);
    const hostOk =
      parsed.hostname === 'open.spotify.com' ||
      parsed.hostname === 'spotify.com' ||
      parsed.hostname.endsWith('.spotify.com');
    const protocolOk = ['http:', 'https:'].includes(parsed.protocol);
    const pathOk = parsed.pathname.includes('/artist/');

    if (protocolOk && hostOk && pathOk) {
      return parsed.toString();
    }
  } catch {
    // Fall back to the canonical Spotify artist URL below.
  }

  return `https://open.spotify.com/artist/${encodeURIComponent(spotifyArtistId)}`;
}

function deriveSpotifyImportStatus(result: SpotifyImportResult) {
  if (result.success || result.releases.length > 0 || result.imported > 0) {
    return 'complete' as const;
  }

  return 'failed' as const;
}

function buildInlineDspDiscoveryDedupKey(
  creatorProfileId: string,
  spotifyArtistId: string
): string {
  return [
    'inline_dsp_discovery',
    creatorProfileId,
    spotifyArtistId,
    [...DSP_DISCOVERY_PROVIDERS].join('|'),
  ].join(':');
}

function buildInlineMusicFetchDedupKey(
  creatorProfileId: string,
  spotifyArtistId: string
): string {
  return [
    'inline_musicfetch_enrichment',
    creatorProfileId,
    spotifyArtistId,
  ].join(':');
}

async function markSpotifyImportFailed(profileId: string): Promise<void> {
  try {
    const [latest] = await db
      .select({ settings: creatorProfiles.settings })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profileId))
      .limit(1);
    const latestSettings = (latest?.settings ?? {}) as Record<string, unknown>;

    await db
      .update(creatorProfiles)
      .set({
        settings: { ...latestSettings, spotifyImportStatus: 'failed' },
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, profileId));
  } catch {
    // Best-effort update inside the error path.
  }
}

async function getOwnedProfile(profileId: string, clerkUserId: string) {
  const [profile] = await db
    .select({
      dbUserId: users.id,
      handle: creatorProfiles.usernameNormalized,
      id: creatorProfiles.id,
      isClaimed: creatorProfiles.isClaimed,
      settings: creatorProfiles.settings,
      spotifyId: creatorProfiles.spotifyId,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(
      and(eq(creatorProfiles.id, profileId), eq(users.clerkId, clerkUserId))
    )
    .limit(1);

  if (!profile) {
    throw new Error('Profile not found');
  }

  return profile;
}

export async function connectOnboardingSpotifyArtist(
  params: ConnectOnboardingSpotifyArtistParams
): Promise<ConnectOnboardingSpotifyArtistResult> {
  noStore();

  const { isBlacklistedSpotifyId } = await import('@/lib/spotify/blacklist');
  if (isBlacklistedSpotifyId(params.spotifyArtistId)) {
    return {
      success: false,
      importing: false,
      message: 'This artist profile is not available for claiming.',
      imported: 0,
      artistName: params.artistName,
    };
  }

  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  const profile = await getOwnedProfile(params.profileId, userId);
  const pendingClaim = await readPendingClaimContext({
    username: profile.handle,
  });
  const isDirectClaimAwaitingMatch =
    pendingClaim?.mode === 'direct_profile' &&
    pendingClaim.creatorProfileId === profile.id &&
    profile.isClaimed !== true;

  if (isDirectClaimAwaitingMatch && !pendingClaim.expectedSpotifyArtistId) {
    return {
      success: false,
      importing: false,
      message: 'This profile needs a claim link before it can be claimed.',
      imported: 0,
      artistName: params.artistName,
    };
  }

  if (
    isDirectClaimAwaitingMatch &&
    pendingClaim.expectedSpotifyArtistId !== params.spotifyArtistId
  ) {
    return {
      success: false,
      importing: false,
      message:
        'Please choose the Spotify artist already attached to this profile.',
      imported: 0,
      artistName: params.artistName,
    };
  }

  const currentSettings = (profile.settings ?? {}) as Record<string, unknown>;
  const [existingClaim] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.spotifyId, params.spotifyArtistId),
        ne(creatorProfiles.id, profile.id)
      )
    )
    .limit(1);

  if (existingClaim) {
    return {
      success: false,
      importing: false,
      message: SPOTIFY_ALREADY_CLAIMED_MESSAGE,
      imported: 0,
      artistName: params.artistName,
    };
  }

  try {
    if (isDirectClaimAwaitingMatch) {
      await withDbSessionTx(
        async tx => {
          await claimPrebuiltProfileForUser(tx, {
            userId: profile.dbUserId,
            creatorProfileId: profile.id,
            expectedUsername: profile.handle,
            displayName:
              params.artistName ||
              (currentSettings.spotifyArtistName as string) ||
              profile.handle,
            source: 'direct_profile_spotify_match',
            finalizeOnboarding: true,
          });

          await tx
            .update(creatorProfiles)
            .set({
              spotifyId: params.spotifyArtistId,
              spotifyUrl: params.spotifyArtistUrl,
              settings: {
                ...currentSettings,
                spotifyArtistName: params.artistName,
                spotifyImportStatus: 'importing',
                spotifyImportTotal: 0,
              },
              updatedAt: new Date(),
            })
            .where(eq(creatorProfiles.id, profile.id));
        },
        { clerkUserId: userId }
      );

      const cookieStore = await cookies();
      cookieStore.set('jovie_onboarding_complete', '1', {
        httpOnly: true,
        secure: isSecureEnv(),
        sameSite: 'lax',
        maxAge: 120,
        path: '/',
      });

      await Promise.allSettled([
        clearPendingClaimContext(),
        invalidateProfileCache(profile.handle),
        invalidateProxyUserStateCache(userId),
      ]);
      runBackgroundSyncOperations(userId, profile.handle);
      void import('./activate-trial')
        .then(({ activateTrial }) => activateTrial(userId))
        .catch(error => {
          void captureError(
            'activateTrial failed after direct profile claim',
            error,
            {
              action: 'connectOnboardingSpotifyArtist',
              creatorProfileId: profile.id,
            }
          );
        });
    } else {
      await db
        .update(creatorProfiles)
        .set({
          spotifyId: params.spotifyArtistId,
          spotifyUrl: params.spotifyArtistUrl,
          settings: {
            ...currentSettings,
            spotifyArtistName: params.artistName,
            spotifyImportStatus: 'importing',
            spotifyImportTotal: 0,
          },
          updatedAt: new Date(),
        })
        .where(eq(creatorProfiles.id, profile.id));
    }
  } catch (error) {
    if (isSpotifyIdUniqueViolation(error)) {
      return {
        success: false,
        importing: false,
        message: SPOTIFY_ALREADY_CLAIMED_MESSAGE,
        imported: 0,
        artistName: params.artistName,
      };
    }

    throw error;
  }

  const finalizeSpotifyImport = async (
    result: SpotifyImportResult
  ): Promise<void> => {
    const spotifyImportStatus = deriveSpotifyImportStatus(result);

    const [latest] = await db
      .select({ settings: creatorProfiles.settings })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profile.id))
      .limit(1);
    const latestSettings = (latest?.settings ?? {}) as Record<string, unknown>;

    await db
      .update(creatorProfiles)
      .set({
        spotifyId: params.spotifyArtistId,
        spotifyUrl: normalizeSpotifyArtistUrl(
          params.spotifyArtistUrl,
          params.spotifyArtistId
        ),
        settings: {
          ...latestSettings,
          spotifyArtistName:
            params.artistName || (latestSettings.spotifyArtistName as string),
          spotifyImportStatus,
          spotifyImportTotal: result.total,
        },
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, profile.id));

    revalidateTag(`releases:${userId}:${profile.id}`, 'max');
    revalidateTag(createSmartLinkContentTag(profile.id), 'max');
    revalidatePath(APP_ROUTES.RELEASES);

    if (!result.success) {
      return;
    }

    void trackServerEvent('releases_synced', {
      profileId: profile.id,
      imported: result.imported,
      source: 'spotify',
      isInitialConnect: true,
    });

    const spotifyUrlForEnrichment = normalizeSpotifyArtistUrl(
      params.spotifyArtistUrl,
      params.spotifyArtistId
    );

    try {
      const discoveryResult = await processDspArtistDiscoveryJobStandalone({
        creatorProfileId: profile.id,
        spotifyArtistId: params.spotifyArtistId,
        targetProviders: DSP_DISCOVERY_PROVIDERS,
        dedupKey: buildInlineDspDiscoveryDedupKey(
          profile.id,
          params.spotifyArtistId
        ),
      });

      if (discoveryResult.errors.length > 0) {
        void captureError(
          'DSP artist discovery inline processing completed with errors on connect',
          new Error(discoveryResult.errors.join('; ')),
          {
            action: 'connectOnboardingSpotifyArtist',
            creatorProfileId: profile.id,
            spotifyArtistId: params.spotifyArtistId,
          }
        );
      }
    } catch (error) {
      void captureError(
        'DSP artist discovery inline processing failed on connect',
        error,
        {
          action: 'connectOnboardingSpotifyArtist',
          creatorProfileId: profile.id,
        }
      );
    }

    if (params.skipMusicFetchEnrichment) {
      return;
    }

    try {
      await processMusicFetchEnrichmentJob(db, {
        creatorProfileId: profile.id,
        spotifyUrl: spotifyUrlForEnrichment,
        dedupKey: buildInlineMusicFetchDedupKey(
          profile.id,
          params.spotifyArtistId
        ),
      });
    } catch (error) {
      void captureError(
        'MusicFetch enrichment inline processing failed on connect',
        error,
        {
          action: 'connectOnboardingSpotifyArtist',
          creatorProfileId: profile.id,
        }
      );
    }

    void refreshFeaturedPlaylistFallbackCandidate({
      profileId: profile.id,
      usernameNormalized: profile.handle,
      artistName: params.artistName,
      artistSpotifyId: params.spotifyArtistId,
    });
  };

  const runSpotifyImport = async (): Promise<SpotifyImportResult> => {
    const fastImportOptions = isE2EFastOnboardingEnabled()
      ? {
          maxReleases: 1,
          maxTracksPerRelease: 6,
        }
      : {};

    return syncReleasesFromSpotify(profile.id, {
      includeTracks: params.includeTracks ?? true,
      ...fastImportOptions,
    });
  };

  try {
    const result = await runSpotifyImport();
    await finalizeSpotifyImport(result);

    return {
      success: result.success,
      importing: false,
      message: result.success
        ? 'Imported releases from Spotify.'
        : 'Spotify import finished with errors.',
      imported: result.imported,
      artistName: params.artistName,
    };
  } catch (error) {
    await markSpotifyImportFailed(profile.id);

    void captureError(
      'Spotify import failed during onboarding connect',
      error,
      {
        action: 'connectOnboardingSpotifyArtist',
        creatorProfileId: profile.id,
      }
    );

    return {
      success: false,
      importing: false,
      message: 'Spotify import failed.',
      imported: 0,
      artistName: params.artistName,
    };
  }
}
