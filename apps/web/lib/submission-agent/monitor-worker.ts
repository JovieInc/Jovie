import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  metadataSubmissionIssues,
  metadataSubmissionRequests,
  metadataSubmissionSnapshots,
  metadataSubmissionTargets,
} from '@/lib/db/schema/metadata-submissions';
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

function snapshotHandlerForTarget(targetType: string) {
  if (targetType.startsWith('allmusic_')) {
    return snapshotAllMusicTarget;
  }

  if (targetType.startsWith('amazon_')) {
    return snapshotAmazonTarget;
  }

  return null;
}

async function syncRequestIssues(
  requestId: string,
  issues: SubmissionIssueDraft[]
): Promise<void> {
  await db
    .update(metadataSubmissionIssues)
    .set({
      status: 'resolved',
      resolvedAt: new Date(),
    })
    .where(
      and(
        eq(metadataSubmissionIssues.requestId, requestId),
        eq(metadataSubmissionIssues.status, 'open')
      )
    );

  if (issues.length === 0) {
    return;
  }

  await db.insert(metadataSubmissionIssues).values(
    issues.map(issue => ({
      requestId,
      field: issue.field,
      issueType: issue.issueType,
      severity: issue.severity,
      expectedValue: issue.expectedValue ?? null,
      observedValue: issue.observedValue ?? null,
      status: 'open' as const,
    }))
  );
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

async function upsertTargets(
  requestId: string,
  targets: DiscoveredTarget[]
): Promise<DiscoveredTarget[]> {
  if (targets.length === 0) {
    const existing = await db
      .select()
      .from(metadataSubmissionTargets)
      .where(eq(metadataSubmissionTargets.requestId, requestId));

    return existing.map(target => ({
      targetType: target.targetType,
      canonicalUrl: target.canonicalUrl,
      externalId: target.externalId,
    }));
  }

  for (const target of targets) {
    const [existing] = await db
      .select()
      .from(metadataSubmissionTargets)
      .where(
        and(
          eq(metadataSubmissionTargets.requestId, requestId),
          eq(metadataSubmissionTargets.canonicalUrl, target.canonicalUrl)
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(metadataSubmissionTargets)
        .set({
          lastSeenAt: new Date(),
        })
        .where(eq(metadataSubmissionTargets.id, existing.id));
      continue;
    }

    await db.insert(metadataSubmissionTargets).values({
      requestId,
      targetType: target.targetType,
      canonicalUrl: target.canonicalUrl,
      externalId: target.externalId ?? null,
      lastSeenAt: null,
    });
  }

  const refreshed = await db
    .select()
    .from(metadataSubmissionTargets)
    .where(eq(metadataSubmissionTargets.requestId, requestId))
    .orderBy(asc(metadataSubmissionTargets.discoveredAt));

  return refreshed.map(target => ({
    targetType: target.targetType,
    canonicalUrl: target.canonicalUrl,
    externalId: target.externalId,
  }));
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
    const provider = getSubmissionProvider(request.providerId);
    if (!provider?.diff) {
      continue;
    }

    const canonical = await loadCanonicalSubmissionContext({
      profileId: request.creatorProfileId,
      releaseId: request.releaseId,
    });
    const existingTargets = await upsertTargets(request.id, []);
    const discoveredTargets = await discoverSubmissionTargets({
      providerId: request.providerId,
      canonical,
      existingTargets,
    });
    const allTargets = await upsertTargets(request.id, discoveredTargets);
    const expectedBaseline = await getExpectedBaseline(request.id);

    if (!expectedBaseline || allTargets.length === 0) {
      results.push({
        requestId: request.id,
        status: request.status,
        targets: allTargets.length,
        issues: 0,
      });
      continue;
    }

    let aggregatedIssues: SubmissionIssueDraft[] = [];

    for (const target of allTargets) {
      const snapshotHandler = snapshotHandlerForTarget(target.targetType);
      if (!snapshotHandler) {
        continue;
      }

      const liveSnapshot: ProviderSnapshot | null = await snapshotHandler(
        canonical,
        target
      );

      if (!liveSnapshot) {
        continue;
      }

      const [targetRow] = await db
        .select()
        .from(metadataSubmissionTargets)
        .where(
          and(
            eq(metadataSubmissionTargets.requestId, request.id),
            eq(metadataSubmissionTargets.canonicalUrl, target.canonicalUrl)
          )
        )
        .limit(1);

      await db.insert(metadataSubmissionSnapshots).values({
        requestId: request.id,
        targetId: targetRow?.id ?? null,
        snapshotType: 'live',
        normalizedData: liveSnapshot.normalizedData,
        hash: JSON.stringify(liveSnapshot.normalizedData),
      });

      aggregatedIssues = aggregatedIssues.concat(
        provider.diff(expectedBaseline, liveSnapshot.normalizedData)
      );
    }

    await syncRequestIssues(request.id, aggregatedIssues);

    const nextStatus =
      aggregatedIssues.length === 0
        ? 'live'
        : aggregatedIssues.some(issue => issue.issueType === 'mismatch')
          ? 'manual_followup_needed'
          : 'drifted';

    await db
      .update(metadataSubmissionRequests)
      .set({
        status: nextStatus,
        latestSnapshotAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(metadataSubmissionRequests.id, request.id));

    results.push({
      requestId: request.id,
      status: nextStatus,
      targets: allTargets.length,
      issues: aggregatedIssues.length,
    });
  }

  return results;
}
