import 'server-only';

import { and, sql as drizzleSql, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workflowRuns } from '@/lib/db/schema/connectors';
import { type MerchOrder, merchOrders } from '@/lib/db/schema/merch';
import { resolveDesignPartnerConfig } from './design-partner-config';
import { resolveMerchCardIdsForRun } from './store-listing';
import type {
  DesignPartnerReleaseGmvSnapshot,
  ReleaseGmvPerRunRow,
  ReleaseToRevenueRunStepOutputs,
} from './types';
import { RELEASE_TO_REVENUE_WORKFLOW_KIND } from './types';

export const RELEASE_GMV_COUNTABLE_ORDER_STATUSES = [
  'paid',
  'paid_fulfillment_hold',
  'paid_fulfillment_failed',
  'printful_draft_created',
  'submitted_to_printful',
  'fulfilling',
  'shipped',
  'delivered',
] as const satisfies readonly MerchOrder['status'][];

export const RELEASE_GMV_ATTRIBUTION_METADATA_KEY = 'releaseWorkflowRunId';

export function isReleaseGmvCountableStatus(
  status: MerchOrder['status']
): boolean {
  return (RELEASE_GMV_COUNTABLE_ORDER_STATUSES as readonly string[]).includes(
    status
  );
}

/** Store GMV uses paid order subtotals (Printful-backed storefront product revenue). */
export function computeStoreGmvCents(
  orders: readonly Pick<MerchOrder, 'subtotalCents' | 'status'>[]
): { readonly gmvCents: number; readonly orderCount: number } {
  let gmvCents = 0;
  let orderCount = 0;

  for (const order of orders) {
    if (!isReleaseGmvCountableStatus(order.status)) {
      continue;
    }
    gmvCents += order.subtotalCents;
    orderCount += 1;
  }

  return { gmvCents, orderCount };
}

export async function getPaidOrdersForMerchCards(
  merchCardIds: readonly string[]
): Promise<
  Pick<MerchOrder, 'id' | 'merchCardId' | 'subtotalCents' | 'status'>[]
> {
  if (merchCardIds.length === 0) {
    return [];
  }

  return db
    .select({
      id: merchOrders.id,
      merchCardId: merchOrders.merchCardId,
      subtotalCents: merchOrders.subtotalCents,
      status: merchOrders.status,
    })
    .from(merchOrders)
    .where(inArray(merchOrders.merchCardId, [...merchCardIds]));
}

export async function buildReleaseGmvRowForRun(input: {
  readonly workflowRunId: string;
  readonly stepOutputs: ReleaseToRevenueRunStepOutputs;
}): Promise<ReleaseGmvPerRunRow> {
  const merchCardIds = await resolveMerchCardIdsForRun(input.stepOutputs);
  const orders = await getPaidOrdersForMerchCards(merchCardIds);
  const { gmvCents, orderCount } = computeStoreGmvCents(orders);

  return {
    workflowRunId: input.workflowRunId,
    releaseId: input.stepOutputs.releaseId,
    releaseTitle: input.stepOutputs.release.title,
    triggeredAt: input.stepOutputs.triggeredAt,
    merchCardIds,
    orderCount,
    gmvCents,
  };
}

export async function getDesignPartnerReleaseGmvSnapshot(): Promise<DesignPartnerReleaseGmvSnapshot | null> {
  const designPartner = await resolveDesignPartnerConfig();
  if (!designPartner) {
    return null;
  }

  const runs = await db
    .select({
      id: workflowRuns.id,
      stepOutputs: workflowRuns.stepOutputs,
      createdAt: workflowRuns.createdAt,
    })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.userId, designPartner.userId),
        eq(workflowRuns.kind, RELEASE_TO_REVENUE_WORKFLOW_KIND)
      )
    )
    .orderBy(drizzleSql`${workflowRuns.createdAt} DESC`);

  const releases: ReleaseGmvPerRunRow[] = [];
  for (const run of runs) {
    const stepOutputs = run.stepOutputs as ReleaseToRevenueRunStepOutputs;
    if (!stepOutputs?.release?.title) {
      continue;
    }
    releases.push(
      await buildReleaseGmvRowForRun({
        workflowRunId: run.id,
        stepOutputs,
      })
    );
  }

  const totalGmvCents = releases.reduce(
    (sum, release) => sum + release.gmvCents,
    0
  );

  return {
    creatorUsername: designPartner.creatorUsername,
    generatedAtIso: new Date().toISOString(),
    releases,
    totalGmvCents,
  };
}

export async function resolveReleaseWorkflowRunIdForMerchCard(
  merchCardId: string
): Promise<string | null> {
  const [explicit] = await db
    .select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.kind, RELEASE_TO_REVENUE_WORKFLOW_KIND),
        drizzleSql`${workflowRuns.stepOutputs}->'storeListing'->'merchCardIds' @> ${JSON.stringify([merchCardId])}::jsonb`
      )
    )
    .orderBy(drizzleSql`${workflowRuns.createdAt} DESC`)
    .limit(1);

  if (explicit?.id) {
    return explicit.id;
  }

  const runs = await db
    .select({
      id: workflowRuns.id,
      stepOutputs: workflowRuns.stepOutputs,
      createdAt: workflowRuns.createdAt,
    })
    .from(workflowRuns)
    .where(eq(workflowRuns.kind, RELEASE_TO_REVENUE_WORKFLOW_KIND))
    .orderBy(drizzleSql`${workflowRuns.createdAt} DESC`);

  for (const run of runs) {
    const stepOutputs = run.stepOutputs as ReleaseToRevenueRunStepOutputs;
    const merchCardIds = await resolveMerchCardIdsForRun(stepOutputs);
    if (merchCardIds.includes(merchCardId)) {
      return run.id;
    }
  }

  return null;
}
