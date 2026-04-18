import { and, sql as drizzleSql, eq, inArray, isNull, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { isUniqueViolation as isUniqueViolationUtil } from '@/lib/db/errors';
import {
  artists,
  type DiscogRecording,
  type DiscogRelease,
  type DiscogReleaseTrack,
  discogRecordings,
  discogReleases,
  discogReleaseTracks,
  discogTracks,
  type NewDiscogRecording,
  type NewDiscogRelease,
  type NewDiscogReleaseTrack,
  type NewDiscogTrack,
  type NewProviderLink,
  type ProviderLink,
  providerLinks,
  releaseArtists,
} from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { resolveTrackProviderLinks } from './track-provider-links';

/**
 * Release data source types
 */
export type ReleaseSourceType = 'manual' | 'admin' | 'ingested';

/** Track summary data aggregated per release */
export interface TrackSummary {
  totalDurationMs: number | null;
  primaryIsrc: string | null;
  primaryPreviewUrl: string | null;
}

// Types for release data with provider links
export interface ReleaseWithProviders extends DiscogRelease {
  providerLinks: ProviderLink[];
  artistNames?: string[];
  trackSummary?: TrackSummary;
}

export interface PublicDiscogReleaseLite {
  id: string;
  title: string;
  slug: string | null;
  releaseType: DiscogRelease['releaseType'];
  releaseDate: string | null;
  artworkUrl: string | null;
}

export interface UpsertReleaseInput {
  creatorProfileId: string;
  title: string;
  slug: string;
  releaseType?:
    | 'single'
    | 'ep'
    | 'album'
    | 'compilation'
    | 'live'
    | 'mixtape'
    | 'music_video'
    | 'other';
  releaseDate?: Date | null;
  label?: string | null;
  upc?: string | null;
  totalTracks?: number;
  isExplicit?: boolean;
  genres?: string[] | null;
  copyrightLine?: string | null;
  distributor?: string | null;
  artworkUrl?: string | null;
  spotifyPopularity?: number | null;
  sourceType?: ReleaseSourceType;
  metadata?: Record<string, unknown>;
}

// Base fields shared by both release and track links
interface UpsertProviderLinkBase {
  providerId: string;
  url: string;
  externalId?: string | null;
  sourceType?: ReleaseSourceType;
  isPrimary?: boolean;
  metadata?: Record<string, unknown>;
}

// Release-level provider link input
export interface UpsertReleaseProviderLinkInput extends UpsertProviderLinkBase {
  releaseId: string;
  trackId?: never;
}

// Track-level provider link input (LEGACY — use ReleaseTrack variant for new code)
export interface UpsertTrackProviderLinkInput extends UpsertProviderLinkBase {
  trackId: string;
  releaseId?: never;
  releaseTrackId?: never;
}

// ReleaseTrack-level provider link input
export interface UpsertReleaseTrackProviderLinkInput
  extends UpsertProviderLinkBase {
  releaseTrackId: string;
  releaseId?: never;
  trackId?: never;
}

// Union type for the function
export type UpsertProviderLinkInput =
  | UpsertReleaseProviderLinkInput
  | UpsertTrackProviderLinkInput
  | UpsertReleaseTrackProviderLinkInput;

function isUniqueConstraintViolation(
  error: unknown,
  constraint: string
): boolean {
  return isUniqueViolationUtil(error, constraint);
}

/** Shared SQL select columns for track summary aggregation (lazy to avoid module-scope access). */
function trackSummarySelectColumns() {
  return {
    releaseId: discogReleaseTracks.releaseId,
    totalDurationMs: drizzleSql<number>`sum(${discogRecordings.durationMs})`.as(
      'total_duration_ms'
    ),
    primaryIsrc:
      drizzleSql<string>`(array_agg(${discogRecordings.isrc} ORDER BY ${discogReleaseTracks.discNumber}, ${discogReleaseTracks.trackNumber}) FILTER (WHERE ${discogRecordings.isrc} IS NOT NULL))[1]`.as(
        'primary_isrc'
      ),
    primaryPreviewUrl:
      drizzleSql<string>`(array_agg(NULLIF(BTRIM(${discogRecordings.previewUrl}), '') ORDER BY ${discogReleaseTracks.discNumber}, ${discogReleaseTracks.trackNumber}) FILTER (WHERE NULLIF(BTRIM(${discogRecordings.previewUrl}), '') IS NOT NULL))[1]`.as(
        'primary_preview_url'
      ),
  };
}

function rowToTrackSummary(row: {
  totalDurationMs: number | null;
  primaryIsrc: string | null;
  primaryPreviewUrl: string | null;
}): TrackSummary {
  return {
    totalDurationMs: row.totalDurationMs ?? null,
    primaryIsrc: row.primaryIsrc ?? null,
    primaryPreviewUrl: row.primaryPreviewUrl ?? null,
  };
}

/**
 * Get track summaries (total duration, primary ISRC) for releases
 */
async function getTrackSummariesForReleases(
  releaseIds: string[]
): Promise<Map<string, TrackSummary>> {
  if (releaseIds.length === 0) {
    return new Map();
  }

  const summaries = await db
    .select(trackSummarySelectColumns())
    .from(discogReleaseTracks)
    .innerJoin(
      discogRecordings,
      eq(discogReleaseTracks.recordingId, discogRecordings.id)
    )
    .where(inArray(discogReleaseTracks.releaseId, releaseIds))
    .groupBy(discogReleaseTracks.releaseId);

  const summaryMap = new Map<string, TrackSummary>();
  for (const row of summaries) {
    summaryMap.set(row.releaseId, rowToTrackSummary(row));
  }
  return summaryMap;
}

async function getArtistNamesForReleases(
  releaseIds: string[]
): Promise<Map<string, string[]>> {
  if (releaseIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      releaseId: releaseArtists.releaseId,
      artistName: artists.name,
      creditName: releaseArtists.creditName,
    })
    .from(releaseArtists)
    .innerJoin(artists, eq(releaseArtists.artistId, artists.id))
    .where(inArray(releaseArtists.releaseId, releaseIds))
    .orderBy(releaseArtists.releaseId, releaseArtists.position);

  const namesByRelease = new Map<string, string[]>();

  for (const row of rows) {
    const displayName = (row.creditName ?? row.artistName ?? '').trim();
    if (!displayName) continue;

    const existing = namesByRelease.get(row.releaseId) ?? [];
    if (!existing.includes(displayName)) {
      existing.push(displayName);
      namesByRelease.set(row.releaseId, existing);
    }
  }

  return namesByRelease;
}

/**
 * Get the latest release for a creator profile (by release date, most recent first)
 */
export async function getLatestReleaseForProfile(
  creatorProfileId: string
): Promise<DiscogRelease | null> {
  const [release] = await db
    .select()
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.creatorProfileId, creatorProfileId),
        isNull(discogReleases.deletedAt),
        ne(discogReleases.status, 'draft'),
        drizzleSql`(${discogReleases.revealDate} IS NULL OR ${discogReleases.revealDate} <= NOW())`
      )
    )
    .orderBy(drizzleSql`${discogReleases.releaseDate} DESC NULLS LAST`)
    .limit(1);

  return release ?? null;
}

/**
 * Get the latest release for a creator by username (normalized).
 * This allows fetching the latest release in parallel with profile data
 * without needing the profile ID first.
 */
export async function getLatestReleaseByUsername(
  usernameNormalized: string
): Promise<DiscogRelease | null> {
  const [release] = await db
    .select({
      id: discogReleases.id,
      creatorProfileId: discogReleases.creatorProfileId,
      title: discogReleases.title,
      slug: discogReleases.slug,
      releaseType: discogReleases.releaseType,
      releaseDate: discogReleases.releaseDate,
      status: discogReleases.status,
      revealDate: discogReleases.revealDate,
      deletedAt: discogReleases.deletedAt,
      label: discogReleases.label,
      upc: discogReleases.upc,
      totalTracks: discogReleases.totalTracks,
      isExplicit: discogReleases.isExplicit,
      genres: discogReleases.genres,
      targetPlaylists: discogReleases.targetPlaylists,
      copyrightLine: discogReleases.copyrightLine,
      distributor: discogReleases.distributor,
      artworkUrl: discogReleases.artworkUrl,
      spotifyPopularity: discogReleases.spotifyPopularity,
      sourceType: discogReleases.sourceType,
      metadata: discogReleases.metadata,
      generatedPitches: discogReleases.generatedPitches,
      createdAt: discogReleases.createdAt,
      updatedAt: discogReleases.updatedAt,
    })
    .from(discogReleases)
    .innerJoin(
      creatorProfiles,
      eq(discogReleases.creatorProfileId, creatorProfiles.id)
    )
    .where(
      and(
        eq(creatorProfiles.usernameNormalized, usernameNormalized),
        isNull(discogReleases.deletedAt),
        ne(discogReleases.status, 'draft'),
        ne(discogReleases.releaseType, 'music_video'),
        drizzleSql`(${discogReleases.revealDate} IS NULL OR ${discogReleases.revealDate} <= NOW())`
      )
    )
    .orderBy(drizzleSql`${discogReleases.releaseDate} DESC NULLS LAST`)
    .limit(1);

  return release ?? null;
}

/**
 * Get release stats for a creator by username.
 * Returns total release count and up to 3 recent release titles.
 */
export async function getReleaseStatsByUsername(
  usernameNormalized: string
): Promise<{ releaseCount: number; topReleaseTitles: string[] }> {
  const publicFilter = and(
    eq(creatorProfiles.usernameNormalized, usernameNormalized),
    isNull(discogReleases.deletedAt),
    ne(discogReleases.status, 'draft')
  );
  const [countResult, topReleases] = await Promise.all([
    db
      .select({
        count: drizzleSql<number>`count(*)::int`,
      })
      .from(discogReleases)
      .innerJoin(
        creatorProfiles,
        eq(discogReleases.creatorProfileId, creatorProfiles.id)
      )
      .where(publicFilter),
    db
      .select({ title: discogReleases.title })
      .from(discogReleases)
      .innerJoin(
        creatorProfiles,
        eq(discogReleases.creatorProfileId, creatorProfiles.id)
      )
      .where(publicFilter)
      .orderBy(drizzleSql`${discogReleases.releaseDate} DESC NULLS LAST`)
      .limit(3),
  ]);

  return {
    releaseCount: countResult[0]?.count ?? 0,
    topReleaseTitles: topReleases.map(release => release.title),
  };
}

/**
 * Lightweight release list for public profile display.
 * Returns releases with artist names but skips provider links and track summaries.
 * Sorted newest-first (DESC NULLS LAST) so null dates appear at the end.
 * Capped at 200 releases to bound serialisation cost.
 */
export async function getReleasesForProfileLite(
  creatorProfileId: string
): Promise<Array<PublicDiscogReleaseLite & { artistNames: string[] }>> {
  const releases = await db
    .select({
      id: discogReleases.id,
      title: discogReleases.title,
      slug: discogReleases.slug,
      releaseType: discogReleases.releaseType,
      releaseDate: discogReleases.releaseDate,
      artworkUrl: discogReleases.artworkUrl,
    })
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.creatorProfileId, creatorProfileId),
        isNull(discogReleases.deletedAt),
        ne(discogReleases.status, 'draft'),
        // Intentionally includes music videos for the public releases drawer.
        drizzleSql`(${discogReleases.revealDate} IS NULL OR ${discogReleases.revealDate} <= NOW())`
      )
    )
    .orderBy(drizzleSql`${discogReleases.releaseDate} DESC NULLS LAST`)
    .limit(200);

  if (releases.length === 0) return [];

  const artistNamesByRelease = await getArtistNamesForReleases(
    releases.map(r => r.id)
  );

  return releases.map(release => ({
    ...release,
    releaseDate: release.releaseDate?.toISOString() ?? null,
    artistNames: artistNamesByRelease.get(release.id) ?? [],
  }));
}

/**
 * Get all releases for a creator profile with their provider links
 */
export async function getReleasesForProfile(
  creatorProfileId: string,
  options?: { includeDrafts?: boolean }
): Promise<ReleaseWithProviders[]> {
  const filters = [
    eq(discogReleases.creatorProfileId, creatorProfileId),
    isNull(discogReleases.deletedAt),
  ];
  if (!options?.includeDrafts) {
    filters.push(ne(discogReleases.status, 'draft'));
  }
  // Fetch releases (always exclude soft-deleted)
  const releases = await db
    .select()
    .from(discogReleases)
    .where(and(...filters))
    .orderBy(discogReleases.releaseDate);

  if (releases.length === 0) {
    return [];
  }

  const releaseIds = releases.map(r => r.id);

  // Fetch track summaries (duration, ISRC) in parallel with provider links
  const [trackSummaries, artistNamesByRelease, providerLinksResult] =
    await Promise.all([
      getTrackSummariesForReleases(releaseIds),
      getArtistNamesForReleases(releaseIds),
      db
        .select()
        .from(providerLinks)
        .where(
          and(
            eq(providerLinks.ownerType, 'release'),
            inArray(providerLinks.releaseId, releaseIds)
          )
        ),
    ]);

  // Group links by release ID
  const linksByRelease = new Map<string, ProviderLink[]>();
  for (const link of providerLinksResult) {
    if (!link.releaseId) continue;
    const existing = linksByRelease.get(link.releaseId) ?? [];
    existing.push(link);
    linksByRelease.set(link.releaseId, existing);
  }

  // Combine releases with their links and track summaries
  return releases.map(release => ({
    ...release,
    providerLinks: linksByRelease.get(release.id) ?? [],
    artistNames: artistNamesByRelease.get(release.id) ?? [],
    trackSummary: trackSummaries.get(release.id),
  }));
}

/**
 * Get a single release by slug
 */
export async function getReleaseBySlug(
  creatorProfileId: string,
  slug: string
): Promise<ReleaseWithProviders | null> {
  const [release] = await db
    .select()
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.creatorProfileId, creatorProfileId),
        eq(discogReleases.slug, slug)
      )
    )
    .limit(1);

  if (!release) {
    return null;
  }

  const [artistNamesByRelease, links] = await Promise.all([
    getArtistNamesForReleases([release.id]),
    db
      .select()
      .from(providerLinks)
      .where(
        and(
          eq(providerLinks.ownerType, 'release'),
          eq(providerLinks.releaseId, release.id)
        )
      ),
  ]);

  return {
    ...release,
    artistNames: artistNamesByRelease.get(release.id) ?? [],
    providerLinks: links,
  };
}

/**
 * Get a release by ID
 */
export async function getReleaseById(
  releaseId: string
): Promise<ReleaseWithProviders | null> {
  const [release] = await db
    .select()
    .from(discogReleases)
    .where(eq(discogReleases.id, releaseId))
    .limit(1);

  if (!release) {
    return null;
  }

  const [artistNamesByRelease, links] = await Promise.all([
    getArtistNamesForReleases([release.id]),
    db
      .select()
      .from(providerLinks)
      .where(
        and(
          eq(providerLinks.ownerType, 'release'),
          eq(providerLinks.releaseId, release.id)
        )
      ),
  ]);

  return {
    ...release,
    artistNames: artistNamesByRelease.get(release.id) ?? [],
    providerLinks: links,
  };
}

/**
 * Upsert a release (insert or update based on creator + slug)
 */
export async function upsertRelease(
  input: UpsertReleaseInput
): Promise<DiscogRelease> {
  const now = new Date();

  const insertData: NewDiscogRelease = {
    creatorProfileId: input.creatorProfileId,
    title: input.title,
    slug: input.slug,
    releaseType: input.releaseType ?? 'single',
    releaseDate: input.releaseDate ?? null,
    label: input.label ?? null,
    upc: input.upc ?? null,
    totalTracks: input.totalTracks ?? 0,
    isExplicit: input.isExplicit ?? false,
    genres: input.genres ?? null,
    copyrightLine: input.copyrightLine ?? null,
    distributor: input.distributor ?? null,
    artworkUrl: input.artworkUrl ?? null,
    spotifyPopularity: input.spotifyPopularity ?? null,
    sourceType: input.sourceType ?? 'ingested',
    metadata: input.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };

  // Try to insert, on conflict update
  const [result] = await db
    .insert(discogReleases)
    .values(insertData)
    .onConflictDoUpdate({
      target: [discogReleases.creatorProfileId, discogReleases.slug],
      set: {
        title: input.title,
        releaseType: input.releaseType ?? 'single',
        releaseDate: input.releaseDate ?? null,
        label: input.label ?? null,
        upc: input.upc ?? null,
        totalTracks: input.totalTracks ?? 0,
        isExplicit: input.isExplicit ?? false,
        genres: input.genres ?? null,
        copyrightLine: input.copyrightLine ?? null,
        distributor: input.distributor ?? null,
        artworkUrl: input.artworkUrl ?? null,
        spotifyPopularity: input.spotifyPopularity ?? null,
        sourceType: input.sourceType ?? 'ingested',
        metadata: input.metadata ?? {},
        updatedAt: now,
      },
    })
    .returning();

  return result;
}

function resolveProviderLinkOwner(
  input: UpsertProviderLinkInput,
  isReleaseTrackLink: unknown,
  isTrackLink: unknown
) {
  if (isReleaseTrackLink) {
    return {
      ownerType: 'release_track' as const,
      releaseId: null,
      trackId: null,
      releaseTrackId: (input as UpsertReleaseTrackProviderLinkInput)
        .releaseTrackId,
    };
  }
  if (isTrackLink) {
    return {
      ownerType: 'track' as const,
      releaseId: null,
      trackId: (input as UpsertTrackProviderLinkInput).trackId,
      releaseTrackId: null,
    };
  }
  return {
    ownerType: 'release' as const,
    releaseId: (input as UpsertReleaseProviderLinkInput).releaseId,
    trackId: null,
    releaseTrackId: null,
  };
}

function resolveConflictTarget(
  isReleaseTrackLink: unknown,
  isTrackLink: unknown
) {
  if (isReleaseTrackLink) {
    return [providerLinks.providerId, providerLinks.releaseTrackId];
  }
  if (isTrackLink) {
    return [providerLinks.providerId, providerLinks.trackId];
  }
  return [providerLinks.providerId, providerLinks.releaseId];
}

/**
 * Upsert a provider link for a release or track
 */
export async function upsertProviderLink(
  input: UpsertProviderLinkInput
): Promise<ProviderLink> {
  const now = new Date();

  // Determine owner type based on which ID is provided
  const isReleaseTrackLink = 'releaseTrackId' in input && input.releaseTrackId;
  const isTrackLink = 'trackId' in input && input.trackId;
  const { ownerType, releaseId, trackId, releaseTrackId } =
    resolveProviderLinkOwner(input, isReleaseTrackLink, isTrackLink);

  const insertData: NewProviderLink = {
    providerId: input.providerId,
    ownerType,
    releaseId,
    trackId,
    releaseTrackId,
    url: input.url,
    externalId: input.externalId ?? null,
    sourceType: input.sourceType ?? 'ingested',
    isPrimary: input.isPrimary ?? false,
    metadata: input.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };

  // Use the appropriate unique constraint target
  const conflictTarget = resolveConflictTarget(isReleaseTrackLink, isTrackLink);

  try {
    const [result] = await db
      .insert(providerLinks)
      .values(insertData)
      .onConflictDoUpdate({
        target: conflictTarget,
        set: {
          url: input.url,
          externalId: input.externalId ?? null,
          sourceType: input.sourceType ?? 'ingested',
          isPrimary: input.isPrimary ?? false,
          metadata: input.metadata ?? {},
          updatedAt: now,
        },
      })
      .returning();

    return result;
  } catch (error) {
    if (
      !input.externalId ||
      !isUniqueConstraintViolation(error, 'provider_links_provider_external')
    ) {
      throw error;
    }

    // `provider_links_provider_external` is globally unique, but the same DSP
    // album/track can legitimately appear on multiple creators (collabs,
    // compilations, label samplers). Preserve the URL on this owner-specific
    // row and keep the provider external ID in metadata instead.
    const fallbackMetadata = {
      ...input.metadata,
      providerExternalId: input.externalId,
      providerExternalIdDeferred: true,
    };

    const [fallbackResult] = await db
      .insert(providerLinks)
      .values({
        ...insertData,
        externalId: null,
        metadata: fallbackMetadata,
      })
      .onConflictDoUpdate({
        target: conflictTarget,
        set: {
          url: input.url,
          externalId: null,
          sourceType: input.sourceType ?? 'ingested',
          isPrimary: input.isPrimary ?? false,
          metadata: fallbackMetadata,
          updatedAt: now,
        },
      })
      .returning();

    return fallbackResult;
  }
}

/**
 * Get a provider link for a release
 */
export async function getProviderLink(
  releaseId: string,
  providerId: string
): Promise<ProviderLink | null> {
  const [link] = await db
    .select()
    .from(providerLinks)
    .where(
      and(
        eq(providerLinks.releaseId, releaseId),
        eq(providerLinks.providerId, providerId)
      )
    )
    .limit(1);

  return link ?? null;
}

/**
 * Reset a provider link to ingested state (remove manual override)
 * If there's no ingested URL, delete the link entirely
 */
export async function resetProviderLink(
  releaseId: string,
  providerId: string,
  ingestedUrl?: string
): Promise<ProviderLink | null> {
  if (!ingestedUrl) {
    // Delete the link if no ingested URL exists
    await db
      .delete(providerLinks)
      .where(
        and(
          eq(providerLinks.releaseId, releaseId),
          eq(providerLinks.providerId, providerId)
        )
      );
    return null;
  }

  // Update to ingested state
  const [result] = await db
    .update(providerLinks)
    .set({
      url: ingestedUrl,
      sourceType: 'ingested',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(providerLinks.releaseId, releaseId),
        eq(providerLinks.providerId, providerId)
      )
    )
    .returning();

  return result ?? null;
}

/**
 * Upsert a track for a release
 */
export async function upsertTrack(input: {
  releaseId: string;
  creatorProfileId: string;
  title: string;
  slug: string;
  trackNumber: number;
  discNumber?: number;
  durationMs?: number | null;
  isExplicit?: boolean;
  isrc?: string | null;
  previewUrl?: string | null;
  audioUrl?: string | null;
  audioFormat?: string | null;
  lyrics?: string | null;
  sourceType?: ReleaseSourceType;
  metadata?: Record<string, unknown>;
}): Promise<typeof discogTracks.$inferSelect> {
  const now = new Date();
  const discNumber = input.discNumber ?? 1;
  const fallbackSlug = `${input.slug}-${discNumber}-${input.trackNumber}`;
  const baseSet = {
    title: input.title,
    slug: input.slug,
    durationMs: input.durationMs ?? null,
    isExplicit: input.isExplicit ?? false,
    isrc: input.isrc ?? null,
    previewUrl: input.previewUrl ?? null,
    audioUrl: input.audioUrl ?? null,
    audioFormat: input.audioFormat ?? null,
    ...('lyrics' in input ? { lyrics: input.lyrics ?? null } : {}),
    sourceType: input.sourceType ?? 'ingested',
    metadata: input.metadata ?? {},
    updatedAt: now,
  };

  const insertData: NewDiscogTrack = {
    releaseId: input.releaseId,
    creatorProfileId: input.creatorProfileId,
    title: input.title,
    slug: input.slug,
    trackNumber: input.trackNumber,
    discNumber,
    durationMs: input.durationMs ?? null,
    isExplicit: input.isExplicit ?? false,
    isrc: input.isrc ?? null,
    previewUrl: input.previewUrl ?? null,
    audioUrl: input.audioUrl ?? null,
    audioFormat: input.audioFormat ?? null,
    lyrics: input.lyrics ?? null,
    sourceType: input.sourceType ?? 'ingested',
    metadata: input.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };

  try {
    const [result] = await db
      .insert(discogTracks)
      .values(insertData)
      .onConflictDoUpdate({
        target: [
          discogTracks.releaseId,
          discogTracks.discNumber,
          discogTracks.trackNumber,
        ],
        set: baseSet,
      })
      .returning();

    return result;
  } catch (error) {
    if (
      isUniqueConstraintViolation(error, 'discog_tracks_release_slug_unique')
    ) {
      const [result] = await db
        .insert(discogTracks)
        .values({
          ...insertData,
          slug: fallbackSlug,
        })
        .onConflictDoUpdate({
          target: [
            discogTracks.releaseId,
            discogTracks.discNumber,
            discogTracks.trackNumber,
          ],
          set: {
            ...baseSet,
            slug: fallbackSlug,
          },
        })
        .returning();

      return result;
    }

    if (
      !isUniqueConstraintViolation(error, 'discog_tracks_release_isrc_unique')
    ) {
      throw error;
    }

    const [result] = await db
      .insert(discogTracks)
      .values({
        ...insertData,
        isrc: null,
      })
      .onConflictDoUpdate({
        target: [
          discogTracks.releaseId,
          discogTracks.discNumber,
          discogTracks.trackNumber,
        ],
        set: {
          ...baseSet,
          isrc: null,
        },
      })
      .returning();

    return result;
  }
}

/**
 * Update lyrics for a track by ID
 */
export async function updateTrackLyrics(
  trackId: string,
  lyrics: string
): Promise<void> {
  await db
    .update(discogTracks)
    .set({ lyrics, updatedAt: new Date() })
    .where(eq(discogTracks.id, trackId));
}

/**
 * Update preview URL for a recording identified by ISRC + creator profile.
 * Only updates if the recording's current previewUrl is NULL (doesn't overwrite existing).
 */
export async function updateRecordingPreviewByIsrc(
  creatorProfileId: string,
  isrc: string,
  previewUrl: string
): Promise<boolean> {
  const result = await db
    .update(discogRecordings)
    .set({ previewUrl, updatedAt: new Date() })
    .where(
      and(
        eq(discogRecordings.creatorProfileId, creatorProfileId),
        eq(discogRecordings.isrc, isrc),
        drizzleSql`${discogRecordings.previewUrl} IS NULL`
      )
    );
  return (result.rowCount ?? 0) > 0;
}

export async function setRecordingPreviewResolutionByIsrc(
  creatorProfileId: string,
  isrc: string,
  resolution: {
    status: 'verified' | 'fallback' | 'unknown' | 'missing';
    source:
      | 'audio_url'
      | 'spotify'
      | 'apple_music'
      | 'deezer'
      | 'musicfetch'
      | null;
    attemptedSources?: string[];
  }
): Promise<boolean> {
  const [recording] = await db
    .select({
      id: discogRecordings.id,
      metadata: discogRecordings.metadata,
    })
    .from(discogRecordings)
    .where(
      and(
        eq(discogRecordings.creatorProfileId, creatorProfileId),
        eq(discogRecordings.isrc, isrc)
      )
    )
    .limit(1);

  if (!recording) {
    return false;
  }

  const nextMetadata = {
    ...recording.metadata,
    previewResolution: {
      status: resolution.status,
      source: resolution.source,
      checkedAt: new Date().toISOString(),
      attemptedSources: resolution.attemptedSources ?? [],
    },
  };

  const result = await db
    .update(discogRecordings)
    .set({
      metadata: nextMetadata,
      updatedAt: new Date(),
    })
    .where(eq(discogRecordings.id, recording.id));

  return (result.rowCount ?? 0) > 0;
}

/**
 * Get tracks for a release
 */
export async function getTracksForRelease(
  releaseId: string
): Promise<(typeof discogTracks.$inferSelect)[]> {
  return db
    .select()
    .from(discogTracks)
    .where(eq(discogTracks.releaseId, releaseId))
    .orderBy(discogTracks.discNumber, discogTracks.trackNumber);
}

/** Track with provider links for expandable rows */
export interface TrackWithProviders {
  id: string;
  releaseId: string;
  creatorProfileId: string;
  title: string;
  slug: string;
  trackNumber: number;
  discNumber: number;
  durationMs: number | null;
  isExplicit: boolean;
  isrc: string | null;
  previewUrl: string | null;
  audioUrl: string | null;
  audioFormat: string | null;
  metadata: Record<string, unknown> | null;
  providerLinks: ProviderLink[];
}

export interface TracksWithProvidersResult {
  tracks: TrackWithProviders[];
  total: number;
  hasMore: boolean;
}

/**
 * Get tracks for a release with their provider links
 * Used for expandable release rows in the releases table
 *
 * @param releaseId - The release ID to fetch tracks for
 * @param options - Pagination options (limit and offset)
 * @returns Object with tracks, total count, and hasMore flag
 */
export async function getTracksForReleaseWithProviders(
  releaseId: string,
  options?: { limit?: number; offset?: number }
): Promise<TracksWithProvidersResult> {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  // Get total count for pagination
  const [countResult] = await db
    .select({ count: drizzleSql<number>`COUNT(*)` })
    .from(discogTracks)
    .where(eq(discogTracks.releaseId, releaseId));

  const total = Number(countResult?.count ?? 0);

  if (total === 0) {
    return { tracks: [], total: 0, hasMore: false };
  }

  // Fetch paginated tracks
  const tracks = await db
    .select()
    .from(discogTracks)
    .where(eq(discogTracks.releaseId, releaseId))
    .orderBy(discogTracks.discNumber, discogTracks.trackNumber)
    .limit(limit)
    .offset(offset);

  if (tracks.length === 0) {
    return { tracks: [], total, hasMore: false };
  }

  // Fetch provider links for ONLY paginated tracks (not all tracks)
  const trackIds = tracks.map(t => t.id);
  const [trackProviderLinks, releaseProviderLinks] = await Promise.all([
    db
      .select()
      .from(providerLinks)
      .where(
        and(
          eq(providerLinks.ownerType, 'track'),
          inArray(providerLinks.trackId, trackIds)
        )
      ),
    db
      .select()
      .from(providerLinks)
      .where(
        and(
          eq(providerLinks.ownerType, 'release'),
          eq(providerLinks.releaseId, releaseId)
        )
      ),
  ]);

  // Group links by track ID
  const linksByTrack = new Map<string, ProviderLink[]>();
  for (const link of trackProviderLinks) {
    if (!link.trackId) continue;
    const existing = linksByTrack.get(link.trackId) ?? [];
    existing.push(link);
    linksByTrack.set(link.trackId, existing);
  }

  // Combine tracks with their links
  const tracksWithProviders = tracks.map(track => ({
    id: track.id,
    releaseId: track.releaseId,
    creatorProfileId: track.creatorProfileId,
    title: track.title,
    slug: track.slug,
    trackNumber: track.trackNumber,
    discNumber: track.discNumber,
    durationMs: track.durationMs,
    isExplicit: track.isExplicit,
    isrc: track.isrc,
    previewUrl: track.previewUrl,
    audioUrl: track.audioUrl,
    audioFormat: track.audioFormat,
    metadata: track.metadata ?? null,
    providerLinks: resolveTrackProviderLinks(
      linksByTrack.get(track.id) ?? [],
      releaseProviderLinks
    ),
  }));

  return {
    tracks: tracksWithProviders,
    total,
    hasMore: offset + limit < total,
  };
}

// ============================================================================
// Recording & Release-Track Functions (new model)
// ============================================================================

export interface UpsertRecordingInput {
  creatorProfileId: string;
  title: string;
  slug: string;
  isrc?: string | null;
  durationMs?: number | null;
  isExplicit?: boolean;
  previewUrl?: string | null;
  audioUrl?: string | null;
  audioFormat?: string | null;
  lyrics?: string | null;
  sourceType?: ReleaseSourceType;
  metadata?: Record<string, unknown>;
}

/**
 * Upsert a recording (canonical audio entity).
 * Conflict resolution: (creatorProfileId, slug).
 * Falls back on ISRC collision by nulling ISRC.
 */
export async function upsertRecording(
  input: UpsertRecordingInput
): Promise<DiscogRecording> {
  const now = new Date();

  const insertData: NewDiscogRecording = {
    creatorProfileId: input.creatorProfileId,
    title: input.title,
    slug: input.slug,
    isrc: input.isrc ?? null,
    durationMs: input.durationMs ?? null,
    isExplicit: input.isExplicit ?? false,
    previewUrl: input.previewUrl ?? null,
    audioUrl: input.audioUrl ?? null,
    audioFormat: input.audioFormat ?? null,
    lyrics: input.lyrics ?? null,
    sourceType: input.sourceType ?? 'ingested',
    metadata: input.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };

  const baseSet = {
    title: input.title,
    isrc: input.isrc ?? null,
    durationMs: input.durationMs ?? null,
    isExplicit: input.isExplicit ?? false,
    previewUrl: input.previewUrl ?? null,
    audioUrl: input.audioUrl ?? null,
    audioFormat: input.audioFormat ?? null,
    ...('lyrics' in input ? { lyrics: input.lyrics ?? null } : {}),
    sourceType: input.sourceType ?? 'ingested',
    metadata: input.metadata ?? {},
    updatedAt: now,
  };

  try {
    const [result] = await db
      .insert(discogRecordings)
      .values(insertData)
      .onConflictDoUpdate({
        target: [discogRecordings.creatorProfileId, discogRecordings.slug],
        set: baseSet,
      })
      .returning();

    return result;
  } catch (error) {
    if (
      !isUniqueConstraintViolation(
        error,
        'discog_recordings_creator_isrc_unique'
      )
    ) {
      throw error;
    }

    // ISRC collision — another recording for this creator already has this ISRC.
    // Store without ISRC; the existing recording is the canonical one.
    const [result] = await db
      .insert(discogRecordings)
      .values({ ...insertData, isrc: null })
      .onConflictDoUpdate({
        target: [discogRecordings.creatorProfileId, discogRecordings.slug],
        set: { ...baseSet, isrc: null },
      })
      .returning();

    return result;
  }
}

export interface UpsertReleaseTrackInput {
  releaseId: string;
  recordingId: string;
  title: string;
  slug: string;
  trackNumber: number;
  discNumber?: number;
  isExplicit?: boolean;
  sourceType?: ReleaseSourceType;
  metadata?: Record<string, unknown>;
}

/**
 * Upsert a release track (recording's appearance on a release).
 * Conflict resolution: (releaseId, discNumber, trackNumber).
 */
export async function upsertReleaseTrack(
  input: UpsertReleaseTrackInput
): Promise<DiscogReleaseTrack> {
  const now = new Date();
  const discNumber = input.discNumber ?? 1;
  const fallbackSlug = `${input.slug}-${discNumber}-${input.trackNumber}`;

  const insertData: NewDiscogReleaseTrack = {
    releaseId: input.releaseId,
    recordingId: input.recordingId,
    title: input.title,
    slug: input.slug,
    trackNumber: input.trackNumber,
    discNumber,
    isExplicit: input.isExplicit ?? false,
    sourceType: input.sourceType ?? 'ingested',
    metadata: input.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };

  const baseSet = {
    recordingId: input.recordingId,
    title: input.title,
    slug: input.slug,
    isExplicit: input.isExplicit ?? false,
    sourceType: input.sourceType ?? 'ingested',
    metadata: input.metadata ?? {},
    updatedAt: now,
  };

  try {
    const [result] = await db
      .insert(discogReleaseTracks)
      .values(insertData)
      .onConflictDoUpdate({
        target: [
          discogReleaseTracks.releaseId,
          discogReleaseTracks.discNumber,
          discogReleaseTracks.trackNumber,
        ],
        set: baseSet,
      })
      .returning();

    return result;
  } catch (error) {
    if (
      !isUniqueConstraintViolation(
        error,
        'discog_release_tracks_release_slug_unique'
      )
    ) {
      throw error;
    }

    // Slug collision within release — use fallback slug
    const [result] = await db
      .insert(discogReleaseTracks)
      .values({ ...insertData, slug: fallbackSlug })
      .onConflictDoUpdate({
        target: [
          discogReleaseTracks.releaseId,
          discogReleaseTracks.discNumber,
          discogReleaseTracks.trackNumber,
        ],
        set: { ...baseSet, slug: fallbackSlug },
      })
      .returning();

    return result;
  }
}

/**
 * Update lyrics on a recording by ID.
 */
export async function updateRecordingLyrics(
  recordingId: string,
  lyrics: string
): Promise<void> {
  await db
    .update(discogRecordings)
    .set({ lyrics, updatedAt: new Date() })
    .where(eq(discogRecordings.id, recordingId));
}

/**
 * Get a recording by slug within a creator's profile.
 */
export async function getRecordingBySlug(
  creatorProfileId: string,
  slug: string
): Promise<DiscogRecording | null> {
  const [recording] = await db
    .select()
    .from(discogRecordings)
    .where(
      and(
        eq(discogRecordings.creatorProfileId, creatorProfileId),
        eq(discogRecordings.slug, slug)
      )
    )
    .limit(1);

  return recording ?? null;
}

/** Release track with recording data and provider links */
export interface ReleaseTrackWithProviders {
  id: string;
  releaseId: string;
  recordingId: string;
  title: string;
  slug: string;
  trackNumber: number;
  discNumber: number;
  isExplicit: boolean;
  // Recording fields (denormalized for display)
  durationMs: number | null;
  isrc: string | null;
  previewUrl: string | null;
  audioUrl: string | null;
  audioFormat: string | null;
  metadata: Record<string, unknown> | null;
  providerLinks: ProviderLink[];
}

export interface ReleaseTracksWithProvidersResult {
  tracks: ReleaseTrackWithProviders[];
  total: number;
  hasMore: boolean;
}

/**
 * Get release tracks for a release with recording data and provider links.
 * Joins discog_release_tracks → discog_recordings, resolves provider links.
 */
export async function getReleaseTracksForReleaseWithProviders(
  releaseId: string,
  options?: { limit?: number; offset?: number }
): Promise<ReleaseTracksWithProvidersResult> {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  // Get total count
  const [countResult] = await db
    .select({ count: drizzleSql<number>`COUNT(*)` })
    .from(discogReleaseTracks)
    .where(eq(discogReleaseTracks.releaseId, releaseId));

  const total = Number(countResult?.count ?? 0);

  if (total === 0) {
    return { tracks: [], total: 0, hasMore: false };
  }

  // Fetch paginated release tracks joined with recordings
  const rows = await db
    .select({
      rt: discogReleaseTracks,
      rec: discogRecordings,
    })
    .from(discogReleaseTracks)
    .innerJoin(
      discogRecordings,
      eq(discogReleaseTracks.recordingId, discogRecordings.id)
    )
    .where(eq(discogReleaseTracks.releaseId, releaseId))
    .orderBy(discogReleaseTracks.discNumber, discogReleaseTracks.trackNumber)
    .limit(limit)
    .offset(offset);

  if (rows.length === 0) {
    return { tracks: [], total, hasMore: false };
  }

  // Fetch provider links for release_tracks and release-level links
  const releaseTrackIds = rows.map(r => r.rt.id);
  let rtProviderLinks: ProviderLink[] = [];
  let releaseProviderLinks: ProviderLink[] = [];

  [rtProviderLinks, releaseProviderLinks] = await Promise.all([
    db
      .select()
      .from(providerLinks)
      .where(
        and(
          eq(providerLinks.ownerType, 'release_track'),
          inArray(providerLinks.releaseTrackId, releaseTrackIds)
        )
      ),
    db
      .select()
      .from(providerLinks)
      .where(
        and(
          eq(providerLinks.ownerType, 'release'),
          eq(providerLinks.releaseId, releaseId)
        )
      ),
  ]);

  // Group links by release track ID
  const linksByReleaseTrack = new Map<string, ProviderLink[]>();
  for (const link of rtProviderLinks) {
    if (!link.releaseTrackId) continue;
    const existing = linksByReleaseTrack.get(link.releaseTrackId) ?? [];
    existing.push(link);
    linksByReleaseTrack.set(link.releaseTrackId, existing);
  }

  // Combine tracks with recordings and provider links
  const tracks: ReleaseTrackWithProviders[] = rows.map(({ rt, rec }) => ({
    id: rt.id,
    releaseId: rt.releaseId,
    recordingId: rt.recordingId,
    title: rt.title,
    slug: rt.slug,
    trackNumber: rt.trackNumber,
    discNumber: rt.discNumber,
    isExplicit: rt.isExplicit,
    durationMs: rec.durationMs,
    isrc: rec.isrc,
    previewUrl: rec.previewUrl,
    audioUrl: rec.audioUrl,
    audioFormat: rec.audioFormat,
    metadata: rec.metadata ?? null,
    providerLinks: resolveTrackProviderLinks(
      linksByReleaseTrack.get(rt.id) ?? [],
      releaseProviderLinks
    ),
  }));

  return {
    tracks,
    total,
    hasMore: offset + limit < total,
  };
}

/**
 * Get track summaries from release_tracks + recordings (new model).
 * Falls back to discog_tracks if release_tracks is empty.
 */
export async function getReleaseTrackSummariesForReleases(
  releaseIds: string[]
): Promise<Map<string, TrackSummary>> {
  if (releaseIds.length === 0) {
    return new Map();
  }

  const summaries = await db
    .select(trackSummarySelectColumns())
    .from(discogReleaseTracks)
    .innerJoin(
      discogRecordings,
      eq(discogReleaseTracks.recordingId, discogRecordings.id)
    )
    .where(inArray(discogReleaseTracks.releaseId, releaseIds))
    .groupBy(discogReleaseTracks.releaseId);

  const summaryMap = new Map<string, TrackSummary>();
  for (const row of summaries) {
    summaryMap.set(row.releaseId, rowToTrackSummary(row));
  }

  // Fall back to old table for any releases not found in new model
  if (summaryMap.size < releaseIds.length) {
    const missingIds = releaseIds.filter(id => !summaryMap.has(id));
    if (missingIds.length > 0) {
      const fallback = await getTrackSummariesForReleases(missingIds);
      for (const [id, summary] of fallback) {
        summaryMap.set(id, summary);
      }
    }
  }

  return summaryMap;
}

/**
 * Aggregate genres across all releases for a creator profile and update
 * the profile's genres with the top 3 most frequent genres.
 */
export async function syncProfileGenresFromReleases(
  creatorProfileId: string
): Promise<void> {
  const releases = await db
    .select({ genres: discogReleases.genres })
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.creatorProfileId, creatorProfileId),
        drizzleSql`${discogReleases.genres} IS NOT NULL`
      )
    );

  // Count frequency of each genre across all releases
  const genreCounts = new Map<string, number>();
  for (const release of releases) {
    if (!release.genres) continue;
    for (const genre of release.genres) {
      const normalized = genre.toLowerCase();
      genreCounts.set(normalized, (genreCounts.get(normalized) ?? 0) + 1);
    }
  }

  // Sort by frequency (desc), then alphabetically for deterministic tiebreak
  const topGenres = Array.from(genreCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([genre]) => genre);

  // Don't overwrite existing genres if no release genres were found
  if (topGenres.length === 0) {
    return;
  }

  await db
    .update(creatorProfiles)
    .set({ genres: topGenres, updatedAt: new Date() })
    .where(eq(creatorProfiles.id, creatorProfileId));
}
