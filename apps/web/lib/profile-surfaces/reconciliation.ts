import {
  and,
  sql as drizzleSql,
  eq,
  inArray,
  lt,
  notInArray,
} from 'drizzle-orm';
import { db } from '@/lib/db';
import { dspArtistMatches } from '@/lib/db/schema/dsp-enrichment';
import { artistIdentityLinks } from '@/lib/db/schema/identity';
import { socialLinks } from '@/lib/db/schema/links';
import {
  profileSurfaceQualificationEvents,
  profileSurfaceSources,
  profileSurfaces,
} from '@/lib/db/schema/profile-surfaces';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { publicEnv } from '@/lib/env-public';
import { buildSurfaceCandidates } from './candidates';
import {
  selectDurablyMissingSurfaceIds,
  selectRetirableSurfaceIds,
} from './contracts';

const RETIREMENT_GRACE_MS = 24 * 60 * 60 * 1000;

/** Reconcile one artist after canonical social/DSP writes or bounded backfill. */
export async function reconcileProfileSurfaces(
  creatorProfileId: string
): Promise<{ surfaces: number; sources: number }> {
  const startedAt = new Date();
  const [profileRows, socialRows, dspRows, identityRows, existingRows] =
    await Promise.all([
      db
        .select({
          id: creatorProfiles.id,
          username: creatorProfiles.username,
          displayName: creatorProfiles.displayName,
        })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.id, creatorProfileId))
        .limit(1),
      db
        .select()
        .from(socialLinks)
        .where(
          and(
            eq(socialLinks.creatorProfileId, creatorProfileId),
            eq(socialLinks.isActive, true),
            eq(socialLinks.state, 'active')
          )
        ),
      db
        .select()
        .from(dspArtistMatches)
        .where(
          and(
            eq(dspArtistMatches.creatorProfileId, creatorProfileId),
            inArray(dspArtistMatches.status, ['confirmed', 'auto_confirmed'])
          )
        ),
      db
        .select()
        .from(artistIdentityLinks)
        .where(eq(artistIdentityLinks.creatorProfileId, creatorProfileId)),
      db
        .select({
          id: profileSurfaces.id,
          normalizedUrl: profileSurfaces.normalizedUrl,
          qualificationStatus: profileSurfaces.qualificationStatus,
        })
        .from(profileSurfaces)
        .where(
          and(
            eq(profileSurfaces.creatorProfileId, creatorProfileId),
            drizzleSql`${profileSurfaces.retiredAt} IS NULL`
          )
        ),
    ]);

  const profile = profileRows[0];
  if (!profile) return { surfaces: 0, sources: 0 };

  const values = buildSurfaceCandidates({
    profile,
    publicProfileBaseUrl: publicEnv.NEXT_PUBLIC_PROFILE_URL,
    socials: socialRows,
    dspMatches: dspRows,
    identityLinks: identityRows,
  });
  if (values.length === 0) return { surfaces: 0, sources: 0 };

  const reconciled = await db
    .insert(profileSurfaces)
    .values(
      values.map(value => ({
        creatorProfileId,
        kind: value.kind,
        platform: value.platform,
        displayName: value.displayName,
        handle: value.handle,
        url: value.url,
        normalizedUrl: value.normalizedUrl,
        externalId: value.externalId,
        qualificationStatus: value.qualificationStatus,
        identityConfidence: value.identityConfidence,
        isOfficial: value.isOfficial,
        availability: 'eligible',
        monitoringPriority: value.monitoringPriority,
        lastDiscoveredAt: startedAt,
        lastVerifiedAt:
          value.qualificationStatus === 'qualified' ? startedAt : null,
        retiredAt: null,
        replacedBySurfaceId: null,
        updatedAt: startedAt,
      }))
    )
    .onConflictDoUpdate({
      target: [profileSurfaces.creatorProfileId, profileSurfaces.normalizedUrl],
      targetWhere: drizzleSql`${profileSurfaces.retiredAt} IS NULL`,
      set: {
        kind: drizzleSql`excluded.kind`,
        platform: drizzleSql`excluded.platform`,
        displayName: drizzleSql`excluded.display_name`,
        handle: drizzleSql`excluded.handle`,
        url: drizzleSql`excluded.url`,
        externalId: drizzleSql`excluded.external_id`,
        qualificationStatus: drizzleSql`excluded.qualification_status`,
        identityConfidence: drizzleSql`excluded.identity_confidence`,
        isOfficial: drizzleSql`excluded.is_official`,
        monitoringPriority: drizzleSql`excluded.monitoring_priority`,
        lastDiscoveredAt: startedAt,
        updatedAt: startedAt,
      },
    })
    .returning({
      id: profileSurfaces.id,
      normalizedUrl: profileSurfaces.normalizedUrl,
      qualificationStatus: profileSurfaces.qualificationStatus,
    });

  const surfaceByUrl = new Map(
    reconciled.map(row => [row.normalizedUrl, row] as const)
  );
  const sourceValues = values.flatMap(value => {
    const surface = surfaceByUrl.get(value.normalizedUrl);
    if (!surface) return [];
    return value.sources.map(source => ({
      surfaceId: surface.id,
      sourceType: source.sourceType,
      sourceRefId: source.sourceRefId,
      sourceUrl: source.sourceUrl,
      externalId: source.externalId,
      isLive: true,
      lastSeenAt: startedAt,
    }));
  });

  if (sourceValues.length > 0) {
    await db
      .insert(profileSurfaceSources)
      .values(sourceValues)
      .onConflictDoUpdate({
        target: [
          profileSurfaceSources.sourceType,
          profileSurfaceSources.sourceRefId,
        ],
        set: {
          surfaceId: drizzleSql`excluded.surface_id`,
          sourceUrl: drizzleSql`excluded.source_url`,
          externalId: drizzleSql`excluded.external_id`,
          isLive: true,
          lastSeenAt: startedAt,
        },
      });
  }

  const currentSurfaceIds = reconciled.map(row => row.id);
  const knownSurfaceIds = [
    ...new Set([...existingRows.map(row => row.id), ...currentSurfaceIds]),
  ];
  const previousSourceRows =
    knownSurfaceIds.length === 0
      ? []
      : await db
          .select({
            surfaceId: profileSurfaceSources.surfaceId,
            isLive: profileSurfaceSources.isLive,
            lastSeenAt: profileSurfaceSources.lastSeenAt,
          })
          .from(profileSurfaceSources)
          .where(inArray(profileSurfaceSources.surfaceId, knownSurfaceIds));
  if (knownSurfaceIds.length > 0) {
    await db
      .update(profileSurfaceSources)
      .set({ isLive: false })
      .where(
        and(
          inArray(profileSurfaceSources.surfaceId, knownSurfaceIds),
          lt(profileSurfaceSources.lastSeenAt, startedAt)
        )
      );
  }

  const previousByUrl = new Map(
    existingRows.map(row => [row.normalizedUrl, row] as const)
  );
  const qualificationEvents = reconciled.flatMap(row => {
    const previous = previousByUrl.get(row.normalizedUrl);
    if (previous?.qualificationStatus === row.qualificationStatus) return [];
    return [
      {
        surfaceId: row.id,
        previousStatus: previous?.qualificationStatus ?? null,
        nextStatus: row.qualificationStatus,
        actorType: 'reconciliation',
        reason: previous ? 'source_evidence_changed' : 'surface_discovered',
        evidence: { observedAt: startedAt.toISOString() },
      },
    ];
  });
  if (qualificationEvents.length > 0) {
    await db
      .insert(profileSurfaceQualificationEvents)
      .values(qualificationEvents);
  }

  const liveSourceRows = await db
    .select({ surfaceId: profileSurfaceSources.surfaceId })
    .from(profileSurfaceSources)
    .where(
      and(
        inArray(profileSurfaceSources.surfaceId, knownSurfaceIds),
        eq(profileSurfaceSources.isLive, true)
      )
    );
  const surfacesWithSources = [
    ...new Set(liveSourceRows.map(row => row.surfaceId)),
  ];
  const durablyMissingSurfaceIds = new Set(
    selectDurablyMissingSurfaceIds(
      previousSourceRows,
      new Date(startedAt.getTime() - RETIREMENT_GRACE_MS)
    )
  );
  const surfaceIdsToRetire = selectRetirableSurfaceIds(
    knownSurfaceIds,
    currentSurfaceIds,
    surfacesWithSources
  ).filter(surfaceId => durablyMissingSurfaceIds.has(surfaceId));
  if (surfaceIdsToRetire.length > 0) {
    await db
      .update(profileSurfaces)
      .set({
        availability: 'retired',
        retiredAt: startedAt,
        updatedAt: startedAt,
      })
      .where(
        and(
          inArray(profileSurfaces.id, surfaceIdsToRetire),
          notInArray(profileSurfaces.id, currentSurfaceIds)
        )
      );
  }

  return { surfaces: reconciled.length, sources: sourceValues.length };
}
