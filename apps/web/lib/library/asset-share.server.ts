import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';
import type { LibraryItemKind } from '@/app/app/(shell)/library/library-data';
import { db } from '@/lib/db';
import { libraryAssetShareSettings } from '@/lib/db/schema/library-asset-share';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  DEFAULT_LIBRARY_ASSET_VISIBILITY,
  deriveLibraryAssetShareSlug,
  type LibraryAssetShareViewModel,
  type LibraryAssetVisibility,
  toLibraryAssetShareViewModel,
} from './asset-share';
import { generateLibraryAssetShareToken } from './asset-share/token';

export interface LibraryAssetShareEnsureInput {
  readonly creatorProfileId: string;
  readonly assetId: string;
  readonly itemKind: LibraryItemKind;
  readonly title: string;
  readonly artistHandle: string;
  readonly smartLinkPath?: string;
}

async function loadArtistHandle(
  creatorProfileId: string
): Promise<string | null> {
  const [profile] = await db
    .select({
      handle: creatorProfiles.usernameNormalized,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, creatorProfileId))
    .limit(1);

  return profile?.handle?.trim() || null;
}

function rowToViewModel(
  row: typeof libraryAssetShareSettings.$inferSelect,
  artistHandle: string,
  smartLinkPath?: string,
  itemKind?: LibraryItemKind
): LibraryAssetShareViewModel {
  return toLibraryAssetShareViewModel({
    assetId: row.assetId,
    visibility: row.visibility,
    shareSlug: row.shareSlug,
    accessToken: row.accessToken,
    artistHandle,
    itemKind: itemKind ?? (row.itemKind as LibraryItemKind),
    smartLinkPath,
    tokenRevokedAt: row.tokenRevokedAt,
  });
}

export async function getLibraryAssetShareMapForProfile(
  creatorProfileId: string,
  artistHandle: string
): Promise<ReadonlyMap<string, LibraryAssetShareViewModel>> {
  const rows = await db
    .select()
    .from(libraryAssetShareSettings)
    .where(eq(libraryAssetShareSettings.creatorProfileId, creatorProfileId));

  return new Map(
    rows.map(row => [
      row.assetId,
      rowToViewModel(
        row,
        artistHandle,
        undefined,
        row.itemKind as LibraryItemKind
      ),
    ])
  );
}

async function selectLibraryAssetShareRow(
  creatorProfileId: string,
  assetId: string
): Promise<typeof libraryAssetShareSettings.$inferSelect | undefined> {
  const [row] = await db
    .select()
    .from(libraryAssetShareSettings)
    .where(
      and(
        eq(libraryAssetShareSettings.creatorProfileId, creatorProfileId),
        eq(libraryAssetShareSettings.assetId, assetId)
      )
    )
    .limit(1);

  return row;
}

export async function ensureLibraryAssetShareSettings(
  input: LibraryAssetShareEnsureInput
): Promise<LibraryAssetShareViewModel> {
  const existing = await selectLibraryAssetShareRow(
    input.creatorProfileId,
    input.assetId
  );

  if (existing) {
    return rowToViewModel(
      existing,
      input.artistHandle,
      input.smartLinkPath,
      input.itemKind
    );
  }

  const shareSlug = deriveLibraryAssetShareSlug({
    assetId: input.assetId,
    itemKind: input.itemKind,
    title: input.title,
    smartLinkPath: input.smartLinkPath,
  });

  // onConflictDoNothing makes the ensure idempotent under a concurrent
  // first-open race: if another request inserted the row between our select
  // and insert, the unique (creator_profile_id, asset_id) index suppresses the
  // duplicate instead of throwing, and we re-read the winning row below.
  const [created] = await db
    .insert(libraryAssetShareSettings)
    .values({
      creatorProfileId: input.creatorProfileId,
      assetId: input.assetId,
      itemKind: input.itemKind,
      visibility: DEFAULT_LIBRARY_ASSET_VISIBILITY,
      shareSlug,
      accessToken: generateLibraryAssetShareToken(),
    })
    .onConflictDoNothing({
      target: [
        libraryAssetShareSettings.creatorProfileId,
        libraryAssetShareSettings.assetId,
      ],
    })
    .returning();

  const row =
    created ??
    (await selectLibraryAssetShareRow(input.creatorProfileId, input.assetId));

  if (!row) {
    throw new Error('Failed to create library asset share settings');
  }

  return rowToViewModel(
    row,
    input.artistHandle,
    input.smartLinkPath,
    input.itemKind
  );
}

export async function updateLibraryAssetShareVisibility(input: {
  readonly creatorProfileId: string;
  readonly assetId: string;
  readonly visibility: LibraryAssetVisibility;
  readonly artistHandle: string;
  readonly itemKind: LibraryItemKind;
  readonly title: string;
  readonly smartLinkPath?: string;
}): Promise<LibraryAssetShareViewModel> {
  await ensureLibraryAssetShareSettings({
    creatorProfileId: input.creatorProfileId,
    assetId: input.assetId,
    itemKind: input.itemKind,
    title: input.title,
    artistHandle: input.artistHandle,
    smartLinkPath: input.smartLinkPath,
  });

  const [updated] = await db
    .update(libraryAssetShareSettings)
    .set({
      visibility: input.visibility,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(libraryAssetShareSettings.creatorProfileId, input.creatorProfileId),
        eq(libraryAssetShareSettings.assetId, input.assetId)
      )
    )
    .returning();

  if (!updated) {
    throw new Error('Failed to update library asset share visibility');
  }

  return rowToViewModel(
    updated,
    input.artistHandle,
    input.smartLinkPath,
    input.itemKind
  );
}

export async function revokeLibraryAssetShareToken(input: {
  readonly creatorProfileId: string;
  readonly assetId: string;
  readonly artistHandle: string;
  readonly itemKind: LibraryItemKind;
  readonly title: string;
  readonly smartLinkPath?: string;
}): Promise<LibraryAssetShareViewModel> {
  await ensureLibraryAssetShareSettings({
    creatorProfileId: input.creatorProfileId,
    assetId: input.assetId,
    itemKind: input.itemKind,
    title: input.title,
    artistHandle: input.artistHandle,
    smartLinkPath: input.smartLinkPath,
  });

  const [updated] = await db
    .update(libraryAssetShareSettings)
    .set({
      accessToken: generateLibraryAssetShareToken(),
      tokenRevokedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(libraryAssetShareSettings.creatorProfileId, input.creatorProfileId),
        eq(libraryAssetShareSettings.assetId, input.assetId)
      )
    )
    .returning();

  if (!updated) {
    throw new Error('Failed to revoke library asset share token');
  }

  return rowToViewModel(
    updated,
    input.artistHandle,
    input.smartLinkPath,
    input.itemKind
  );
}

export async function getLibraryAssetShareForAsset(input: {
  readonly creatorProfileId: string;
  readonly assetId: string;
  readonly artistHandle: string;
}): Promise<LibraryAssetShareViewModel | null> {
  const [row] = await db
    .select()
    .from(libraryAssetShareSettings)
    .where(
      and(
        eq(libraryAssetShareSettings.creatorProfileId, input.creatorProfileId),
        eq(libraryAssetShareSettings.assetId, input.assetId)
      )
    )
    .limit(1);

  if (!row) return null;

  return rowToViewModel(
    row,
    input.artistHandle,
    undefined,
    row.itemKind as LibraryItemKind
  );
}

export async function resolveLibraryAssetShareByToken(
  accessToken: string
): Promise<{
  readonly settings: typeof libraryAssetShareSettings.$inferSelect;
  readonly artistHandle: string;
} | null> {
  const [row] = await db
    .select({
      settings: libraryAssetShareSettings,
      artistHandle: creatorProfiles.usernameNormalized,
    })
    .from(libraryAssetShareSettings)
    .innerJoin(
      creatorProfiles,
      eq(libraryAssetShareSettings.creatorProfileId, creatorProfiles.id)
    )
    .where(
      and(
        eq(libraryAssetShareSettings.accessToken, accessToken),
        isNull(libraryAssetShareSettings.tokenRevokedAt)
      )
    )
    .limit(1);

  if (!row?.settings || !row.artistHandle) return null;

  return {
    settings: row.settings,
    artistHandle: row.artistHandle,
  };
}

export async function resolveLibraryAssetShareByPublicSlug(input: {
  readonly artistHandle: string;
  readonly shareSlug: string;
}): Promise<{
  readonly settings: typeof libraryAssetShareSettings.$inferSelect;
  readonly artistHandle: string;
} | null> {
  const normalizedHandle = input.artistHandle.trim().toLowerCase();

  const [row] = await db
    .select({
      settings: libraryAssetShareSettings,
      artistHandle: creatorProfiles.usernameNormalized,
    })
    .from(libraryAssetShareSettings)
    .innerJoin(
      creatorProfiles,
      eq(libraryAssetShareSettings.creatorProfileId, creatorProfiles.id)
    )
    .where(
      and(
        eq(creatorProfiles.usernameNormalized, normalizedHandle),
        eq(libraryAssetShareSettings.shareSlug, input.shareSlug),
        eq(libraryAssetShareSettings.visibility, 'public')
      )
    )
    .limit(1);

  if (!row?.settings || !row.artistHandle) return null;

  return {
    settings: row.settings,
    artistHandle: row.artistHandle,
  };
}

export async function loadArtistHandleForProfile(
  creatorProfileId: string
): Promise<string | null> {
  return loadArtistHandle(creatorProfileId);
}
