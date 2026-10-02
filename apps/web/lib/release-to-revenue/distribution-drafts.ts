import 'server-only';

import { and, eq, isNotNull, like } from 'drizzle-orm';
import { recordWorkflowRunOutcome } from '@/lib/connectors/workflows/outcome-attribution';
import { db } from '@/lib/db';
import { workflowRuns } from '@/lib/db/schema/connectors';
import { merchGenerationBatches } from '@/lib/db/schema/merch';
import { publicEnv } from '@/lib/env-public';
import {
  computeDraftPayloadDigest,
  deliverApprovedDistributionDraft,
} from '@/lib/release-to-revenue/distribution-delivery';
import { RELEASE_AUTOPILOT_MERCH_COMMAND } from '@/lib/services/release-autopilot/types';
import { logger } from '@/lib/utils/logger';
import type {
  ReleaseDistributionDraft,
  ReleaseDistributionDrafts,
  ReleaseToRevenueRunStepOutputs,
  ResolvedDesignPartnerConfig,
} from './types';
import { RELEASE_TO_REVENUE_WORKFLOW_KIND } from './types';

const RELEASE_ID_PROMPT_PREFIX = 'release_id:';
const SOCIAL_POST_COUNT = 3;

function releasePromptPrefix(releaseId: string): string {
  return `${RELEASE_ID_PROMPT_PREFIX}${releaseId}`;
}

function buildAbsoluteUrl(path: string): string {
  const base = publicEnv.NEXT_PUBLIC_PROFILE_URL.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export async function resolveMerchDropLink(input: {
  readonly creatorUsername: string;
  readonly creatorProfileId: string;
  readonly releaseId: string | null;
}): Promise<string | null> {
  // Fall back to the creator's merch landing without a DB lookup when we can't
  // owner-scope the release batch query (no release id, or no owning creator).
  if (!input.releaseId || !input.creatorProfileId) {
    return buildAbsoluteUrl(`/${input.creatorUsername}/merch`);
  }

  const [batch] = await db
    .select({
      merchCardId: merchGenerationBatches.selectedMerchCardId,
    })
    .from(merchGenerationBatches)
    .where(
      and(
        eq(merchGenerationBatches.creatorProfileId, input.creatorProfileId),
        eq(merchGenerationBatches.command, RELEASE_AUTOPILOT_MERCH_COMMAND),
        like(
          merchGenerationBatches.prompt,
          `${releasePromptPrefix(input.releaseId)}%`
        ),
        isNotNull(merchGenerationBatches.selectedMerchCardId)
      )
    )
    .limit(1);

  if (batch?.merchCardId) {
    return buildAbsoluteUrl(
      `/${input.creatorUsername}/merch/${batch.merchCardId}`
    );
  }

  return buildAbsoluteUrl(`/${input.creatorUsername}/merch`);
}

export function buildDistributionDrafts(input: {
  readonly releaseTitle: string;
  readonly releaseLink: string;
  readonly merchDropLink: string | null;
  readonly platform: ResolvedDesignPartnerConfig['socialAccount']['platform'];
  readonly createdAt?: string;
}): ReleaseDistributionDrafts {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const merchLine = input.merchDropLink
    ? `Shop the drop: ${input.merchDropLink}`
    : 'Merch drop link is still being prepared.';

  const socialBodies = [
    `New music is live. "${input.releaseTitle}" is out now. Listen: ${input.releaseLink}`,
    `"${input.releaseTitle}" merch is ready. ${merchLine}`,
    `Tap in for "${input.releaseTitle}". ${input.releaseLink}`,
  ] as const;

  const variants = ['announcement', 'merch_teaser', 'listen_cta'] as const;

  const socialPosts: ReleaseDistributionDraft[] = socialBodies.map(
    (body, index) => ({
      id: crypto.randomUUID(),
      channel: 'social_post',
      platform: input.platform,
      variant: variants[index],
      body,
      status: 'pending',
      createdAt,
    })
  );

  const smsDraft: ReleaseDistributionDraft = {
    id: crypto.randomUUID(),
    channel: 'sms',
    platform: 'sms',
    variant: 'sms_blast',
    body: `"${input.releaseTitle}" is out now. Listen: ${input.releaseLink}. ${merchLine}`,
    status: 'pending',
    createdAt,
  };

  return {
    releaseLink: input.releaseLink,
    merchDropLink: input.merchDropLink,
    items: [...socialPosts, smsDraft],
  };
}

export async function generateDistributionDraftsForRun(input: {
  readonly stepOutputs: ReleaseToRevenueRunStepOutputs;
}): Promise<ReleaseDistributionDrafts> {
  const { release, designPartner } = input.stepOutputs;
  const releasePath =
    release.smartLinkPath ??
    (release.slug
      ? `/${designPartner.creatorUsername}/${release.slug}`
      : `/${designPartner.creatorUsername}`);
  const releaseLink = buildAbsoluteUrl(releasePath);
  const merchDropLink = await resolveMerchDropLink({
    creatorUsername: designPartner.creatorUsername,
    creatorProfileId: designPartner.creatorProfileId,
    releaseId: input.stepOutputs.releaseId,
  });

  return buildDistributionDrafts({
    releaseTitle: release.title,
    releaseLink,
    merchDropLink,
    platform: designPartner.socialAccount.platform,
    createdAt: input.stepOutputs.triggeredAt,
  });
}

function isTerminalDraftStatus(
  status: ReleaseDistributionDraft['status']
): boolean {
  // `approved` is persisted but non-terminal: it means the provider attempt
  // has not settled (e.g. crash between approval and dispatch). The run stays
  // in waiting_for_approval until a retry resolves the delivery outcome.
  return (
    status === 'rejected' ||
    status === 'dispatched' ||
    status === 'failed' ||
    status === 'undeliverable'
  );
}

function allDraftsTerminal(
  drafts: ReleaseDistributionDrafts | undefined
): boolean {
  if (!drafts || drafts.items.length === 0) {
    return false;
  }

  return drafts.items.every(draft => isTerminalDraftStatus(draft.status));
}

/**
 * A `dispatched` status only counts as activation when it carries provider
 * acceptance evidence. Legacy status-only receipts (pre-provider dispatch)
 * are treated as unverified and never trigger outcome recording.
 */
function hasVerifiedDispatchedDraft(
  drafts: ReleaseDistributionDrafts | undefined
): boolean {
  return Boolean(
    drafts?.items.some(
      draft =>
        draft.status === 'dispatched' && draft.delivery?.state === 'accepted'
    )
  );
}

async function loadOwnedRun(input: {
  readonly runId: string;
  readonly userId: string;
}): Promise<{
  readonly id: string;
  readonly status: WorkflowRunStatus;
  readonly stepOutputs: ReleaseToRevenueRunStepOutputs;
} | null> {
  const [run] = await db
    .select({
      id: workflowRuns.id,
      kind: workflowRuns.kind,
      userId: workflowRuns.userId,
      status: workflowRuns.status,
      stepOutputs: workflowRuns.stepOutputs,
    })
    .from(workflowRuns)
    .where(eq(workflowRuns.id, input.runId))
    .limit(1);

  if (
    !run ||
    run.kind !== RELEASE_TO_REVENUE_WORKFLOW_KIND ||
    run.userId !== input.userId
  ) {
    return null;
  }

  return {
    id: run.id,
    status: run.status as WorkflowRunStatus,
    stepOutputs: run.stepOutputs as ReleaseToRevenueRunStepOutputs,
  };
}

function updateDraftInStepOutputs(
  stepOutputs: ReleaseToRevenueRunStepOutputs,
  draftId: string,
  updater: (draft: ReleaseDistributionDraft) => ReleaseDistributionDraft
): ReleaseToRevenueRunStepOutputs | null {
  const drafts = stepOutputs.distributionDrafts;
  if (!drafts) {
    return null;
  }

  let found = false;
  const items = drafts.items.map(draft => {
    if (draft.id !== draftId) {
      return draft;
    }

    found = true;
    return updater(draft);
  });

  if (!found) {
    return null;
  }

  return {
    ...stepOutputs,
    distributionDrafts: {
      ...drafts,
      items,
    },
  };
}

export async function listDistributionDraftsForRun(input: {
  readonly runId: string;
  readonly userId: string;
}): Promise<ReleaseDistributionDrafts | null> {
  const run = await loadOwnedRun(input);
  return run?.stepOutputs.distributionDrafts ?? null;
}

export type DecideDistributionDraftResult =
  | {
      readonly ok: true;
      readonly draft: ReleaseDistributionDraft;
      readonly runStatus: WorkflowRunStatus;
    }
  | {
      readonly ok: false;
      readonly code:
        | 'not-found'
        | 'draft-not-found'
        | 'already-decided'
        | 'invalid-state';
    };

type WorkflowRunStatus =
  | 'queued'
  | 'running'
  | 'waiting_for_approval'
  | 'completed'
  | 'failed';

async function persistStepOutputs(input: {
  readonly runId: string;
  readonly stepOutputs: ReleaseToRevenueRunStepOutputs;
  readonly nextRunStatus: WorkflowRunStatus;
}): Promise<void> {
  await db
    .update(workflowRuns)
    .set({
      stepOutputs: input.stepOutputs,
      status: input.nextRunStatus,
      updatedAt: new Date(),
      ...(input.nextRunStatus === 'completed'
        ? { currentStep: 'completed' }
        : {}),
    })
    .where(eq(workflowRuns.id, input.runId));

  if (
    input.nextRunStatus === 'completed' &&
    hasVerifiedDispatchedDraft(input.stepOutputs.distributionDrafts)
  ) {
    try {
      await recordWorkflowRunOutcome(input.runId);
    } catch (err) {
      logger.error(
        '[release-to-revenue] failed to record workflow run outcome',
        { runId: input.runId, err }
      );
    }
  }
}

function buildApprovedDraft(
  draft: ReleaseDistributionDraft,
  runId: string
): ReleaseDistributionDraft {
  return {
    ...draft,
    status: 'approved',
    decidedAt: new Date().toISOString(),
    payloadDigest: computeDraftPayloadDigest(draft.body),
    idempotencyKey: `${runId}:${draft.id}`,
  };
}

type DistributionDraftDecision = 'approve' | 'reject';

/**
 * Attempt provider delivery for an approved draft and persist the settled
 * state. `dispatched` is only written with provider-acceptance evidence;
 * otherwise the draft lands in `failed`/`undeliverable` with the reason.
 */
async function dispatchAndPersist(input: {
  readonly runId: string;
  readonly draftId: string;
  readonly run: NonNullable<Awaited<ReturnType<typeof loadOwnedRun>>>;
  readonly approvedDraft: ReleaseDistributionDraft;
}): Promise<DecideDistributionDraftResult> {
  const { runId, draftId, run, approvedDraft } = input;

  const result = await deliverApprovedDistributionDraft({
    draft: approvedDraft,
    stepOutputs: run.stepOutputs,
    runId,
  });

  logger.info('[release-to-revenue] distribution draft delivery settled', {
    draftId,
    runId,
    channel: approvedDraft.channel,
    platform: approvedDraft.platform,
    status: result.status,
    deliveryState: result.delivery.state,
  });

  const settledDraft: ReleaseDistributionDraft = {
    ...approvedDraft,
    status: result.status,
    delivery: result.delivery,
    ...(result.status === 'dispatched'
      ? {
          dispatchedAt: result.delivery.acceptedAt ?? new Date().toISOString(),
        }
      : {}),
  };

  const nextStepOutputs = updateDraftInStepOutputs(
    run.stepOutputs,
    draftId,
    () => settledDraft
  );
  if (!nextStepOutputs) {
    return { ok: false, code: 'draft-not-found' };
  }

  const nextRunStatus = allDraftsTerminal(nextStepOutputs.distributionDrafts)
    ? 'completed'
    : 'waiting_for_approval';

  await persistStepOutputs({
    runId,
    stepOutputs: nextStepOutputs,
    nextRunStatus,
  });

  return { ok: true, draft: settledDraft, runStatus: nextRunStatus };
}

async function decideDistributionDraft(input: {
  readonly runId: string;
  readonly draftId: string;
  readonly userId: string;
  readonly decision: DistributionDraftDecision;
}): Promise<DecideDistributionDraftResult> {
  const run = await loadOwnedRun(input);
  if (!run) {
    return { ok: false, code: 'not-found' };
  }

  const drafts = run.stepOutputs.distributionDrafts;
  const draft = drafts?.items.find(item => item.id === input.draftId);
  if (!draft) {
    return { ok: false, code: 'draft-not-found' };
  }

  if (input.decision === 'reject') {
    if (draft.status === 'rejected') {
      return { ok: true, draft, runStatus: run.status };
    }
    if (draft.status !== 'pending') {
      return { ok: false, code: 'already-decided' };
    }

    const rejectedDraft: ReleaseDistributionDraft = {
      ...draft,
      status: 'rejected',
      decidedAt: new Date().toISOString(),
    };
    const nextStepOutputs = updateDraftInStepOutputs(
      run.stepOutputs,
      input.draftId,
      () => rejectedDraft
    );
    if (!nextStepOutputs) {
      return { ok: false, code: 'draft-not-found' };
    }

    const nextRunStatus = allDraftsTerminal(nextStepOutputs.distributionDrafts)
      ? 'completed'
      : 'waiting_for_approval';

    await persistStepOutputs({
      runId: input.runId,
      stepOutputs: nextStepOutputs,
      nextRunStatus,
    });

    return { ok: true, draft: rejectedDraft, runStatus: nextRunStatus };
  }

  // approve
  if (draft.status === 'dispatched') {
    return { ok: true, draft, runStatus: run.status };
  }

  if (draft.status === 'approved') {
    // Approval was persisted but the provider attempt never settled (crash or
    // retry). Re-attempt delivery under the same idempotency key.
    return dispatchAndPersist({
      runId: input.runId,
      draftId: input.draftId,
      run,
      approvedDraft: draft,
    });
  }

  if (draft.status !== 'pending') {
    // failed/undeliverable are terminal: no auto-retry, so a provider that may
    // have accepted a timed-out send is never double-posted.
    return { ok: false, code: 'already-decided' };
  }

  const approvedDraft = buildApprovedDraft(draft, input.runId);
  const approvedStepOutputs = updateDraftInStepOutputs(
    run.stepOutputs,
    input.draftId,
    () => approvedDraft
  );
  if (!approvedStepOutputs) {
    return { ok: false, code: 'draft-not-found' };
  }

  // Persist the approved intent (payload digest + idempotency key) BEFORE the
  // provider call, so a crash mid-send leaves a replayable approved record.
  await persistStepOutputs({
    runId: input.runId,
    stepOutputs: approvedStepOutputs,
    nextRunStatus: 'waiting_for_approval',
  });

  return dispatchAndPersist({
    runId: input.runId,
    draftId: input.draftId,
    run,
    approvedDraft,
  });
}

export async function approveDistributionDraft(input: {
  readonly runId: string;
  readonly draftId: string;
  readonly userId: string;
}): Promise<DecideDistributionDraftResult> {
  return decideDistributionDraft({ ...input, decision: 'approve' });
}

export async function rejectDistributionDraft(input: {
  readonly runId: string;
  readonly draftId: string;
  readonly userId: string;
}): Promise<DecideDistributionDraftResult> {
  return decideDistributionDraft({ ...input, decision: 'reject' });
}

export const DISTRIBUTION_DRAFT_EXPECTED_COUNTS = {
  socialPosts: SOCIAL_POST_COUNT,
  sms: 1,
  total: SOCIAL_POST_COUNT + 1,
} as const;
