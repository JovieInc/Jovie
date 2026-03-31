/**
 * Shared Data Access for Smart Link Pages
 *
 * Fetches creator and content data for the /{username}/{slug} routes.
 * Used by both the main smart link page and the /sounds page.
 */

import { and, eq, isNotNull } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import { db } from '@/lib/db';
import {
  type ArtistRole,
  artists,
  discogRecordings,
  discogReleases,
  discogReleaseTracks,
  discogTracks,
  providerLinks,
  recordingArtists,
  releaseArtists,
} from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { getCreatorEntitlements } from '@/lib/entitlements/creator-plan';
import { toISOStringOrNull } from '@/lib/utils/date';

export type ContentType = 'release' | 'track';
type HiddenCreditRole = 'vs' | 'with';
export type SmartLinkCreditRole = Exclude<ArtistRole, HiddenCreditRole>;

export const CREDIT_ROLE_ORDER: readonly SmartLinkCreditRole[] = [
  'main_artist',
  'featured_artist',
  'producer',
  'co_producer',
  'composer',
  'lyricist',
  'arranger',
  'conductor',
  'remixer',
  'mix_engineer',
  'mastering_engineer',
  'other',
];

export const CREDIT_ROLE_LABELS: Record<SmartLinkCreditRole, string> = {
  main_artist: 'Primary artist',
  featured_artist: 'Featured artist',
  producer: 'Producer',
  co_producer: 'Co-producer',
  composer: 'Composer',
  lyricist: 'Lyricist',
  arranger: 'Arranger',
  conductor: 'Conductor',
  remixer: 'Remixer',
  mix_engineer: 'Mix engineer',
  mastering_engineer: 'Mastering engineer',
  other: 'Additional credits',
};

export function normalizeCreditRole(role: ArtistRole): SmartLinkCreditRole {
  if (role === 'vs' || role === 'with') {
    return 'other';
  }

  return role;
}

export const getRoleOrder = (role: SmartLinkCreditRole): number =>
  CREDIT_ROLE_ORDER.indexOf(role);

export interface SmartLinkCreditEntry {
  artistId: string;
  name: string;
  handle: string | null;
  role: SmartLinkCreditRole;
  position: number;
}

export interface SmartLinkCreditGroup {
  role: SmartLinkCreditRole;
  label: string;
  entries: SmartLinkCreditEntry[];
}

export function groupReleaseCredits(
  rows: Array<{
    artistId: string;
    artistName: string;
    creditName: string | null;
    handle: string | null;
    role: ArtistRole;
    position: number;
  }>
): SmartLinkCreditGroup[] {
  const groups = new Map<SmartLinkCreditRole, SmartLinkCreditEntry[]>();
  const seenByRole = new Map<SmartLinkCreditRole, Set<string>>();

  for (const row of rows) {
    const name = (row.creditName ?? row.artistName).trim();
    if (!name) continue;

    const role = normalizeCreditRole(row.role);
    const dedupeKey = `${name.toLowerCase()}::${row.handle ?? ''}`;
    const seen = seenByRole.get(role) ?? new Set<string>();

    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    seenByRole.set(role, seen);

    const entries = groups.get(role) ?? [];
    entries.push({
      artistId: row.artistId,
      name,
      handle: row.handle,
      role,
      position: row.position,
    });
    groups.set(role, entries);
  }

  return Array.from(groups.entries())
    .sort(([leftRole], [rightRole]) => {
      return getRoleOrder(leftRole) - getRoleOrder(rightRole);
    })
    .map(([role, entries]) => ({
      role,
      label: CREDIT_ROLE_LABELS[role],
      entries,
    }));
}

async function fetchReleaseCredits(
  releaseId: string
): Promise<SmartLinkCreditGroup[]> {
  const rows = await db
    .select({
      artistId: artists.id,
      artistName: artists.name,
      creditName: releaseArtists.creditName,
      handle: creatorProfiles.usernameNormalized,
      role: releaseArtists.role,
      position: releaseArtists.position,
    })
    .from(releaseArtists)
    .innerJoin(artists, eq(releaseArtists.artistId, artists.id))
    .leftJoin(creatorProfiles, eq(artists.creatorProfileId, creatorProfiles.id))
    .where(eq(releaseArtists.releaseId, releaseId))
    .orderBy(releaseArtists.position);

  return groupReleaseCredits(rows);
}

async function fetchRecordingCredits(
  recordingId: string
): Promise<SmartLinkCreditGroup[]> {
  const rows = await db
    .select({
      artistId: artists.id,
      artistName: artists.name,
      creditName: recordingArtists.creditName,
      handle: creatorProfiles.usernameNormalized,
      role: recordingArtists.role,
      position: recordingArtists.position,
    })
    .from(recordingArtists)
    .innerJoin(artists, eq(recordingArtists.artistId, artists.id))
    .leftJoin(creatorProfiles, eq(artists.creatorProfileId, creatorProfiles.id))
    .where(eq(recordingArtists.recordingId, recordingId))
    .orderBy(recordingArtists.position);

  return groupReleaseCredits(rows);
}

export interface ContentData {
  type: ContentType;
  id: string;
  title: string;
  slug: string;
  artworkUrl: string | null;
  releaseDate: Date | null;
  providerLinks: Array<{ providerId: string; url: string }>;
  artworkSizes?: Record<string, string> | null;
  releaseType?: string | null;
  totalTracks?: number | null;
  previewUrl?: string | null;
  releaseId?: string | null;
  /** Parent release slug — present for tracks, used for nested deep link URLs */
  releaseSlug?: string | null;
  /** Parent release title — present for tracks, shown as "from [Release]" link */
  releaseTitle?: string | null;
  credits?: SmartLinkCreditGroup[];
  creator: {
    id: string;
    displayName: string | null;
    username: string;
    usernameNormalized: string;
    avatarUrl: string | null;
  };
}

/**
 * Serialized content data for JSON-safe caching.
 * Dates are stored as ISO strings and rehydrated on read.
 */
export interface CachedContentData {
  type: ContentType;
  id: string;
  title: string;
  slug: string;
  artworkUrl: string | null;
  releaseDate: string | null;
  providerLinks: Array<{ providerId: string; url: string }>;
  artworkSizes?: Record<string, string> | null;
  releaseType?: string | null;
  totalTracks?: number | null;
  previewUrl?: string | null;
  releaseId?: string | null;
  releaseSlug?: string | null;
  releaseTitle?: string | null;
  credits?: SmartLinkCreditGroup[];
}

/**
 * Fetch creator by normalized username.
 */
const fetchCreatorByUsername = async (usernameNormalized: string) => {
  const [creator] = await db
    .select({
      id: creatorProfiles.id,
      displayName: creatorProfiles.displayName,
      username: creatorProfiles.username,
      usernameNormalized: creatorProfiles.usernameNormalized,
      avatarUrl: creatorProfiles.avatarUrl,
      settings: creatorProfiles.settings,
      isClaimed: creatorProfiles.isClaimed,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.usernameNormalized, usernameNormalized))
    .limit(1);

  return creator ?? null;
};

/**
 * Get creator with caching.
 * Uses unstable_cache for cross-request caching with targeted invalidation.
 * Wrapped in React.cache() for per-request deduplication.
 */
export const getCreatorByUsername = cache(
  async (usernameNormalized: string) => {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.NODE_ENV === 'development'
    ) {
      return fetchCreatorByUsername(usernameNormalized);
    }

    return unstable_cache(
      () => fetchCreatorByUsername(usernameNormalized),
      [`smartlink-creator-${usernameNormalized}`],
      {
        tags: [
          'smartlink-creator',
          `smartlink-creator:${usernameNormalized}`,
          `profile:${usernameNormalized}`,
        ],
        revalidate: 3600,
      }
    )();
  }
);

/**
 * Fetch content (release or track) by creator and slug.
 */
const fetchContentBySlug = async (
  creatorProfileId: string,
  slug: string
): Promise<CachedContentData | null> => {
  // Try release first
  const [release] = await db
    .select({
      id: discogReleases.id,
      title: discogReleases.title,
      slug: discogReleases.slug,
      artworkUrl: discogReleases.artworkUrl,
      releaseDate: discogReleases.releaseDate,
      releaseType: discogReleases.releaseType,
      totalTracks: discogReleases.totalTracks,
      metadata: discogReleases.metadata,
    })
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.creatorProfileId, creatorProfileId),
        eq(discogReleases.slug, slug)
      )
    )
    .limit(1);

  if (release) {
    const [links, credits, previewRow] = await Promise.all([
      db
        .select({
          providerId: providerLinks.providerId,
          url: providerLinks.url,
        })
        .from(providerLinks)
        .where(
          and(
            eq(providerLinks.ownerType, 'release'),
            eq(providerLinks.releaseId, release.id)
          )
        ),
      fetchReleaseCredits(release.id),
      db
        .select({ previewUrl: discogRecordings.previewUrl })
        .from(discogRecordings)
        .innerJoin(
          discogReleaseTracks,
          eq(discogReleaseTracks.recordingId, discogRecordings.id)
        )
        .where(
          and(
            eq(discogReleaseTracks.releaseId, release.id),
            isNotNull(discogRecordings.previewUrl)
          )
        )
        .orderBy(
          discogReleaseTracks.discNumber,
          discogReleaseTracks.trackNumber
        )
        .limit(1)
        .then(rows => rows[0]),
    ]);

    const metadata = release.metadata as Record<string, unknown> | null;
    const artworkSizes =
      (metadata?.artworkSizes as Record<string, string>) ?? null;

    return {
      type: 'release',
      id: release.id,
      title: release.title,
      slug: release.slug,
      artworkUrl: release.artworkUrl,
      releaseDate: toISOStringOrNull(release.releaseDate),
      providerLinks: links,
      artworkSizes,
      releaseType: release.releaseType,
      totalTracks: release.totalTracks,
      releaseId: release.id,
      previewUrl: previewRow?.previewUrl ?? null,
      credits,
    };
  }

  // Try recording (new model) — look up via discog_recordings + discog_release_tracks
  const [recording] = await db
    .select({
      id: discogRecordings.id,
      title: discogRecordings.title,
      slug: discogRecordings.slug,
      previewUrl: discogRecordings.previewUrl,
    })
    .from(discogRecordings)
    .where(
      and(
        eq(discogRecordings.creatorProfileId, creatorProfileId),
        eq(discogRecordings.slug, slug)
      )
    )
    .limit(1);

  if (recording) {
    // Find a release_track to get the parent release.
    // Pick the earliest release (by release date) for deterministic selection
    // when a recording appears on multiple releases (e.g., single + album).
    const [rt] = await db
      .select({
        id: discogReleaseTracks.id,
        releaseId: discogReleaseTracks.releaseId,
      })
      .from(discogReleaseTracks)
      .innerJoin(
        discogReleases,
        eq(discogReleaseTracks.releaseId, discogReleases.id)
      )
      .where(eq(discogReleaseTracks.recordingId, recording.id))
      .orderBy(discogReleases.releaseDate)
      .limit(1);

    const releaseId = rt?.releaseId;

    const [releaseData, links, credits] = await Promise.all([
      releaseId
        ? db
            .select({
              artworkUrl: discogReleases.artworkUrl,
              releaseDate: discogReleases.releaseDate,
              slug: discogReleases.slug,
              title: discogReleases.title,
            })
            .from(discogReleases)
            .where(eq(discogReleases.id, releaseId))
            .limit(1)
            .then(rows => rows[0])
        : Promise.resolve(undefined),
      rt
        ? db
            .select({
              providerId: providerLinks.providerId,
              url: providerLinks.url,
            })
            .from(providerLinks)
            .where(
              and(
                eq(providerLinks.ownerType, 'release_track'),
                eq(providerLinks.releaseTrackId, rt.id)
              )
            )
        : Promise.resolve([]),
      fetchRecordingCredits(recording.id),
    ]);

    return {
      type: 'track',
      id: recording.id,
      title: recording.title,
      slug: recording.slug,
      artworkUrl: releaseData?.artworkUrl ?? null,
      releaseDate: toISOStringOrNull(releaseData?.releaseDate),
      providerLinks: links,
      previewUrl: recording.previewUrl,
      releaseId: releaseId ?? null,
      releaseSlug: releaseData?.slug ?? null,
      releaseTitle: releaseData?.title ?? null,
      credits,
    };
  }

  // Fall back to legacy track
  const [track] = await db
    .select({
      id: discogTracks.id,
      title: discogTracks.title,
      slug: discogTracks.slug,
      releaseId: discogTracks.releaseId,
      previewUrl: discogTracks.previewUrl,
    })
    .from(discogTracks)
    .where(
      and(
        eq(discogTracks.creatorProfileId, creatorProfileId),
        eq(discogTracks.slug, slug)
      )
    )
    .limit(1);

  if (track) {
    const [releaseData, links] = await Promise.all([
      db
        .select({
          artworkUrl: discogReleases.artworkUrl,
          releaseDate: discogReleases.releaseDate,
          slug: discogReleases.slug,
          title: discogReleases.title,
        })
        .from(discogReleases)
        .where(eq(discogReleases.id, track.releaseId))
        .limit(1)
        .then(rows => rows[0]),
      db
        .select({
          providerId: providerLinks.providerId,
          url: providerLinks.url,
        })
        .from(providerLinks)
        .where(
          and(
            eq(providerLinks.ownerType, 'track'),
            eq(providerLinks.trackId, track.id)
          )
        ),
    ]);

    return {
      type: 'track',
      id: track.id,
      title: track.title,
      slug: track.slug,
      artworkUrl: releaseData?.artworkUrl ?? null,
      releaseDate: toISOStringOrNull(releaseData?.releaseDate),
      providerLinks: links,
      previewUrl: track.previewUrl,
      releaseId: track.releaseId,
      releaseSlug: releaseData?.slug ?? null,
      releaseTitle: releaseData?.title ?? null,
    };
  }

  return null;
};

/**
 * Rehydrate cached content data — converts ISO date strings back to Date objects.
 */
function rehydrateContent(
  cached: CachedContentData
): Omit<ContentData, 'creator'> {
  return {
    ...cached,
    releaseDate: cached.releaseDate ? new Date(cached.releaseDate) : null,
  };
}

/**
 * Get content with caching.
 */
export const getContentBySlug = cache(
  async (
    creatorProfileId: string,
    slug: string
  ): Promise<Omit<ContentData, 'creator'> | null> => {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.NODE_ENV === 'development'
    ) {
      const result = await fetchContentBySlug(creatorProfileId, slug);
      return result ? rehydrateContent(result) : null;
    }

    const cached = await unstable_cache(
      () => fetchContentBySlug(creatorProfileId, slug),
      [`smartlink-content-${creatorProfileId}-${slug}`],
      {
        tags: [
          'smartlink-content',
          `smartlink-content:${creatorProfileId}`,
          `smartlink-content:${creatorProfileId}:${slug}`,
        ],
        revalidate: 300,
      }
    )();

    return cached ? rehydrateContent(cached) : null;
  }
);

/**
 * Get a track within a specific release by slug.
 * Three-tier lookup: discog_release_tracks → discog_tracks (legacy), scoped to the release.
 * Returns null if the track doesn't exist in this release.
 */
export const getTrackBySlugInRelease = cache(
  async function getTrackBySlugInRelease(
    releaseId: string,
    trackSlug: string
  ): Promise<Omit<ContentData, 'creator'> | null> {
    // Try new model: discog_release_tracks joined to discog_recordings
    const [releaseTrack] = await db
      .select({
        id: discogReleaseTracks.id,
        recordingId: discogReleaseTracks.recordingId,
        title: discogReleaseTracks.title,
        slug: discogReleaseTracks.slug,
      })
      .from(discogReleaseTracks)
      .where(
        and(
          eq(discogReleaseTracks.releaseId, releaseId),
          eq(discogReleaseTracks.slug, trackSlug)
        )
      )
      .limit(1);

    if (releaseTrack) {
      // Fetch recording, release data, and provider links in parallel
      const [[recording], [releaseData], links] = await Promise.all([
        db
          .select({
            title: discogRecordings.title,
            previewUrl: discogRecordings.previewUrl,
          })
          .from(discogRecordings)
          .where(eq(discogRecordings.id, releaseTrack.recordingId))
          .limit(1),
        db
          .select({
            artworkUrl: discogReleases.artworkUrl,
            releaseDate: discogReleases.releaseDate,
            slug: discogReleases.slug,
            title: discogReleases.title,
          })
          .from(discogReleases)
          .where(eq(discogReleases.id, releaseId))
          .limit(1),
        db
          .select({
            providerId: providerLinks.providerId,
            url: providerLinks.url,
          })
          .from(providerLinks)
          .where(
            and(
              eq(providerLinks.ownerType, 'release_track'),
              eq(providerLinks.releaseTrackId, releaseTrack.id)
            )
          ),
      ]);

      return {
        type: 'track',
        id: releaseTrack.recordingId,
        title: releaseTrack.title ?? recording?.title ?? trackSlug,
        slug: releaseTrack.slug ?? trackSlug,
        artworkUrl: releaseData?.artworkUrl ?? null,
        releaseDate: releaseData?.releaseDate ?? null,
        providerLinks: links,
        previewUrl: recording?.previewUrl ?? null,
        releaseId,
        releaseSlug: releaseData?.slug ?? null,
        releaseTitle: releaseData?.title ?? null,
      };
    }

    // Fall back to legacy discog_tracks
    const [legacyTrack] = await db
      .select({
        id: discogTracks.id,
        title: discogTracks.title,
        slug: discogTracks.slug,
        previewUrl: discogTracks.previewUrl,
      })
      .from(discogTracks)
      .where(
        and(
          eq(discogTracks.releaseId, releaseId),
          eq(discogTracks.slug, trackSlug)
        )
      )
      .limit(1);

    if (legacyTrack) {
      const [[releaseData], links] = await Promise.all([
        db
          .select({
            artworkUrl: discogReleases.artworkUrl,
            releaseDate: discogReleases.releaseDate,
            slug: discogReleases.slug,
            title: discogReleases.title,
          })
          .from(discogReleases)
          .where(eq(discogReleases.id, releaseId))
          .limit(1),
        db
          .select({
            providerId: providerLinks.providerId,
            url: providerLinks.url,
          })
          .from(providerLinks)
          .where(
            and(
              eq(providerLinks.ownerType, 'track'),
              eq(providerLinks.trackId, legacyTrack.id)
            )
          ),
      ]);

      return {
        type: 'track',
        id: legacyTrack.id,
        title: legacyTrack.title,
        slug: legacyTrack.slug,
        artworkUrl: releaseData?.artworkUrl ?? null,
        releaseDate: releaseData?.releaseDate ?? null,
        providerLinks: links,
        previewUrl: legacyTrack.previewUrl,
        releaseId,
        releaseSlug: releaseData?.slug ?? null,
        releaseTitle: releaseData?.title ?? null,
      };
    }

    return null;
  }
);

/**
 * Get a creator's plan entitlements by profile ID.
 * Used to gate unreleased content on the public smartlink page.
 */
export const getCreatorPlan = cache(async (creatorProfileId: string) => {
  const { entitlements } = await getCreatorEntitlements(creatorProfileId);
  return {
    canAccessFutureReleases: entitlements.booleans.canAccessFutureReleases,
  };
});
