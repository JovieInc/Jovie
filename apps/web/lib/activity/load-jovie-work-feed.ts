import 'server-only';

import { and, desc, eq, gte, or } from 'drizzle-orm';
import {
  type JovieWorkItem,
  mapAgentRunToJovieWorkItem,
  mapFanNotificationToJovieWorkItem,
  mapMerchFulfillmentJobToJovieWorkItem,
  mapMetadataSubmissionToJovieWorkItem,
  mapRetouchJobToJovieWorkItem,
  mapSuggestedActionToJovieWorkItem,
  mapWorkflowRunToJovieWorkItem,
  mergeJovieWorkItems,
} from '@/lib/activity/jovie-work-feed';
import { db } from '@/lib/db';
import { retouchJobs } from '@/lib/db/schema/agents';
import {
  agentRuns,
  suggestedActions,
  workflowRuns,
} from '@/lib/db/schema/connectors';
import { discogReleases } from '@/lib/db/schema/content';
import { fanReleaseNotifications } from '@/lib/db/schema/dsp-enrichment';
import { merchFulfillmentJobs, merchOrders } from '@/lib/db/schema/merch';
import { metadataSubmissionRequests } from '@/lib/db/schema/metadata-submissions';
import type { ActivityRange } from '@/lib/validation/schemas/dashboard/activity';

const RANGE_MS_MAP: Record<ActivityRange, number> = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
};

export interface LoadJovieWorkFeedInput {
  readonly userId: string;
  readonly creatorProfileId: string;
  readonly limit: number;
  readonly range: ActivityRange;
}

export async function loadJovieWorkFeed(
  input: LoadJovieWorkFeedInput
): Promise<JovieWorkItem[]> {
  const since = new Date(Date.now() - RANGE_MS_MAP[input.range]);
  const perSourceLimit = Math.min(25, Math.max(5, input.limit * 2));

  const [
    workflowRows,
    agentRows,
    suggestedActionRows,
    retouchRows,
    merchFulfillmentRows,
    metadataRows,
    fanNotificationRows,
  ] = await Promise.all([
    db
      .select({
        id: workflowRuns.id,
        kind: workflowRuns.kind,
        status: workflowRuns.status,
        currentStep: workflowRuns.currentStep,
        stepOutputs: workflowRuns.stepOutputs,
        createdAt: workflowRuns.createdAt,
        updatedAt: workflowRuns.updatedAt,
      })
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.userId, input.userId),
          gte(workflowRuns.updatedAt, since)
        )
      )
      .orderBy(desc(workflowRuns.updatedAt))
      .limit(perSourceLimit),

    db
      .select({
        id: agentRuns.id,
        agentSlug: agentRuns.agentSlug,
        status: agentRuns.status,
        completedAt: agentRuns.completedAt,
        startedAt: agentRuns.startedAt,
      })
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.userId, input.userId),
          or(gte(agentRuns.startedAt, since), gte(agentRuns.completedAt, since))
        )
      )
      .orderBy(desc(agentRuns.completedAt), desc(agentRuns.startedAt))
      .limit(perSourceLimit),

    db
      .select({
        id: suggestedActions.id,
        kind: suggestedActions.kind,
        status: suggestedActions.status,
        payload: suggestedActions.payload,
        rationale: suggestedActions.rationale,
        createdAt: suggestedActions.createdAt,
        approvedAt: suggestedActions.approvedAt,
        executedAt: suggestedActions.executedAt,
      })
      .from(suggestedActions)
      .where(
        and(
          eq(suggestedActions.userId, input.userId),
          gte(suggestedActions.createdAt, since)
        )
      )
      .orderBy(desc(suggestedActions.createdAt))
      .limit(perSourceLimit),

    db
      .select({
        id: retouchJobs.id,
        status: retouchJobs.status,
        style: retouchJobs.style,
        completedAt: retouchJobs.completedAt,
        startedAt: retouchJobs.startedAt,
        createdAt: retouchJobs.createdAt,
      })
      .from(retouchJobs)
      .where(
        and(
          eq(retouchJobs.userId, input.userId),
          gte(retouchJobs.createdAt, since)
        )
      )
      .orderBy(desc(retouchJobs.createdAt))
      .limit(perSourceLimit),

    db
      .select({
        id: merchFulfillmentJobs.id,
        status: merchFulfillmentJobs.status,
        completedAt: merchFulfillmentJobs.completedAt,
        updatedAt: merchFulfillmentJobs.updatedAt,
        createdAt: merchFulfillmentJobs.createdAt,
      })
      .from(merchFulfillmentJobs)
      .innerJoin(
        merchOrders,
        eq(merchFulfillmentJobs.merchOrderId, merchOrders.id)
      )
      .where(
        and(
          eq(merchOrders.creatorProfileId, input.creatorProfileId),
          gte(merchFulfillmentJobs.createdAt, since)
        )
      )
      .orderBy(desc(merchFulfillmentJobs.createdAt))
      .limit(perSourceLimit),

    db
      .select({
        id: metadataSubmissionRequests.id,
        status: metadataSubmissionRequests.status,
        providerId: metadataSubmissionRequests.providerId,
        sentAt: metadataSubmissionRequests.sentAt,
        updatedAt: metadataSubmissionRequests.updatedAt,
        createdAt: metadataSubmissionRequests.createdAt,
        releaseTitle: discogReleases.title,
      })
      .from(metadataSubmissionRequests)
      .leftJoin(
        discogReleases,
        eq(metadataSubmissionRequests.releaseId, discogReleases.id)
      )
      .where(
        and(
          eq(
            metadataSubmissionRequests.creatorProfileId,
            input.creatorProfileId
          ),
          gte(metadataSubmissionRequests.createdAt, since)
        )
      )
      .orderBy(desc(metadataSubmissionRequests.createdAt))
      .limit(perSourceLimit),

    db
      .select({
        id: fanReleaseNotifications.id,
        status: fanReleaseNotifications.status,
        notificationType: fanReleaseNotifications.notificationType,
        sentAt: fanReleaseNotifications.sentAt,
        scheduledFor: fanReleaseNotifications.scheduledFor,
        createdAt: fanReleaseNotifications.createdAt,
        releaseTitle: discogReleases.title,
      })
      .from(fanReleaseNotifications)
      .leftJoin(
        discogReleases,
        eq(fanReleaseNotifications.releaseId, discogReleases.id)
      )
      .where(
        and(
          eq(fanReleaseNotifications.creatorProfileId, input.creatorProfileId),
          gte(fanReleaseNotifications.createdAt, since)
        )
      )
      .orderBy(desc(fanReleaseNotifications.createdAt))
      .limit(perSourceLimit),
  ]);

  const items: JovieWorkItem[] = [
    ...workflowRows.map(mapWorkflowRunToJovieWorkItem),
    ...agentRows.map(mapAgentRunToJovieWorkItem),
    ...suggestedActionRows.map(mapSuggestedActionToJovieWorkItem),
    ...retouchRows.map(mapRetouchJobToJovieWorkItem),
    ...merchFulfillmentRows.map(mapMerchFulfillmentJobToJovieWorkItem),
    ...metadataRows.map(mapMetadataSubmissionToJovieWorkItem),
    ...fanNotificationRows.map(mapFanNotificationToJovieWorkItem),
  ];

  return mergeJovieWorkItems(items, input.limit);
}
