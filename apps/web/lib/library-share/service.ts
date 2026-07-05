import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { BASE_URL } from '@/constants/app';
import { db } from '@/lib/db';
import {
  discogRecordings,
  discogReleases,
  discogReleaseTracks,
} from '@/lib/db/schema/content';
import {
  type LibraryShareDropLayout,
  libraryShareDropItems,
  libraryShareDrops,
} from '@/lib/db/schema/library-share-drops';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { LIBRARY_SHARE_DROP_ROUTE_PREFIX } from './constants';
import { hashLibrarySharePassphrase } from './passphrase';
import { generateLibraryShareDropToken } from './token';
import type {
  CreateLibraryShareDropInput,
  CreateLibraryShareDropResult,
  LibraryShareDropAsset,
  LibraryShareDropPublicView,
} from './types';

function isDropExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() <= Date.now();
}

function buildShareUrl(token: string): string {
  return `${BASE_URL}${LIBRARY_SHARE_DROP_ROUTE_PREFIX}/${token}`;
}

function normalizeHttpUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

async function loadDropAssets(
  dropId: string,
  artistHandle: string
): Promise<LibraryShareDropAsset[]> {
  const rows = await db
    .select({
      itemId: libraryShareDropItems.id,
      releaseId: libraryShareDropItems.releaseId,
      position: libraryShareDropItems.position,
      includeArtwork: libraryShareDropItems.includeArtwork,
      includePreview: libraryShareDropItems.includePreview,
      includeLyrics: libraryShareDropItems.includeLyrics,
      title: discogReleases.title,
      releaseType: discogReleases.releaseType,
      releaseDate: discogReleases.releaseDate,
      artworkUrl: discogReleases.artworkUrl,
      releaseMetadata: discogReleases.metadata,
      previewUrl: discogRecordings.previewUrl,
      audioUrl: discogRecordings.audioUrl,
      recordingLyrics: discogRecordings.lyrics,
      slug: discogReleases.slug,
      artistName: creatorProfiles.displayName,
    })
    .from(libraryShareDropItems)
    .innerJoin(
      discogReleases,
      eq(libraryShareDropItems.releaseId, discogReleases.id)
    )
    .innerJoin(
      creatorProfiles,
      eq(discogReleases.creatorProfileId, creatorProfiles.id)
    )
    .leftJoin(
      discogReleaseTracks,
      and(
        eq(discogReleaseTracks.releaseId, discogReleases.id),
        eq(discogReleaseTracks.discNumber, 1),
        eq(discogReleaseTracks.trackNumber, 1)
      )
    )
    .leftJoin(
      discogRecordings,
      eq(discogReleaseTracks.recordingId, discogRecordings.id)
    )
    .where(eq(libraryShareDropItems.dropId, dropId))
    .orderBy(asc(libraryShareDropItems.position));

  return rows.map(row => {
    const metadataLyrics = (
      row.releaseMetadata as Record<string, unknown> | null
    )?.lyrics;
    const lyrics =
      row.recordingLyrics?.trim() ||
      (typeof metadataLyrics === 'string' ? metadataLyrics.trim() : '') ||
      null;

    return {
      id: row.itemId,
      releaseId: row.releaseId,
      title: row.title,
      artistName: row.artistName?.trim() || 'Unknown Artist',
      artworkUrl: normalizeHttpUrl(row.artworkUrl),
      previewUrl: normalizeHttpUrl(row.previewUrl ?? row.audioUrl),
      lyrics: row.includeLyrics ? lyrics : null,
      releaseType: row.releaseType,
      releaseDate: row.releaseDate?.toISOString() ?? null,
      smartLinkPath: `/${artistHandle}/${row.slug}`,
      includeArtwork: row.includeArtwork,
      includePreview: row.includePreview,
      includeLyrics: row.includeLyrics,
    };
  });
}

export async function createLibraryShareDrop(
  profileId: string,
  input: CreateLibraryShareDropInput
): Promise<CreateLibraryShareDropResult> {
  const uniqueReleaseIds = [...new Set(input.releaseIds)];
  if (uniqueReleaseIds.length === 0) {
    throw new Error('At least one release is required');
  }

  const ownedReleases = await db
    .select({ id: discogReleases.id })
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.creatorProfileId, profileId),
        inArray(discogReleases.id, uniqueReleaseIds),
        isNull(discogReleases.deletedAt)
      )
    );

  if (ownedReleases.length !== uniqueReleaseIds.length) {
    throw new Error('One or more releases are not available for sharing');
  }

  const token = generateLibraryShareDropToken();
  const passphrase = input.passphrase?.trim() ?? '';
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;

  const [drop] = await db
    .insert(libraryShareDrops)
    .values({
      token,
      creatorProfileId: profileId,
      title: input.title.trim(),
      message: input.message?.trim() || null,
      layout: (input.layout ?? 'grid') as LibraryShareDropLayout,
      downloadsEnabled: input.downloadsEnabled ?? true,
      passphraseHash: passphrase
        ? hashLibrarySharePassphrase(passphrase)
        : null,
      expiresAt,
    })
    .returning({ id: libraryShareDrops.id, token: libraryShareDrops.token });

  await db.insert(libraryShareDropItems).values(
    uniqueReleaseIds.map((releaseId, index) => ({
      dropId: drop.id,
      releaseId,
      position: index,
    }))
  );

  return {
    id: drop.id,
    token: drop.token,
    shareUrl: buildShareUrl(drop.token),
  };
}

async function getLibraryShareDropRecord(
  token: string,
  options?: { readonly includeInactive?: boolean }
): Promise<{
  readonly drop: typeof libraryShareDrops.$inferSelect;
  readonly artistName: string;
  readonly artistHandle: string;
  readonly artistAvatarUrl: string | null;
} | null> {
  const [row] = await db
    .select({
      drop: libraryShareDrops,
      artistName: creatorProfiles.displayName,
      artistHandle: creatorProfiles.username,
      artistAvatarUrl: creatorProfiles.avatarUrl,
    })
    .from(libraryShareDrops)
    .innerJoin(
      creatorProfiles,
      eq(libraryShareDrops.creatorProfileId, creatorProfiles.id)
    )
    .where(
      options?.includeInactive
        ? eq(libraryShareDrops.token, token)
        : and(
            eq(libraryShareDrops.token, token),
            eq(libraryShareDrops.isActive, true)
          )
    )
    .limit(1);

  if (!row) return null;

  return {
    drop: row.drop,
    artistName: row.artistName?.trim() || 'Artist',
    artistHandle: row.artistHandle,
    artistAvatarUrl: normalizeHttpUrl(row.artistAvatarUrl),
  };
}

export async function getLibraryShareDropByToken(token: string): Promise<{
  readonly drop: typeof libraryShareDrops.$inferSelect;
  readonly artistName: string;
  readonly artistHandle: string;
  readonly artistAvatarUrl: string | null;
} | null> {
  const record = await getLibraryShareDropRecord(token);
  if (!record) return null;
  if (isDropExpired(record.drop.expiresAt)) return null;
  return record;
}

export async function buildLibraryShareDropPublicView(
  token: string
): Promise<LibraryShareDropPublicView | null> {
  const record = await getLibraryShareDropRecord(token);
  if (!record) return null;

  const expired = isDropExpired(record.drop.expiresAt);
  const assets = expired
    ? []
    : await loadDropAssets(record.drop.id, record.artistHandle);

  return {
    token: record.drop.token,
    title: record.drop.title,
    message: record.drop.message,
    layout: record.drop.layout,
    downloadsEnabled: record.drop.downloadsEnabled,
    requiresPassphrase: Boolean(record.drop.passphraseHash),
    isExpired: expired || !record.drop.isActive,
    artistName: record.artistName,
    artistHandle: record.artistHandle,
    artistAvatarUrl: record.artistAvatarUrl,
    accentColor: record.drop.accentColor,
    logoUrl: record.drop.logoUrl,
    darkMode: record.drop.darkMode,
    assets,
  };
}

export async function verifyLibraryShareDropPassphrase(
  token: string,
  passphrase: string
): Promise<boolean> {
  const record = await getLibraryShareDropByToken(token);
  if (!record?.drop.passphraseHash) return true;
  const { verifyLibrarySharePassphrase } = await import('./passphrase');
  return verifyLibrarySharePassphrase(passphrase, record.drop.passphraseHash);
}
