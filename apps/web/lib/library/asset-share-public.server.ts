import 'server-only';

import { eq } from 'drizzle-orm';
import type { LibraryItemKind } from '@/app/app/(shell)/library/library-data';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { getLibraryMerchCardsForProfile } from '@/lib/merch/service';
import type { LibraryAssetSharePublicView } from './asset-share';
import {
  resolveLibraryAssetShareByPublicSlug,
  resolveLibraryAssetShareByToken,
} from './asset-share.server';

function normalizeHttpUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

async function loadReleasePublicView(input: {
  readonly creatorProfileId: string;
  readonly assetId: string;
  readonly artistHandle: string;
  readonly visibility: 'public' | 'private';
}): Promise<LibraryAssetSharePublicView | null> {
  const [release] = await db
    .select({
      id: discogReleases.id,
      title: discogReleases.title,
      artworkUrl: discogReleases.artworkUrl,
      slug: discogReleases.slug,
      artistName: creatorProfiles.displayName,
      metadata: discogReleases.metadata,
    })
    .from(discogReleases)
    .innerJoin(
      creatorProfiles,
      eq(discogReleases.creatorProfileId, creatorProfiles.id)
    )
    .where(eq(discogReleases.id, input.assetId))
    .limit(1);

  if (!release) return null;

  const metadata = (release.metadata as Record<string, unknown> | null) ?? {};
  const previewUrl =
    typeof metadata.previewUrl === 'string'
      ? normalizeHttpUrl(metadata.previewUrl)
      : null;

  const smartLinkPath = `/${input.artistHandle}/${release.slug}`;

  return {
    assetId: release.id,
    itemKind: 'release',
    title: release.title,
    artistName: release.artistName?.trim() || 'Unknown Artist',
    artistHandle: input.artistHandle,
    artworkUrl: normalizeHttpUrl(release.artworkUrl),
    previewUrl,
    smartLinkPath,
    visibility: input.visibility,
  };
}

async function loadMerchPublicView(input: {
  readonly creatorProfileId: string;
  readonly assetId: string;
  readonly artistHandle: string;
  readonly visibility: 'public' | 'private';
}): Promise<LibraryAssetSharePublicView | null> {
  const merchId = input.assetId.replace(/^merch-/, '');
  const cards = await getLibraryMerchCardsForProfile(input.creatorProfileId);
  const card = cards.find(item => item.id === merchId);
  if (!card) return null;

  const [profile] = await db
    .select({ displayName: creatorProfiles.displayName })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, input.creatorProfileId))
    .limit(1);

  return {
    assetId: input.assetId,
    itemKind: 'merch',
    title: card.title,
    artistName: profile?.displayName?.trim() || 'Unknown Artist',
    artistHandle: input.artistHandle,
    artworkUrl: normalizeHttpUrl(card.primaryImageUrl),
    previewUrl: null,
    smartLinkPath: null,
    visibility: input.visibility,
  };
}

async function buildPublicViewForSettings(input: {
  readonly creatorProfileId: string;
  readonly assetId: string;
  readonly itemKind: string;
  readonly artistHandle: string;
  readonly visibility: 'public' | 'private';
}): Promise<LibraryAssetSharePublicView | null> {
  const itemKind = input.itemKind as LibraryItemKind;

  if (itemKind === 'release') {
    return loadReleasePublicView({
      creatorProfileId: input.creatorProfileId,
      assetId: input.assetId,
      artistHandle: input.artistHandle,
      visibility: input.visibility,
    });
  }

  if (itemKind === 'merch') {
    return loadMerchPublicView({
      creatorProfileId: input.creatorProfileId,
      assetId: input.assetId,
      artistHandle: input.artistHandle,
      visibility: input.visibility,
    });
  }

  return null;
}

export async function buildLibraryAssetSharePublicViewByToken(
  accessToken: string
): Promise<LibraryAssetSharePublicView | null> {
  const resolved = await resolveLibraryAssetShareByToken(accessToken);
  if (!resolved) return null;

  return buildPublicViewForSettings({
    creatorProfileId: resolved.settings.creatorProfileId,
    assetId: resolved.settings.assetId,
    itemKind: resolved.settings.itemKind,
    artistHandle: resolved.artistHandle,
    visibility: resolved.settings.visibility,
  });
}

export async function buildLibraryAssetSharePublicViewBySlug(input: {
  readonly artistHandle: string;
  readonly shareSlug: string;
}): Promise<LibraryAssetSharePublicView | null> {
  const resolved = await resolveLibraryAssetShareByPublicSlug(input);
  if (!resolved) return null;

  return buildPublicViewForSettings({
    creatorProfileId: resolved.settings.creatorProfileId,
    assetId: resolved.settings.assetId,
    itemKind: resolved.settings.itemKind,
    artistHandle: resolved.artistHandle,
    visibility: 'public',
  });
}

/**
 * Resolve a public-slug entity even when visibility is still private.
 * Used to turn "not live yet" into an alerts opt-in instead of a 404.
 */
export async function buildLibraryAssetSharePendingViewBySlug(input: {
  readonly artistHandle: string;
  readonly shareSlug: string;
}): Promise<LibraryAssetSharePublicView | null> {
  const resolved = await resolveLibraryAssetShareByPublicSlug({
    ...input,
    publicOnly: false,
  });
  if (!resolved) return null;
  if (resolved.settings.visibility === 'public') {
    return buildPublicViewForSettings({
      creatorProfileId: resolved.settings.creatorProfileId,
      assetId: resolved.settings.assetId,
      itemKind: resolved.settings.itemKind,
      artistHandle: resolved.artistHandle,
      visibility: 'public',
    });
  }

  return buildPublicViewForSettings({
    creatorProfileId: resolved.settings.creatorProfileId,
    assetId: resolved.settings.assetId,
    itemKind: resolved.settings.itemKind,
    artistHandle: resolved.artistHandle,
    visibility: 'private',
  });
}
