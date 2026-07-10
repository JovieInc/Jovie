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

/**
 * Find a share row that already occupies one of this asset's unique slots.
 * Prefers the (creator, assetId) match; falls back to (creator, shareSlug)
 * because release slugs derive from the smart-link path, not the assetId — two
 * opens (or an unstable assetId across sessions) can collide on the slug index.
 */
async function findExistingShareRow(input: {
  readonly creatorProfileId: string;
  readonly assetId: string;
  readonly shareSlug: string;
}): Promise<typeof libraryAssetShareSettings.$inferSelect | null> {
  const [byAsset] = await db
    .select()
    .from(libraryAssetShareSettings)
    .where(
      and(
        eq(libraryAssetShareSettings.creatorProfileId, input.creatorProfileId),
        eq(libraryAssetShareSettings.assetId, input.assetId)
      )
    )
    .limit(1);

  if (byAsset) return byAsset;

  const [bySlug] = await db
    .select()
    .from(libraryAssetShareSettings)
    .where(
      and(
        eq(libraryAssetShareSettings.creatorProfileId, input.creatorProfileId),
        eq(libraryAssetShareSettings.shareSlug, input.shareSlug)
      )
    )
    .limit(1);

  return bySlug ?? null;
}

export async function ensureLibraryAssetShareSettings(
  input: LibraryAssetShareEnsureInput
): Promise<LibraryAssetShareViewModel> {
  const shareSlug = deriveLibraryAssetShareSlug({
    assetId: input.assetId,
    itemKind: input.itemKind,
    title: input.title,
    smartLinkPath: input.smartLinkPath,
  });

  const existing = await findExistingShareRow({
    creatorProfileId: input.creatorProfileId,
    assetId: input.assetId,
    shareSlug,
  });

  if (existing) {
    return rowToViewModel(
      existing,
      input.artistHandle,
      input.smartLinkPath,
      input.itemKind
    );
  }

  // ON CONFLICT DO NOTHING covers both unique indexes (creator+asset and
  // creator+slug) so a concurrent first-open race or a slug collision returns
  // the pre-existing row instead of throwing a 500.
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
    .onConflictDoNothing()
    .returning();

  if (created) {
    return rowToViewModel(
      created,
      input.artistHandle,
      input.smartLinkPath,
      input.itemKind
    );
  }

  // Insert hit a unique constraint — re-read the row that won the race.
  const settled = await findExistingShareRow({
    creatorProfileId: input.creatorProfileId,
    assetId: input.assetId,
    shareSlug,
  });

  if (!settled) {
    throw new Error('Failed to ensure library asset share settings');
  }

  return rowToViewModel(
    settled,
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
  // ensure() may resolve a pre-existing row whose stored assetId differs from
  // input.assetId (slug collision / unstable assetId), so filter the update by
  // the resolved row's assetId rather than the caller-supplied one.
  const ensured = await ensureLibraryAssetShareSettings({
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
        eq(libraryAssetShareSettings.assetId, ensured.assetId)
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
  // Filter the update by the resolved row's assetId (see note in
  // updateLibraryAssetShareVisibility) so a slug-collided / unstable assetId
  // still revokes the existing token instead of matching zero rows.
  const ensured = await ensureLibraryAssetShareSettings({
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
        eq(libraryAssetShareSettings.assetId, ensured.assetId)
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
  /**
   * When true (default), only public share rows resolve — private rows 404
   * at the call site so they can render an alerts opt-in instead (JOV-3682).
   */
  readonly publicOnly?: boolean;
}): Promise<{
  readonly settings: typeof libraryAssetShareSettings.$inferSelect;
  readonly artistHandle: string;
} | null> {
  const normalizedHandle = input.artistHandle.trim().toLowerCase();
  const publicOnly = input.publicOnly !== false;

  const filters = [
    eq(creatorProfiles.usernameNormalized, normalizedHandle),
    eq(libraryAssetShareSettings.shareSlug, input.shareSlug),
  ];
  if (publicOnly) {
    filters.push(eq(libraryAssetShareSettings.visibility, 'public'));
  }

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
    .where(and(...filters))
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
