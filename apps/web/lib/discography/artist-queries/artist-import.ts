/**
 * Artist Import Operations
 *
 * Batch operations for processing artist credits during import.
 * All operations are wrapped in transactions for atomicity.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { discogRecordings } from '@/lib/db/schema/content';
import { captureWarning } from '@/lib/error-tracking';
import type { ParsedArtistCredit } from '../artist-parser';
import { findOrCreateArtist } from './artist-crud';
import {
  deleteRecordingArtistRole,
  deleteRecordingArtists,
  getRecordingArtistCreditEdges,
  upsertRecordingArtist,
} from './recording-artists';
import { deleteReleaseArtists, upsertReleaseArtist } from './release-artists';
import { deleteTrackArtists, upsertTrackArtist } from './track-artists';
import type { ArtistWithRole } from './types';

type ArtistImportSourceType = 'manual' | 'admin' | 'ingested';

type ArtistImportOptions = {
  deleteExisting?: boolean;
  sourceType?: ArtistImportSourceType;
  provider?: 'spotify' | 'apple_music' | 'musicbrainz' | 'deezer';
  sourceEntityId?: string | null;
};

function providerCreditMetadata(
  credit: ParsedArtistCredit,
  options: ArtistImportOptions
): Record<string, unknown> | undefined {
  if (!options.provider) return undefined;

  return {
    [options.provider]: {
      sourceEntityId: options.sourceEntityId ?? null,
      providerArtistId:
        options.provider === 'spotify'
          ? (credit.spotifyId ?? null)
          : options.provider === 'apple_music'
            ? (credit.appleMusicId ?? null)
            : null,
      observedRole: credit.observedRole ?? credit.role,
      canonicalRole: credit.role,
      authority:
        credit.roleSource === 'title'
          ? 'explicit_title'
          : 'provider_presentation',
      conflict:
        credit.observedRole && credit.observedRole !== credit.role
          ? 'role_mismatch'
          : null,
    },
  };
}

function hasExplicitTitleAuthority(
  metadata: Record<string, unknown> | null
): boolean {
  return Object.values(metadata ?? {}).some(value => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }
    return (value as Record<string, unknown>).authority === 'explicit_title';
  });
}

/**
 * Process parsed artist credits for a track
 *
 * Creates/updates artist records and track-artist relationships.
 * The neon-http driver does not support transactions.
 */
export async function processTrackArtistCredits(
  trackId: string,
  credits: ParsedArtistCredit[],
  options?: ArtistImportOptions
): Promise<ArtistWithRole[]> {
  const { deleteExisting = true, sourceType = 'ingested' } = options ?? {};

  // Delete existing relationships if requested
  if (deleteExisting) {
    await deleteTrackArtists(trackId, db);
  }

  const results: ArtistWithRole[] = [];

  for (const credit of credits) {
    // Find or create the artist
    const artist = await findOrCreateArtist(
      {
        name: credit.name,
        spotifyId: credit.spotifyId,
        appleMusicId: credit.appleMusicId,
        imageUrl: credit.imageUrl,
        isAutoCreated: sourceType === 'ingested',
      },
      db
    );

    // Create the track-artist relationship
    await upsertTrackArtist(
      {
        trackId,
        artistId: artist.id,
        role: credit.role,
        joinPhrase: credit.joinPhrase,
        position: credit.position,
        isPrimary: credit.isPrimary,
        sourceType,
        metadata: providerCreditMetadata(credit, options ?? {}),
      },
      db
    );

    results.push({
      ...artist,
      role: credit.role,
      creditName: null,
      joinPhrase: credit.joinPhrase,
      position: credit.position,
      isPrimary: credit.isPrimary,
    });
  }

  return results;
}

/**
 * Process parsed artist credits for a release
 *
 * The neon-http driver does not support transactions.
 */
export async function processReleaseArtistCredits(
  releaseId: string,
  credits: ParsedArtistCredit[],
  options?: ArtistImportOptions
): Promise<ArtistWithRole[]> {
  const { deleteExisting = true, sourceType = 'ingested' } = options ?? {};

  if (deleteExisting) {
    await deleteReleaseArtists(releaseId, db);
  }

  const results: ArtistWithRole[] = [];

  for (const credit of credits) {
    const artist = await findOrCreateArtist(
      {
        name: credit.name,
        spotifyId: credit.spotifyId,
        appleMusicId: credit.appleMusicId,
        imageUrl: credit.imageUrl,
        isAutoCreated: sourceType === 'ingested',
      },
      db
    );

    await upsertReleaseArtist(
      {
        releaseId,
        artistId: artist.id,
        role: credit.role,
        joinPhrase: credit.joinPhrase,
        position: credit.position,
        isPrimary: credit.isPrimary,
        sourceType,
        metadata: providerCreditMetadata(credit, options ?? {}),
      },
      db
    );

    results.push({
      ...artist,
      role: credit.role,
      creditName: null,
      joinPhrase: credit.joinPhrase,
      position: credit.position,
      isPrimary: credit.isPrimary,
    });
  }

  return results;
}

/**
 * Process parsed artist credits for a recording
 *
 * Creates/updates artist records and recording-artist relationships.
 * The neon-http driver does not support transactions.
 */
export async function processRecordingArtistCredits(
  recordingId: string,
  credits: ParsedArtistCredit[],
  options?: ArtistImportOptions
): Promise<ArtistWithRole[]> {
  const { deleteExisting = true, sourceType = 'ingested' } = options ?? {};

  if (deleteExisting) {
    await deleteRecordingArtists(recordingId, db);
  }

  const results: ArtistWithRole[] = [];

  for (const credit of credits) {
    const artist = await findOrCreateArtist(
      {
        name: credit.name,
        spotifyId: credit.spotifyId,
        appleMusicId: credit.appleMusicId,
        imageUrl: credit.imageUrl,
        isAutoCreated: sourceType === 'ingested',
      },
      db
    );

    const existingEdges = options?.provider
      ? await getRecordingArtistCreditEdges(recordingId, artist.id, db)
      : [];
    const existingMainEdge = existingEdges.find(
      edge => edge.role === 'main_artist'
    );
    const explicitRole = existingEdges.find(
      edge =>
        edge.role !== 'main_artist' && hasExplicitTitleAuthority(edge.metadata)
    )?.role;

    if (credit.role === 'main_artist' && explicitRole) {
      await upsertRecordingArtist(
        {
          recordingId,
          artistId: artist.id,
          role: explicitRole,
          joinPhrase: credit.joinPhrase,
          position: credit.position,
          isPrimary: false,
          sourceType,
          metadata: providerCreditMetadata(
            {
              ...credit,
              role: explicitRole,
              observedRole: 'main_artist',
            },
            options ?? {}
          ),
        },
        db
      );
      void captureWarning('Artist credit provider role mismatch', {
        source: 'artist_credit_reconciliation',
        recordingId,
        artistId: artist.id,
        artistName: artist.name,
        provider: options?.provider ?? 'unknown',
        observedRole: credit.role,
        canonicalRole: explicitRole,
      });
      continue;
    }

    if (
      credit.role !== 'main_artist' &&
      credit.observedRole === 'main_artist'
    ) {
      if (existingMainEdge) {
        await upsertRecordingArtist(
          {
            recordingId,
            artistId: artist.id,
            role: credit.role,
            joinPhrase: credit.joinPhrase,
            position: credit.position,
            isPrimary: credit.isPrimary,
            sourceType,
            metadata: {
              ...(existingMainEdge.metadata ?? {}),
              ...(providerCreditMetadata(credit, options ?? {}) ?? {}),
            },
          },
          db
        );
        await deleteRecordingArtistRole(
          recordingId,
          artist.id,
          'main_artist',
          db
        );
        results.push({
          ...artist,
          role: credit.role,
          creditName: null,
          joinPhrase: credit.joinPhrase,
          position: credit.position,
          isPrimary: credit.isPrimary,
        });
      }
      void captureWarning('Artist credit provider role mismatch', {
        source: 'artist_credit_reconciliation',
        recordingId,
        artistId: artist.id,
        artistName: artist.name,
        provider: options?.provider ?? 'unknown',
        observedRole: credit.observedRole,
        canonicalRole: credit.role,
      });
      if (existingMainEdge) continue;
    }

    await upsertRecordingArtist(
      {
        recordingId,
        artistId: artist.id,
        role: credit.role,
        joinPhrase: credit.joinPhrase,
        position: credit.position,
        isPrimary: credit.isPrimary,
        sourceType,
        metadata: providerCreditMetadata(credit, options ?? {}),
      },
      db
    );

    results.push({
      ...artist,
      role: credit.role,
      creditName: null,
      joinPhrase: credit.joinPhrase,
      position: credit.position,
      isPrimary: credit.isPrimary,
    });
  }

  return results;
}

export async function processProviderRecordingArtistCredits(input: {
  readonly creatorProfileId: string;
  readonly isrc: string;
  readonly provider: NonNullable<ArtistImportOptions['provider']>;
  readonly sourceEntityId?: string | null;
  readonly credits: ParsedArtistCredit[];
}): Promise<boolean> {
  const [recording] = await db
    .select({ id: discogRecordings.id })
    .from(discogRecordings)
    .where(
      and(
        eq(discogRecordings.creatorProfileId, input.creatorProfileId),
        eq(discogRecordings.isrc, input.isrc)
      )
    )
    .limit(1);

  if (!recording) return false;

  await processRecordingArtistCredits(recording.id, input.credits, {
    deleteExisting: false,
    sourceType: 'ingested',
    provider: input.provider,
    sourceEntityId: input.sourceEntityId,
  });
  return true;
}
