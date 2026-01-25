import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, doesTableExist } from '@/lib/db';
import {
  type ProviderLink as DbProviderLink,
  type DiscogRelease,
  discogReleases,
  discogTracks,
  type NewDiscogRelease,
  type NewDiscogTrack,
  type NewProviderLink,
  providerLinks,
} from '@/lib/db/schema';

/** Track summary data aggregated per release */
export interface TrackSummary {
  totalDurationMs: number | null;
  primaryIsrc: string | null;
}

// Types for release data with provider links
export interface ReleaseWithProviders extends DiscogRelease {
  providerLinks: DbProviderLink[];
  trackSummary?: TrackSummary;
}

async function hasDiscogReleasesTable(): Promise<boolean> {
  return doesTableExist('discog_releases');
}

async function hasDiscogTracksTable(): Promise<boolean> {
  return doesTableExist('discog_tracks');
}

async function hasProviderLinksTable(): Promise<boolean> {
  return doesTableExist('provider_links');
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
    | 'other';
  releaseDate?: Date | null;
  label?: string | null;
  upc?: string | null;
  totalTracks?: number;
  isExplicit?: boolean;
  artworkUrl?: string | null;
  spotifyPopularity?: number | null;
  sourceType?: 'manual' | 'admin' | 'ingested';
  metadata?: Record<string, unknown>;
}

// Base fields shared by both release and track links
interface UpsertProviderLinkBase {
  providerId: string;
  url: string;
  externalId?: string | null;
  sourceType?: 'manual' | 'admin' | 'ingested';
  isPrimary?: boolean;
  metadata?: Record<string, unknown>;
}

// Release-level provider link input
export interface UpsertReleaseProviderLinkInput extends UpsertProviderLinkBase {
  releaseId: string;
  trackId?: never;
}

// Track-level provider link input
export interface UpsertTrackProviderLinkInput extends UpsertProviderLinkBase {
  trackId: string;
  releaseId?: never;
}

// Union type for the function
export type UpsertProviderLinkInput =
  | UpsertReleaseProviderLinkInput
  | UpsertTrackProviderLinkInput;

/**
 * Get track summaries (total duration, primary ISRC) for releases
 */
async function getTrackSummariesForReleases(
  releaseIds: string[]
): Promise<Map<string, TrackSummary>> {
  if (releaseIds.length === 0 || !(await hasDiscogTracksTable())) {
    return new Map();
  }

  // Aggregate track data per release using raw SQL for efficiency
  const summaries = await db
    .select({
      releaseId: discogTracks.releaseId,
      totalDurationMs: sql<number>`sum(${discogTracks.durationMs})`.as(
        'total_duration_ms'
      ),
      primaryIsrc:
        sql<string>`(array_agg(${discogTracks.isrc} ORDER BY ${discogTracks.discNumber}, ${discogTracks.trackNumber}))[1]`.as(
          'primary_isrc'
        ),
    })
    .from(discogTracks)
    .where(inArray(discogTracks.releaseId, releaseIds))
    .groupBy(discogTracks.releaseId);

  const summaryMap = new Map<string, TrackSummary>();
  for (const row of summaries) {
    summaryMap.set(row.releaseId, {
      totalDurationMs: row.totalDurationMs ?? null,
      primaryIsrc: row.primaryIsrc ?? null,
    });
  }
  return summaryMap;
}

/**
 * Get all releases for a creator profile with their provider links
 */
export async function getReleasesForProfile(
  creatorProfileId: string
): Promise<ReleaseWithProviders[]> {
  if (!(await hasDiscogReleasesTable())) {
    return [];
  }

  // Fetch releases
  const releases = await db
    .select()
    .from(discogReleases)
    .where(eq(discogReleases.creatorProfileId, creatorProfileId))
    .orderBy(discogReleases.releaseDate);

  if (releases.length === 0) {
    return [];
  }

  const releaseIds = releases.map(r => r.id);

  // Fetch track summaries (duration, ISRC) in parallel with provider links
  const [trackSummaries, providerLinksResult] = await Promise.all([
    getTrackSummariesForReleases(releaseIds),
    hasProviderLinksTable().then(async hasTable => {
      if (!hasTable) return [];
      const links = await db
        .select()
        .from(providerLinks)
        .where(eq(providerLinks.ownerType, 'release'));
      // Filter links to only those belonging to our releases
      const releaseIdSet = new Set(releaseIds);
      return links.filter(
        link => link.releaseId && releaseIdSet.has(link.releaseId)
      );
    }),
  ]);

  // Group links by release ID
  const linksByRelease = new Map<string, DbProviderLink[]>();
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
  if (!(await hasDiscogReleasesTable())) {
    return null;
  }

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

  if (!(await hasProviderLinksTable())) {
    return {
      ...release,
      providerLinks: [],
    };
  }

  // Fetch provider links for this release
  const links = await db
    .select()
    .from(providerLinks)
    .where(
      and(
        eq(providerLinks.ownerType, 'release'),
        eq(providerLinks.releaseId, release.id)
      )
    );

  return {
    ...release,
    providerLinks: links,
  };
}

/**
 * Get a release by ID
 */
export async function getReleaseById(
  releaseId: string
): Promise<ReleaseWithProviders | null> {
  if (!(await hasDiscogReleasesTable())) {
    return null;
  }

  const [release] = await db
    .select()
    .from(discogReleases)
    .where(eq(discogReleases.id, releaseId))
    .limit(1);

  if (!release) {
    return null;
  }

  if (!(await hasProviderLinksTable())) {
    return {
      ...release,
      providerLinks: [],
    };
  }

  // Fetch provider links for this release
  const links = await db
    .select()
    .from(providerLinks)
    .where(
      and(
        eq(providerLinks.ownerType, 'release'),
        eq(providerLinks.releaseId, release.id)
      )
    );

  return {
    ...release,
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

/**
 * Upsert a provider link for a release or track
 */
export async function upsertProviderLink(
  input: UpsertProviderLinkInput
): Promise<DbProviderLink> {
  const now = new Date();

  // Determine owner type based on which ID is provided
  const isTrackLink = 'trackId' in input && input.trackId;
  const ownerType = isTrackLink ? 'track' : 'release';

  const insertData: NewProviderLink = {
    providerId: input.providerId,
    ownerType,
    releaseId: isTrackLink
      ? null
      : (input as UpsertReleaseProviderLinkInput).releaseId,
    trackId: isTrackLink
      ? (input as UpsertTrackProviderLinkInput).trackId
      : null,
    url: input.url,
    externalId: input.externalId ?? null,
    sourceType: input.sourceType ?? 'ingested',
    isPrimary: input.isPrimary ?? false,
    metadata: input.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };

  // Use the appropriate unique constraint target
  const conflictTarget = isTrackLink
    ? [providerLinks.providerId, providerLinks.trackId]
    : [providerLinks.providerId, providerLinks.releaseId];

  // Try to insert, on conflict update
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
}

/**
 * Get a provider link for a release
 */
export async function getProviderLink(
  releaseId: string,
  providerId: string
): Promise<DbProviderLink | null> {
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
): Promise<DbProviderLink | null> {
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
  sourceType?: 'manual' | 'admin' | 'ingested';
  metadata?: Record<string, unknown>;
}): Promise<typeof discogTracks.$inferSelect> {
  const now = new Date();

  const insertData: NewDiscogTrack = {
    releaseId: input.releaseId,
    creatorProfileId: input.creatorProfileId,
    title: input.title,
    slug: input.slug,
    trackNumber: input.trackNumber,
    discNumber: input.discNumber ?? 1,
    durationMs: input.durationMs ?? null,
    isExplicit: input.isExplicit ?? false,
    isrc: input.isrc ?? null,
    previewUrl: input.previewUrl ?? null,
    sourceType: input.sourceType ?? 'ingested',
    metadata: input.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };

  const [result] = await db
    .insert(discogTracks)
    .values(insertData)
    .onConflictDoUpdate({
      target: [
        discogTracks.releaseId,
        discogTracks.discNumber,
        discogTracks.trackNumber,
      ],
      set: {
        title: input.title,
        slug: input.slug,
        durationMs: input.durationMs ?? null,
        isExplicit: input.isExplicit ?? false,
        isrc: input.isrc ?? null,
        previewUrl: input.previewUrl ?? null,
        sourceType: input.sourceType ?? 'ingested',
        metadata: input.metadata ?? {},
        updatedAt: now,
      },
    })
    .returning();

  return result;
}

/**
 * Get tracks for a release
 */
export async function getTracksForRelease(
  releaseId: string
): Promise<(typeof discogTracks.$inferSelect)[]> {
  if (!(await hasDiscogTracksTable())) {
    return [];
  }

  return db
    .select()
    .from(discogTracks)
    .where(eq(discogTracks.releaseId, releaseId))
    .orderBy(discogTracks.discNumber, discogTracks.trackNumber);
}
