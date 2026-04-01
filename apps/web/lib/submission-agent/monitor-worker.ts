import { createHash } from 'node:crypto';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  type MetadataSubmissionRequest,
  type MetadataSubmissionTarget,
  metadataSubmissionIssues,
  metadataSubmissionRequests,
  metadataSubmissionSnapshots,
  metadataSubmissionTargets,
} from '@/lib/db/schema/metadata-submissions';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';
import { discoverSubmissionTargets } from './monitoring/discovery';
import { snapshotAllMusicTarget } from './monitoring/providers/allmusic';
import { snapshotAmazonTarget } from './monitoring/providers/amazon';
import { getSubmissionProvider } from './providers/registry';
import { loadCanonicalSubmissionContext } from './service';
import type {
  DiscoveredTarget,
  ProviderSnapshot,
  SubmissionIssueDraft,
} from './types';

function getRequiredTargetTypes(params: {
  providerId: string;
  canonical: Awaited<ReturnType<typeof loadCanonicalSubmissionContext>>;
}): string[] {
  const requiredTargetTypes = new Set<string>();

  if (params.providerId === 'xperi_allmusic_email') {
    if (params.canonical.release) {
      requiredTargetTypes.add('allmusic_release_page');
    }

    if (
      params.canonical.artistBio?.trim() ||
      params.canonical.pressPhotos.length > 0
    ) {
      requiredTargetTypes.add('allmusic_artist_page');
    }
  }

  return Array.from(requiredTargetTypes);
}

function snapshotHandlerForTarget(targetType: string) {
  if (targetType.startsWith('allmusic_')) {
    return snapshotAllMusicTarget;
  }

  if (targetType.startsWith('amazon_')) {
    return snapshotAmazonTarget;
  }

  return null;
}

function toDiscoveredTarget(
  target: MetadataSubmissionTarget
): DiscoveredTarget {
  return {
    targetType: target.targetType,
    canonicalUrl: target.canonicalUrl,
    externalId: target.externalId,
  };
}

function sortHashValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortHashValue);
  }

  if (value && typeof value === 'object') {
    return Object.entries(value)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .reduce<Record<string, unknown>>((sorted, [key, entryValue]) => {
        sorted[key] = sortHashValue(entryValue);
        return sorted;
      }, {});
  }

  return value;
}

function computeSnapshotHash(data: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(sortHashValue(data)))
    .digest('hex');
}

function getIssueKey(issue: {
  field: string;
  issueType: SubmissionIssueDraft['issueType'];
}): string {
  return `${issue.field}:${issue.issueType}`;
}

function getPersistedIssueKey(issue: {
  field: string;
  issueType: string;
}): string {
  return getIssueKey({
    field: issue.field,
    issueType: issue.issueType as SubmissionIssueDraft['issueType'],
  });
}

async function syncRequestIssues(
  requestId: string,
  issues: SubmissionIssueDraft[]
): Promise<void> {
  const existingIssues = await db
    .select()
    .from(metadataSubmissionIssues)
    .where(eq(metadataSubmissionIssues.requestId, requestId));
  const existingByKey = new Map(
    existingIssues.map(issue => [getPersistedIssueKey(issue), issue])
  );
  const nextIssueKeys = new Set(issues.map(getIssueKey));

  for (const issue of issues) {
    const existingIssue = existingByKey.get(getIssueKey(issue));

    if (!existingIssue) {
      await db.insert(metadataSubmissionIssues).values({
        requestId,
        field: issue.field,
        issueType: issue.issueType,
        severity: issue.severity,
        expectedValue: issue.expectedValue ?? null,
        observedValue: issue.observedValue ?? null,
        status: 'open',
      });
      continue;
    }

    const expectedValue = issue.expectedValue ?? null;
    const observedValue = issue.observedValue ?? null;
    const requiresRefresh =
      existingIssue.status !== 'open' ||
      existingIssue.severity !== issue.severity ||
      existingIssue.expectedValue !== expectedValue ||
      existingIssue.observedValue !== observedValue;

    if (!requiresRefresh) {
      continue;
    }

    await db
      .update(metadataSubmissionIssues)
      .set({
        severity: issue.severity,
        expectedValue,
        observedValue,
        status: 'open',
        resolvedAt: null,
      })
      .where(eq(metadataSubmissionIssues.id, existingIssue.id));
  }

  for (const existingIssue of existingIssues) {
    if (
      existingIssue.status === 'open' &&
      !nextIssueKeys.has(getPersistedIssueKey(existingIssue))
    ) {
      await db
        .update(metadataSubmissionIssues)
        .set({
          status: 'resolved',
          resolvedAt: new Date(),
        })
        .where(eq(metadataSubmissionIssues.id, existingIssue.id));
    }
  }
}

async function getExpectedBaseline(requestId: string) {
  const [snapshot] = await db
    .select()
    .from(metadataSubmissionSnapshots)
    .where(
      and(
        eq(metadataSubmissionSnapshots.requestId, requestId),
        eq(metadataSubmissionSnapshots.snapshotType, 'expected')
      )
    )
    .orderBy(desc(metadataSubmissionSnapshots.observedAt))
    .limit(1);

  return snapshot?.normalizedData ?? null;
}

async function upsertTargets(requestId: string, targets: DiscoveredTarget[]) {
  if (targets.length > 0) {
    const lastSeenAt = new Date();

    await db
      .insert(metadataSubmissionTargets)
      .values(
        targets.map(target => ({
          requestId,
          targetType: target.targetType,
          canonicalUrl: target.canonicalUrl,
          externalId: target.externalId ?? null,
          lastSeenAt,
        }))
      )
      .onConflictDoUpdate({
        target: [
          metadataSubmissionTargets.requestId,
          metadataSubmissionTargets.canonicalUrl,
        ],
        set: {
          lastSeenAt,
        },
      });
  }

  return db
    .select()
    .from(metadataSubmissionTargets)
    .where(eq(metadataSubmissionTargets.requestId, requestId))
    .orderBy(asc(metadataSubmissionTargets.discoveredAt));
}

function computeNextStatus(issues: SubmissionIssueDraft[]) {
  if (issues.length === 0) {
    return 'live' as const;
  }

  if (issues.some(issue => issue.issueType === 'mismatch')) {
    return 'manual_followup_needed' as const;
  }

  return 'drifted' as const;
}

async function collectTargetSnapshots(params: {
  requestId: string;
  canonical: Awaited<ReturnType<typeof loadCanonicalSubmissionContext>>;
  targetRows: MetadataSubmissionTarget[];
  expectedBaseline: ProviderSnapshot['normalizedData'];
  diff: NonNullable<
    NonNullable<ReturnType<typeof getSubmissionProvider>>['diff']
  >;
}) {
  const aggregatedIssues: SubmissionIssueDraft[] = [];
  const successfulTargetTypes = new Set<string>();

  for (const targetRow of params.targetRows) {
    const target = toDiscoveredTarget(targetRow);
    const snapshotHandler = snapshotHandlerForTarget(target.targetType);

    if (!snapshotHandler) {
      continue;
    }

    const liveSnapshot: ProviderSnapshot | null = await snapshotHandler(
      params.canonical,
      target
    );
    if (!liveSnapshot) {
      continue;
    }

    successfulTargetTypes.add(target.targetType);

    await db.insert(metadataSubmissionSnapshots).values({
      requestId: params.requestId,
      targetId: targetRow.id,
      snapshotType: 'live',
      normalizedData: liveSnapshot.normalizedData,
      hash: computeSnapshotHash(liveSnapshot.normalizedData),
    });

    await db
      .update(metadataSubmissionTargets)
      .set({ lastSeenAt: new Date() })
      .where(eq(metadataSubmissionTargets.id, targetRow.id));

    aggregatedIssues.push(
      ...params.diff(params.expectedBaseline, liveSnapshot.normalizedData)
    );
  }

  return {
    aggregatedIssues,
    successfulTargetTypes,
  };
}

async function processMonitoringRequest(
  request: MetadataSubmissionRequest,
  diff: NonNullable<
    NonNullable<ReturnType<typeof getSubmissionProvider>>['diff']
  >
) {
  const canonical = await loadCanonicalSubmissionContext({
    profileId: request.creatorProfileId,
    releaseId: request.releaseId,
  });
  const requiredTargetTypes = getRequiredTargetTypes({
    providerId: request.providerId,
    canonical,
  });
  const existingTargetRows = await upsertTargets(request.id, []);
  const discoveredTargets = await discoverSubmissionTargets({
    providerId: request.providerId,
    canonical,
    existingTargets: existingTargetRows.map(toDiscoveredTarget),
  });
  const targetRows = await upsertTargets(request.id, discoveredTargets);
  const expectedBaseline = await getExpectedBaseline(request.id);

  if (!expectedBaseline || targetRows.length === 0) {
    return {
      requestId: request.id,
      status: request.status,
      targets: targetRows.length,
      issues: 0,
    };
  }

  const { aggregatedIssues, successfulTargetTypes } =
    await collectTargetSnapshots({
      requestId: request.id,
      canonical,
      targetRows,
      expectedBaseline,
      diff,
    });
  const hasRequiredCoverage = requiredTargetTypes.every(targetType =>
    successfulTargetTypes.has(targetType)
  );

  if (!hasRequiredCoverage) {
    return {
      requestId: request.id,
      status: request.status,
      targets: targetRows.length,
      issues: aggregatedIssues.length,
    };
  }

  await syncRequestIssues(request.id, aggregatedIssues);

  const nextStatus = computeNextStatus(aggregatedIssues);

  await db
    .update(metadataSubmissionRequests)
    .set({
      status: nextStatus,
      latestSnapshotAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(metadataSubmissionRequests.id, request.id));

  return {
    requestId: request.id,
    status: nextStatus,
    targets: targetRows.length,
    issues: aggregatedIssues.length,
  };
}

export async function monitorMetadataSubmissionRequests(params?: {
  requestIds?: string[];
  limit?: number;
}) {
  const requests = params?.requestIds?.length
    ? await db
        .select()
        .from(metadataSubmissionRequests)
        .where(inArray(metadataSubmissionRequests.id, params.requestIds))
        .orderBy(asc(metadataSubmissionRequests.createdAt))
    : await db
        .select()
        .from(metadataSubmissionRequests)
        .where(
          inArray(metadataSubmissionRequests.status, [
            'sent',
            'acknowledged',
            'live',
            'drifted',
            'manual_followup_needed',
          ])
        )
        .orderBy(asc(metadataSubmissionRequests.createdAt))
        .limit(params?.limit ?? 10);

  const results: Array<{
    requestId: string;
    status: string;
    targets: number;
    issues: number;
  }> = [];

  for (const request of requests) {
    try {
      const provider = getSubmissionProvider(request.providerId);
      if (!provider?.diff) {
        continue;
      }

      results.push(await processMonitoringRequest(request, provider.diff));
    } catch (error) {
      logger.error('Metadata submission monitor request failed', {
        error,
        providerId: request.providerId,
        requestId: request.id,
      });
      await captureError('Metadata submission monitor request failed', error, {
        providerId: request.providerId,
        requestId: request.id,
      });
      results.push({
        requestId: request.id,
        status: request.status,
        targets: 0,
        issues: 0,
      });
    }
  }

  return results;
}
