import { createHash } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  getUserByClerkId,
  verifyProfileOwnership,
} from '@/lib/db/queries/shared';
import { users } from '@/lib/db/schema/auth';
import {
  artists,
  discogRecordings,
  discogReleases,
  discogReleaseTracks,
  recordingArtists,
} from '@/lib/db/schema/content';
import {
  metadataSubmissionArtifacts,
  metadataSubmissionIssues,
  metadataSubmissionRequests,
  metadataSubmissionSnapshots,
  metadataSubmissionTargets,
} from '@/lib/db/schema/metadata-submissions';
import {
  creatorContacts,
  creatorProfiles,
  profilePhotos,
} from '@/lib/db/schema/profiles';
import {
  assertSupportedSubmissionProviders,
  getPreparableProviderIds,
  getSubmissionProvider,
  getSubmissionProviders,
} from './providers/registry';
import type {
  CanonicalSubmissionContext,
  SubmissionAttachment,
  SubmissionMissingField,
  SubmissionPackage,
  SubmissionTrack,
} from './types';

type SubmissionTrackRow = {
  releaseTrackId: string;
  title: string;
  trackNumber: number;
  discNumber: number;
  durationMs: number | null;
  artistName: string | null;
  role: string | null;
};

export class MetadataSubmissionStateError extends Error {}

function checksum(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function humanizeRole(role: string): string {
  return role
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatTrackCredits(params: {
  role: string;
  artistName: string;
}): string {
  return `${params.artistName} - ${humanizeRole(params.role)}`;
}

function appendUnique(values: string[], value: string) {
  if (!values.includes(value)) {
    values.push(value);
  }
}

export function buildSubmissionTracks(
  rows: SubmissionTrackRow[],
  fallbackPerformer: string
): SubmissionTrack[] {
  const groupedTracks = new Map<
    string,
    SubmissionTrack & { performerNames: string[] }
  >();

  for (const row of rows) {
    const existing =
      groupedTracks.get(row.releaseTrackId) ??
      ({
        title: row.title,
        trackNumber: row.trackNumber,
        discNumber: row.discNumber,
        performer: '',
        performerNames: [],
        composers: [],
        durationMs: row.durationMs,
        credits: [],
      } satisfies SubmissionTrack & { performerNames: string[] });

    if (row.artistName && row.role) {
      if (
        ['main_artist', 'featured_artist', 'remixer', 'with', 'vs'].includes(
          row.role
        )
      ) {
        appendUnique(existing.performerNames, row.artistName);
      }

      if (['composer', 'lyricist', 'arranger'].includes(row.role)) {
        appendUnique(existing.composers, row.artistName);
      }

      appendUnique(
        existing.credits,
        formatTrackCredits({ role: row.role, artistName: row.artistName })
      );
    }

    groupedTracks.set(row.releaseTrackId, existing);
  }

  return Array.from(groupedTracks.values()).map(
    ({ performerNames, ...track }) => ({
      ...track,
      performer: performerNames.join(', ') || fallbackPerformer,
    })
  );
}

function catalogNumberFromMetadata(
  metadata: Record<string, unknown> | null
): string | null {
  const value =
    metadata?.catalogNumber ??
    metadata?.catalog_number ??
    metadata?.catNumber ??
    null;
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function artifactRowsFromPackage(params: {
  requestId: string;
  package: SubmissionPackage;
}) {
  const { requestId, package: packageData } = params;

  const rows: Array<{
    requestId: string;
    kind: string;
    filename: string;
    mimeType: string;
    textBody: string | null;
    blobUrl: string | null;
    checksum: string;
  }> = [
    {
      requestId,
      kind: 'email_subject',
      filename: 'subject.txt',
      mimeType: 'text/plain',
      textBody: packageData.subject,
      blobUrl: null,
      checksum: checksum(packageData.subject),
    },
    {
      requestId,
      kind: 'email_text',
      filename: 'body.txt',
      mimeType: 'text/plain',
      textBody: packageData.text,
      blobUrl: null,
      checksum: checksum(packageData.text),
    },
    {
      requestId,
      kind: 'email_html',
      filename: 'body.html',
      mimeType: 'text/html',
      textBody: packageData.html,
      blobUrl: null,
      checksum: checksum(packageData.html),
    },
  ];

  for (const attachment of packageData.attachments) {
    rows.push({
      requestId,
      kind: attachment.kind,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      textBody: attachment.contentBase64 ?? null,
      blobUrl: attachment.blobUrl ?? null,
      checksum: attachment.checksum,
    });
  }

  return rows;
}

function missingFieldArtifactRows(params: {
  requestId: string;
  missingFields: SubmissionMissingField[];
}) {
  const { requestId, missingFields } = params;

  return missingFields.map(missingField => {
    const payload = JSON.stringify(missingField);

    return {
      requestId,
      kind: 'missing_field',
      filename: `${missingField.field}.json`,
      mimeType: 'application/json',
      textBody: payload,
      blobUrl: null,
      checksum: checksum(payload),
    };
  });
}

export async function getSubmissionRequestForUser(
  requestId: string,
  clerkUserId: string
) {
  const [request] = await db
    .select({
      id: metadataSubmissionRequests.id,
      creatorProfileId: metadataSubmissionRequests.creatorProfileId,
      releaseId: metadataSubmissionRequests.releaseId,
      providerId: metadataSubmissionRequests.providerId,
      status: metadataSubmissionRequests.status,
      approvedAt: metadataSubmissionRequests.approvedAt,
      sentAt: metadataSubmissionRequests.sentAt,
      latestSnapshotAt: metadataSubmissionRequests.latestSnapshotAt,
      providerMessageId: metadataSubmissionRequests.providerMessageId,
      replyToEmail: metadataSubmissionRequests.replyToEmail,
      lastError: metadataSubmissionRequests.lastError,
      createdAt: metadataSubmissionRequests.createdAt,
      updatedAt: metadataSubmissionRequests.updatedAt,
    })
    .from(metadataSubmissionRequests)
    .innerJoin(
      users,
      eq(users.activeProfileId, metadataSubmissionRequests.creatorProfileId)
    )
    .where(
      and(
        eq(metadataSubmissionRequests.id, requestId),
        eq(users.clerkId, clerkUserId)
      )
    )
    .limit(1);

  return request ?? null;
}

export async function loadCanonicalSubmissionContext(params: {
  profileId: string;
  releaseId?: string | null;
}): Promise<CanonicalSubmissionContext> {
  const { profileId, releaseId } = params;

  const [profile, contact, release] = await Promise.all([
    db
      .select({
        id: creatorProfiles.id,
        displayName: creatorProfiles.displayName,
        username: creatorProfiles.username,
        bio: creatorProfiles.bio,
        userEmail: users.email,
      })
      .from(creatorProfiles)
      .leftJoin(users, eq(users.id, creatorProfiles.userId))
      .where(eq(creatorProfiles.id, profileId))
      .limit(1)
      .then(rows => rows[0] ?? null),
    db
      .select({
        email: creatorContacts.email,
      })
      .from(creatorContacts)
      .where(
        and(
          eq(creatorContacts.creatorProfileId, profileId),
          eq(creatorContacts.isActive, true),
          isNotNull(creatorContacts.email)
        )
      )
      .orderBy(asc(creatorContacts.sortOrder), asc(creatorContacts.createdAt))
      .limit(1)
      .then(rows => rows[0] ?? null),
    releaseId
      ? db
          .select({
            id: discogReleases.id,
            title: discogReleases.title,
            releaseType: discogReleases.releaseType,
            releaseDate: discogReleases.releaseDate,
            label: discogReleases.label,
            upc: discogReleases.upc,
            totalTracks: discogReleases.totalTracks,
            artworkUrl: discogReleases.artworkUrl,
            genres: discogReleases.genres,
            metadata: discogReleases.metadata,
          })
          .from(discogReleases)
          .where(
            and(
              eq(discogReleases.id, releaseId),
              eq(discogReleases.creatorProfileId, profileId)
            )
          )
          .limit(1)
          .then(rows => rows[0] ?? null)
      : Promise.resolve(null),
  ]);

  if (!profile) {
    throw new Error('Creator profile not found');
  }

  const trackRows = release
    ? await db
        .select({
          releaseTrackId: discogReleaseTracks.id,
          title: discogReleaseTracks.title,
          trackNumber: discogReleaseTracks.trackNumber,
          discNumber: discogReleaseTracks.discNumber,
          durationMs: discogRecordings.durationMs,
          artistName: artists.name,
          role: recordingArtists.role,
        })
        .from(discogReleaseTracks)
        .innerJoin(
          discogRecordings,
          eq(discogRecordings.id, discogReleaseTracks.recordingId)
        )
        .leftJoin(
          recordingArtists,
          eq(recordingArtists.recordingId, discogRecordings.id)
        )
        .leftJoin(artists, eq(artists.id, recordingArtists.artistId))
        .where(eq(discogReleaseTracks.releaseId, release.id))
        .orderBy(
          asc(discogReleaseTracks.discNumber),
          asc(discogReleaseTracks.trackNumber)
        )
    : [];
  const submissionTracks = buildSubmissionTracks(
    trackRows,
    profile.displayName || profile.username
  );

  const pressPhotos = await db
    .select({
      blobUrl: profilePhotos.largeUrl,
      mediumUrl: profilePhotos.mediumUrl,
      fallbackUrl: profilePhotos.blobUrl,
      mimeType: profilePhotos.mimeType,
      originalFilename: profilePhotos.originalFilename,
    })
    .from(profilePhotos)
    .where(
      and(
        eq(profilePhotos.creatorProfileId, profileId),
        eq(profilePhotos.photoType, 'press'),
        eq(profilePhotos.status, 'ready')
      )
    )
    .orderBy(asc(profilePhotos.sortOrder), asc(profilePhotos.createdAt))
    .limit(3);

  return {
    profileId,
    artistName: profile.displayName?.trim() || profile.username,
    artistBio: profile.bio,
    artistContactEmail: contact?.email ?? profile.userEmail ?? null,
    replyToEmail: contact?.email ?? profile.userEmail ?? null,
    release: release
      ? {
          id: release.id,
          title: release.title,
          releaseType: release.releaseType,
          releaseDate: release.releaseDate,
          label: release.label,
          upc: release.upc,
          totalTracks: release.totalTracks || submissionTracks.length,
          artworkUrl: release.artworkUrl,
          genres: release.genres ?? [],
          catalogNumber: catalogNumberFromMetadata(
            (release.metadata as Record<string, unknown> | null) ?? null
          ),
        }
      : null,
    tracks: submissionTracks,
    pressPhotos: pressPhotos
      .map((photo, index) => {
        const url = photo.blobUrl ?? photo.mediumUrl ?? photo.fallbackUrl;
        if (!url) {
          return null;
        }

        return {
          kind: 'press_photo' as const,
          filename:
            photo.originalFilename?.trim() || `press-photo-${index + 1}.jpg`,
          mimeType: photo.mimeType?.trim() || 'image/jpeg',
          url,
        };
      })
      .filter((asset): asset is NonNullable<typeof asset> => asset !== null),
  };
}

export async function getStoredSubmissionPackage(
  requestId: string
): Promise<SubmissionPackage | null> {
  const artifacts = await db
    .select()
    .from(metadataSubmissionArtifacts)
    .where(eq(metadataSubmissionArtifacts.requestId, requestId))
    .orderBy(asc(metadataSubmissionArtifacts.createdAt));

  const expectedSnapshot = await db
    .select()
    .from(metadataSubmissionSnapshots)
    .where(
      and(
        eq(metadataSubmissionSnapshots.requestId, requestId),
        eq(metadataSubmissionSnapshots.snapshotType, 'expected')
      )
    )
    .orderBy(desc(metadataSubmissionSnapshots.observedAt))
    .limit(1)
    .then(rows => rows[0] ?? null);

  if (artifacts.length === 0 || !expectedSnapshot) {
    return null;
  }

  const subject = artifacts.find(artifact => artifact.kind === 'email_subject');
  const text = artifacts.find(artifact => artifact.kind === 'email_text');
  const html = artifacts.find(artifact => artifact.kind === 'email_html');

  if (!subject?.textBody || !text?.textBody || !html?.textBody) {
    return null;
  }

  const attachments: SubmissionAttachment[] = artifacts
    .filter(
      artifact =>
        artifact.kind !== 'email_subject' &&
        artifact.kind !== 'email_text' &&
        artifact.kind !== 'email_html' &&
        artifact.kind !== 'missing_field'
    )
    .map(artifact => ({
      kind: artifact.kind,
      filename: artifact.filename,
      mimeType: artifact.mimeType,
      contentBase64: artifact.textBody ?? undefined,
      blobUrl: artifact.blobUrl ?? undefined,
      checksum: artifact.checksum,
    }));

  return {
    subject: subject.textBody,
    text: text.textBody,
    html: html.textBody,
    attachments,
    monitoringBaseline: expectedSnapshot.normalizedData,
  };
}

async function persistPreparedRequest(params: {
  profileId: string;
  releaseId?: string | null;
  providerId: string;
  replyToEmail: string | null;
  packageData: SubmissionPackage | null;
  missingFields: SubmissionMissingField[];
}) {
  const {
    profileId,
    releaseId,
    providerId,
    replyToEmail,
    packageData,
    missingFields,
  } = params;
  const [request] = await db
    .insert(metadataSubmissionRequests)
    .values({
      creatorProfileId: profileId,
      releaseId: releaseId ?? null,
      providerId,
      replyToEmail,
      status: packageData ? 'awaiting_approval' : 'draft',
    })
    .returning();

  if (packageData) {
    await db.insert(metadataSubmissionArtifacts).values(
      artifactRowsFromPackage({
        requestId: request.id,
        package: packageData,
      })
    );

    await db.insert(metadataSubmissionSnapshots).values({
      requestId: request.id,
      targetId: null,
      snapshotType: 'expected',
      normalizedData: packageData.monitoringBaseline,
      hash: checksum(JSON.stringify(packageData.monitoringBaseline)),
    });
  } else if (missingFields.length > 0) {
    await db.insert(metadataSubmissionArtifacts).values(
      missingFieldArtifactRows({
        requestId: request.id,
        missingFields,
      })
    );
  }

  return request;
}

export async function prepareMetadataSubmissions(params: {
  profileId: string;
  releaseId?: string | null;
  providerIds?: string[];
}) {
  const providerIds =
    params.providerIds && params.providerIds.length > 0
      ? params.providerIds
      : getPreparableProviderIds();

  assertSupportedSubmissionProviders(providerIds);

  const canonical = await loadCanonicalSubmissionContext({
    profileId: params.profileId,
    releaseId: params.releaseId,
  });

  const results: Array<{
    requestId: string;
    providerId: string;
    status: string;
    missingFields: SubmissionMissingField[];
  }> = [];

  for (const providerId of providerIds) {
    const provider = getSubmissionProvider(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} is not registered`);
    }

    const buildResult = await provider.buildPackage({ canonical });
    const request = await persistPreparedRequest({
      profileId: params.profileId,
      releaseId: params.releaseId,
      providerId,
      replyToEmail: canonical.replyToEmail,
      packageData: buildResult.package,
      missingFields: buildResult.missingFields,
    });

    results.push({
      requestId: request.id,
      providerId,
      status: request.status,
      missingFields: buildResult.missingFields,
    });
  }

  return {
    canonical,
    requests: results,
  };
}

export async function approveAndQueueMetadataSubmission(requestId: string) {
  const [request] = await db
    .select()
    .from(metadataSubmissionRequests)
    .where(eq(metadataSubmissionRequests.id, requestId))
    .limit(1);

  if (!request) {
    throw new Error('Metadata submission request not found');
  }

  if (request.status !== 'awaiting_approval') {
    throw new MetadataSubmissionStateError(
      'Only awaiting approval requests can be queued'
    );
  }

  await db
    .update(metadataSubmissionRequests)
    .set({
      status: 'queued',
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(metadataSubmissionRequests.id, requestId));
}

export async function getMetadataSubmissionStatus(params: {
  requestId?: string;
  profileId?: string;
  releaseId?: string;
}) {
  if (!params.requestId && !params.profileId) {
    throw new Error('requestId or profileId is required');
  }

  const requestRows = params.requestId
    ? await db
        .select()
        .from(metadataSubmissionRequests)
        .where(eq(metadataSubmissionRequests.id, params.requestId))
        .orderBy(desc(metadataSubmissionRequests.createdAt))
    : await db
        .select()
        .from(metadataSubmissionRequests)
        .where(
          params.releaseId
            ? and(
                eq(
                  metadataSubmissionRequests.creatorProfileId,
                  params.profileId!
                ),
                eq(metadataSubmissionRequests.releaseId, params.releaseId)
              )
            : eq(metadataSubmissionRequests.creatorProfileId, params.profileId!)
        )
        .orderBy(desc(metadataSubmissionRequests.createdAt));

  const requestIds = requestRows.map(request => request.id);
  if (requestIds.length === 0) {
    return [];
  }

  const [targets, issues, snapshots, artifacts] = await Promise.all([
    db
      .select()
      .from(metadataSubmissionTargets)
      .where(inArray(metadataSubmissionTargets.requestId, requestIds)),
    db
      .select()
      .from(metadataSubmissionIssues)
      .where(inArray(metadataSubmissionIssues.requestId, requestIds)),
    db
      .select()
      .from(metadataSubmissionSnapshots)
      .where(inArray(metadataSubmissionSnapshots.requestId, requestIds))
      .orderBy(desc(metadataSubmissionSnapshots.observedAt)),
    db
      .select({
        requestId: metadataSubmissionArtifacts.requestId,
        textBody: metadataSubmissionArtifacts.textBody,
      })
      .from(metadataSubmissionArtifacts)
      .where(
        and(
          inArray(metadataSubmissionArtifacts.requestId, requestIds),
          eq(metadataSubmissionArtifacts.kind, 'missing_field')
        )
      ),
  ]);

  return requestRows.map(request => ({
    ...request,
    timeline: {
      createdAt: request.createdAt,
      approvedAt: request.approvedAt,
      sentAt: request.sentAt,
      latestSnapshotAt: request.latestSnapshotAt,
    },
    missingFields: artifacts
      .filter(
        artifact => artifact.requestId === request.id && artifact.textBody
      )
      .flatMap(artifact => {
        try {
          return [JSON.parse(artifact.textBody!) as SubmissionMissingField];
        } catch {
          return [];
        }
      }),
    targets: targets.filter(target => target.requestId === request.id),
    issues: issues.filter(issue => issue.requestId === request.id),
    snapshots: snapshots.filter(snapshot => snapshot.requestId === request.id),
  }));
}

export async function draftMetadataSubmissionCorrection(requestId: string) {
  const [request, openIssues] = await Promise.all([
    db
      .select()
      .from(metadataSubmissionRequests)
      .where(eq(metadataSubmissionRequests.id, requestId))
      .limit(1)
      .then(rows => rows[0] ?? null),
    db
      .select()
      .from(metadataSubmissionIssues)
      .where(
        and(
          eq(metadataSubmissionIssues.requestId, requestId),
          eq(metadataSubmissionIssues.status, 'open')
        )
      ),
  ]);

  if (!request) {
    throw new Error('Metadata submission request not found');
  }

  const provider = getSubmissionProvider(request.providerId);
  if (!provider) {
    throw new Error(`Provider ${request.providerId} is not registered`);
  }

  const canonical = await loadCanonicalSubmissionContext({
    profileId: request.creatorProfileId,
    releaseId: request.releaseId,
  });
  const buildResult = await provider.buildPackage({ canonical });
  if (!buildResult.package) {
    throw new Error('Unable to build correction package');
  }

  const issueSummary = openIssues
    .map(issue => `${issue.field}: ${issue.issueType}`)
    .join('\n');
  const correctionPackage: SubmissionPackage = {
    ...buildResult.package,
    subject: `Correction Request — ${buildResult.package.subject}`,
    text: `${buildResult.package.text}\n\nCorrection summary:\n${issueSummary}`,
    html: `${buildResult.package.html}<p><strong>Correction summary</strong></p><pre>${issueSummary}</pre>`,
  };

  const correctionRequest = await persistPreparedRequest({
    profileId: request.creatorProfileId,
    releaseId: request.releaseId,
    providerId: request.providerId,
    replyToEmail: request.replyToEmail,
    packageData: correctionPackage,
    missingFields: [],
  });

  return {
    requestId: correctionRequest.id,
    providerId: correctionRequest.providerId,
    status: correctionRequest.status,
  };
}

export async function verifySubmissionProfileOwnership(
  profileId: string,
  clerkUserId: string
) {
  return verifyProfileOwnership(db, profileId, clerkUserId);
}

export async function getSubmissionProvidersForApi() {
  return getSubmissionProviders().map(provider => ({
    id: provider.id,
    displayName: provider.displayName,
    transport: provider.transport,
    requiredInputs: provider.requiredInputs,
    launchReady: provider.id === 'xperi_allmusic_email',
  }));
}

export async function getAuthenticatedSubmissionRequest(
  requestId: string,
  clerkUserId: string
) {
  const request = await getSubmissionRequestForUser(requestId, clerkUserId);
  if (!request) {
    return null;
  }

  const user = await getUserByClerkId(db, clerkUserId);
  return {
    request,
    user,
  };
}
