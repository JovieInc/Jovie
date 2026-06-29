import 'server-only';

import { and, sql as drizzleSql, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workflowRuns } from '@/lib/db/schema/connectors';
import { type MerchOrder, merchOrders } from '@/lib/db/schema/merch';
import { resolveMerchCardIdsForRun } from './store-listing';
import type {
  AllTenantsReleaseGmvSnapshot,
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

/**
 * Fetch paid orders for the given merch cards, scoped to the owning creator.
 *
 * The `creatorProfileId` predicate is the tenant-isolation boundary: a merch card
 * id list that was contaminated upstream (or a foreign id) can never count another
 * creator's orders toward this creator's GMV. An empty owner id fails closed.
 */
export async function getPaidOrdersForMerchCards(
  merchCardIds: readonly string[],
  creatorProfileId: string
): Promise<
  Pick<MerchOrder, 'id' | 'merchCardId' | 'subtotalCents' | 'status'>[]
> {
  if (merchCardIds.length === 0 || !creatorProfileId) {
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
    .where(
      and(
        eq(merchOrders.creatorProfileId, creatorProfileId),
        inArray(merchOrders.merchCardId, [...merchCardIds])
      )
    );
}

export async function buildReleaseGmvRowForRun(input: {
  readonly workflowRunId: string;
  readonly stepOutputs: ReleaseToRevenueRunStepOutputs;
}): Promise<ReleaseGmvPerRunRow> {
  const creatorProfileId =
    input.stepOutputs.designPartner?.creatorProfileId ?? '';
  const merchCardIds = await resolveMerchCardIdsForRun(input.stepOutputs);
  const orders = await getPaidOrdersForMerchCards(
    merchCardIds,
    creatorProfileId
  );
  const { gmvCents, orderCount } = computeStoreGmvCents(orders);

  return {
    workflowRunId: input.workflowRunId,
    releaseId: input.stepOutputs.releaseId,
    releaseTitle: input.stepOutputs.release.title,
    creatorProfileId,
    creatorUsername: input.stepOutputs.designPartner?.creatorUsername ?? '',
    triggeredAt: input.stepOutputs.triggeredAt,
    merchCardIds,
    orderCount,
    gmvCents,
  };
}

interface ReleaseRunRow {
  readonly id: string;
  readonly stepOutputs: unknown;
}

async function buildReleaseGmvRows(
  runs: readonly ReleaseRunRow[]
): Promise<ReleaseGmvPerRunRow[]> {
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
  return releases;
}

function sumGmvCents(releases: readonly ReleaseGmvPerRunRow[]): number {
  return releases.reduce((sum, release) => sum + release.gmvCents, 0);
}

/**
 * Select release-to-revenue runs ordered newest-first. When `ownerUserId` is
 * provided the result is scoped to that user (ownership-filtered); pass `null`
 * only for the admin/global all-tenants view.
 */
async function selectReleaseRuns(
  ownerUserId: string | null
): Promise<ReleaseRunRow[]> {
  // Only `null` means "all tenants". An empty/blank userId is never a valid
  // tenant — fail closed instead of falling through to the global query.
  if (ownerUserId !== null && !ownerUserId) {
    return [];
  }

  const predicate =
    ownerUserId === null
      ? eq(workflowRuns.kind, RELEASE_TO_REVENUE_WORKFLOW_KIND)
      : and(
          eq(workflowRuns.userId, ownerUserId),
          eq(workflowRuns.kind, RELEASE_TO_REVENUE_WORKFLOW_KIND)
        );

  return db
    .select({
      id: workflowRuns.id,
      stepOutputs: workflowRuns.stepOutputs,
    })
    .from(workflowRuns)
    .where(predicate)
    .orderBy(drizzleSql`${workflowRuns.createdAt} DESC`);
}

/**
 * Ownership-filtered release GMV snapshot for a single user. Each run's GMV is
 * additionally scoped to its own creator profile inside {@link buildReleaseGmvRowForRun}.
 */
export async function getReleaseGmvSnapshotForUser(input: {
  readonly userId: string;
}): Promise<DesignPartnerReleaseGmvSnapshot> {
  const runs = await selectReleaseRuns(input.userId);
  const releases = await buildReleaseGmvRows(runs);

  return {
    creatorUsername: releases[0]?.creatorUsername ?? '',
    generatedAtIso: new Date().toISOString(),
    releases,
    totalGmvCents: sumGmvCents(releases),
  };
}

/**
 * Admin/global release GMV snapshot across every tenant. Each release row is still
 * owner-scoped at the order level, so no creator's GMV bleeds into another's row.
 *
 * SECURITY INVARIANT: this returns cross-tenant revenue and MUST only be called
 * from an admin-gated surface. Its sole caller is `ReleaseToRevenueGmvPanel`, which
 * renders under `app/app/(shell)/admin/layout.tsx` — that layout redirects any
 * request lacking `hasAdminRole` (and middleware already gates `/app/admin`). Do
 * not call this from a non-admin route/action. Use {@link getReleaseGmvSnapshotForUser}
 * for any creator-facing surface.
 */
export async function getAllTenantsReleaseGmvSnapshot(): Promise<AllTenantsReleaseGmvSnapshot> {
  const runs = await selectReleaseRuns(null);
  const releases = await buildReleaseGmvRows(runs);
  const tenantCount = new Set(
    releases.map(release => release.creatorProfileId).filter(Boolean)
  ).size;

  return {
    generatedAtIso: new Date().toISOString(),
    releases,
    totalGmvCents: sumGmvCents(releases),
    tenantCount,
  };
}

export async function resolveReleaseWorkflowRunIdForMerchCard(
  merchCardId: string,
  creatorProfileId: string
): Promise<string | null> {
  if (!creatorProfileId) {
    return null;
  }

  // Only consider runs owned by the same creator as the merch card. Without this
  // predicate a buyer's card could resolve to another tenant's release run.
  const ownerPredicate = drizzleSql`${workflowRuns.stepOutputs}->'designPartner'->>'creatorProfileId' = ${creatorProfileId}`;

  const [explicit] = await db
    .select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.kind, RELEASE_TO_REVENUE_WORKFLOW_KIND),
        ownerPredicate,
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
    .where(
      and(
        eq(workflowRuns.kind, RELEASE_TO_REVENUE_WORKFLOW_KIND),
        ownerPredicate
      )
    )
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
