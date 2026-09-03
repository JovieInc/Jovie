import 'server-only';

import { and, sql as drizzleSql, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { profileSurfaceIssues } from '@/lib/db/schema/profile-search';
import {
  type ProfileSurface,
  profileSurfaces,
} from '@/lib/db/schema/profile-surfaces';
import { getMusicBrainzArtist } from '@/lib/dsp-enrichment/providers/musicbrainz';
import {
  assessMusicBrainzDirectoryObservation,
  type MusicBrainzDirectoryAssessment,
  normalizeMusicBrainzIdentifier,
} from './directory-assessment';

export type DirectoryAssessmentPrerequisiteCode =
  | 'surface_identity_mismatch'
  | 'surface_invalid_mbid'
  | 'surface_changed_during_assessment'
  | 'surface_missing_mbid'
  | 'surface_not_found';

export class DirectoryAssessmentPrerequisiteError extends Error {
  constructor(
    public readonly code: DirectoryAssessmentPrerequisiteCode,
    message: string
  ) {
    super(message);
    this.name = 'DirectoryAssessmentPrerequisiteError';
  }
}

interface AssessAndPersistMusicBrainzDirectoryEntityInput {
  readonly creatorProfileId: string;
  readonly surfaceId: string;
  readonly now?: Date;
}

type DirectorySurfaceRevision = Pick<
  ProfileSurface,
  | 'creatorProfileId'
  | 'externalId'
  | 'id'
  | 'identityConfidence'
  | 'kind'
  | 'normalizedUrl'
  | 'platform'
  | 'qualificationStatus'
  | 'updatedAt'
>;

const DIRECTORY_SURFACE_SELECTION = {
  id: profileSurfaces.id,
  creatorProfileId: profileSurfaces.creatorProfileId,
  platform: profileSurfaces.platform,
  kind: profileSurfaces.kind,
  qualificationStatus: profileSurfaces.qualificationStatus,
  identityConfidence: profileSurfaces.identityConfidence,
  externalId: profileSurfaces.externalId,
  normalizedUrl: profileSurfaces.normalizedUrl,
  updatedAt: profileSurfaces.updatedAt,
};

function isSameSurfaceRevision(
  expected: DirectorySurfaceRevision,
  current: DirectorySurfaceRevision
): boolean {
  return (
    expected.id === current.id &&
    expected.creatorProfileId === current.creatorProfileId &&
    expected.platform === current.platform &&
    expected.kind === current.kind &&
    expected.qualificationStatus === current.qualificationStatus &&
    expected.identityConfidence === current.identityConfidence &&
    expected.externalId === current.externalId &&
    expected.normalizedUrl === current.normalizedUrl &&
    expected.updatedAt.getTime() === current.updatedAt.getTime()
  );
}

function matchesSurfaceRevision(surface: DirectorySurfaceRevision) {
  return and(
    eq(profileSurfaces.id, surface.id),
    eq(profileSurfaces.creatorProfileId, surface.creatorProfileId),
    eq(profileSurfaces.platform, surface.platform),
    eq(profileSurfaces.kind, surface.kind),
    eq(profileSurfaces.qualificationStatus, surface.qualificationStatus),
    surface.identityConfidence === null
      ? isNull(profileSurfaces.identityConfidence)
      : eq(profileSurfaces.identityConfidence, surface.identityConfidence),
    surface.externalId === null
      ? isNull(profileSurfaces.externalId)
      : eq(profileSurfaces.externalId, surface.externalId),
    eq(profileSurfaces.normalizedUrl, surface.normalizedUrl),
    eq(profileSurfaces.updatedAt, surface.updatedAt),
    isNull(profileSurfaces.retiredAt)
  );
}

function buildArtistRequestUrl(mbid: string): string {
  return `https://musicbrainz.org/ws/2/artist/${encodeURIComponent(mbid)}?inc=aliases+tags+genres+url-rels&fmt=json`;
}

function severityFor(
  outcome: MusicBrainzDirectoryAssessment['outcome']
): 'high' | 'low' | 'medium' {
  switch (outcome) {
    case 'current':
      return 'low';
    case 'identity_unverified':
    case 'stale_evidence':
      return 'medium';
    default:
      return 'high';
  }
}

function metadataFor(
  assessment: MusicBrainzDirectoryAssessment
): Record<string, unknown> {
  return {
    schemaVersion: assessment.schemaVersion,
    registryEntity: assessment.registryEntity,
    outcome: assessment.outcome,
    confidence: assessment.confidence,
    owner: assessment.owner,
    expectedImpact: assessment.expectedImpact,
    freshness: assessment.freshness,
    evidence: assessment.evidence,
    nextAction: assessment.nextAction,
  };
}

/**
 * Fetch and persist one MusicBrainz authority assessment using Jovie's existing
 * read-only provider and Presence issue registry. No credential or external edit
 * path is reachable from this function.
 */
export async function assessAndPersistMusicBrainzDirectoryEntity(
  input: AssessAndPersistMusicBrainzDirectoryEntityInput
): Promise<{
  readonly issueId: string;
  readonly writeDisposition: 'persisted' | 'stale_ignored';
  readonly assessment: MusicBrainzDirectoryAssessment;
}> {
  const [surface] = await db
    .select(DIRECTORY_SURFACE_SELECTION)
    .from(profileSurfaces)
    .where(
      and(
        eq(profileSurfaces.id, input.surfaceId),
        isNull(profileSurfaces.retiredAt)
      )
    )
    .limit(1);

  if (!surface) {
    throw new DirectoryAssessmentPrerequisiteError(
      'surface_not_found',
      'A live canonical MusicBrainz authority surface is required.'
    );
  }
  if (
    surface.id !== input.surfaceId ||
    surface.creatorProfileId !== input.creatorProfileId ||
    surface.platform !== 'musicbrainz' ||
    surface.kind !== 'authority'
  ) {
    throw new DirectoryAssessmentPrerequisiteError(
      'surface_identity_mismatch',
      'The canonical surface does not belong to the requested creator entity.'
    );
  }
  if (!surface.externalId) {
    throw new DirectoryAssessmentPrerequisiteError(
      'surface_missing_mbid',
      'The canonical MusicBrainz surface must have an MBID before assessment.'
    );
  }
  const mbid = normalizeMusicBrainzIdentifier(surface.externalId);
  if (!mbid) {
    throw new DirectoryAssessmentPrerequisiteError(
      'surface_invalid_mbid',
      'The canonical MusicBrainz surface MBID is malformed.'
    );
  }

  const entity = await getMusicBrainzArtist(mbid);
  const fetchedAt = input.now ?? new Date();
  const assessment = assessMusicBrainzDirectoryObservation({
    surface: {
      id: surface.id,
      creatorProfileId: surface.creatorProfileId,
      platform: 'musicbrainz',
      kind: 'authority',
      qualificationStatus: surface.qualificationStatus,
      identityConfidence: surface.identityConfidence,
      externalId: mbid,
      normalizedUrl: surface.normalizedUrl,
    },
    observation: {
      source: 'musicbrainz_api',
      requestUrl: buildArtistRequestUrl(mbid),
      fetchedAt,
      entity,
    },
    now: fetchedAt,
  });
  const resolved = assessment.outcome === 'current';
  const severity = severityFor(assessment.outcome);
  const metadata = metadataFor(assessment);
  const conflictLifecycle = resolved
    ? {
        state: 'resolved',
        verifiedAt: fetchedAt,
        resolvedAt: drizzleSql<Date | null>`COALESCE(${profileSurfaceIssues.resolvedAt}, excluded.resolved_at)`,
      }
    : {
        // Reopen resolved rows; preserve action state while an issue stays open.
        state: drizzleSql<string>`CASE WHEN ${profileSurfaceIssues.resolvedAt} IS NOT NULL OR ${profileSurfaceIssues.state} = 'resolved' THEN 'detected' ELSE ${profileSurfaceIssues.state} END`,
        actedAt: drizzleSql<Date | null>`CASE WHEN ${profileSurfaceIssues.resolvedAt} IS NOT NULL OR ${profileSurfaceIssues.state} = 'resolved' THEN NULL ELSE ${profileSurfaceIssues.actedAt} END`,
        verifiedAt: null,
        resolvedAt: null,
      };

  const insertSource = db
    .select({
      id: drizzleSql<string>`gen_random_uuid()`.as('id'),
      creatorProfileId: drizzleSql<string>`${assessment.creatorProfileId}`.as(
        'creator_profile_id'
      ),
      surfaceId: drizzleSql<string>`${assessment.surfaceId}`.as('surface_id'),
      issueType: drizzleSql<string>`${'directory_entity_assessment'}`.as(
        'issue_type'
      ),
      state: drizzleSql<string>`${resolved ? 'resolved' : 'detected'}`.as(
        'state'
      ),
      severity: drizzleSql<string>`${severity}`.as('severity'),
      idempotencyKey: drizzleSql<string>`${assessment.idempotencyKey}`.as(
        'idempotency_key'
      ),
      evidenceRunId: drizzleSql<string | null>`${null}`.as('evidence_run_id'),
      primaryUrl: drizzleSql<string>`${assessment.primaryUrl}`.as(
        'primary_url'
      ),
      actedAt: drizzleSql<Date | null>`${null}`.as('acted_at'),
      verifiedAt: drizzleSql<Date | null>`${resolved ? fetchedAt : null}`.as(
        'verified_at'
      ),
      resolvedAt: drizzleSql<Date | null>`${resolved ? fetchedAt : null}`.as(
        'resolved_at'
      ),
      metadata: drizzleSql<
        Record<string, unknown>
      >`${JSON.stringify(metadata)}::jsonb`.as('metadata'),
      createdAt: drizzleSql<Date>`${fetchedAt}`.as('created_at'),
      updatedAt: drizzleSql<Date>`${fetchedAt}`.as('updated_at'),
    })
    .from(profileSurfaces)
    .where(matchesSurfaceRevision(surface))
    .for('update');

  const [issue] = await db
    .insert(profileSurfaceIssues)
    .select(insertSource)
    .onConflictDoUpdate({
      target: profileSurfaceIssues.idempotencyKey,
      set: {
        creatorProfileId: assessment.creatorProfileId,
        surfaceId: assessment.surfaceId,
        issueType: 'directory_entity_assessment',
        severity,
        primaryUrl: assessment.primaryUrl,
        metadata,
        updatedAt: fetchedAt,
        ...conflictLifecycle,
      },
      setWhere: drizzleSql`${profileSurfaceIssues.updatedAt} <= excluded.updated_at`,
    })
    .returning({ id: profileSurfaceIssues.id });

  if (issue) {
    return { issueId: issue.id, writeDisposition: 'persisted', assessment };
  }

  const [currentSurface] = await db
    .select(DIRECTORY_SURFACE_SELECTION)
    .from(profileSurfaces)
    .where(
      and(
        eq(profileSurfaces.id, input.surfaceId),
        isNull(profileSurfaces.retiredAt)
      )
    )
    .limit(1);
  if (!currentSurface || !isSameSurfaceRevision(surface, currentSurface)) {
    throw new DirectoryAssessmentPrerequisiteError(
      'surface_changed_during_assessment',
      'The canonical MusicBrainz surface changed during assessment.'
    );
  }

  const [newerIssue] = await db
    .select({ id: profileSurfaceIssues.id })
    .from(profileSurfaceIssues)
    .where(eq(profileSurfaceIssues.idempotencyKey, assessment.idempotencyKey))
    .limit(1);
  if (!newerIssue) {
    throw new Error('MusicBrainz directory assessment was not persisted.');
  }
  return {
    issueId: newerIssue.id,
    writeDisposition: 'stale_ignored',
    assessment,
  };
}
