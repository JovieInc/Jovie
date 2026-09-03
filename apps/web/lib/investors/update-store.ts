import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getDeepErrorMessage } from '@/lib/db/errors';
import { users } from '@/lib/db/schema/auth';
import {
  investorUpdateCandidateDecisions,
  investorUpdateCandidates,
  investorUpdateDeliveryEvents,
  investorUpdateDrafts,
  investorUpdateFinalApprovals,
} from '@/lib/db/schema/investors';
import { memorySourceRecords } from '@/lib/db/schema/memory';
import {
  assertInvestorUpdateDeliveryEventTiming,
  composeInvestorUpdateDraft,
  type InvestorUpdateCandidate,
  type InvestorUpdateCandidateDecision,
  type InvestorUpdateDecision,
  type InvestorUpdateRecipientSegment,
  type InvestorUpdateReviewState,
  type InvestorUpdateTrackingSettings,
  InvestorUpdateWorkflowError,
  investorUpdateCandidateDecisionSchema,
  investorUpdateCandidateSchema,
  investorUpdateDeliveryEventTypeSchema,
  investorUpdateOpaqueReceiptReferenceSchema,
  prepareInvestorUpdateFinalApproval,
  serializeInvestorUpdateApprovalSnapshot,
} from './update-contract';

export const INVESTOR_UPDATE_APPROVAL_TTL_MS = 15 * 60 * 1000;

function toIso(value: Date): string {
  return value.toISOString();
}

function hashCopy(copy: string): string {
  return createHash('sha256').update(copy, 'utf8').digest('hex');
}

function approvalFingerprint(input: {
  readonly candidateIds: readonly string[];
  readonly decisionRecordIds: readonly string[];
  readonly renderedCopy: string;
  readonly segments: readonly InvestorUpdateRecipientSegment[];
  readonly recipientCount: number;
  readonly trackingSettings: InvestorUpdateTrackingSettings;
}): string {
  return hashCopy(serializeInvestorUpdateApprovalSnapshot(input));
}

async function loadCurrentDraftRows() {
  const [draft] = await db
    .select()
    .from(investorUpdateDrafts)
    .orderBy(desc(investorUpdateDrafts.periodStart))
    .limit(1);

  if (!draft) return null;

  const candidates = await db
    .select()
    .from(investorUpdateCandidates)
    .where(eq(investorUpdateCandidates.draftId, draft.id))
    .orderBy(
      desc(investorUpdateCandidates.relevanceScore),
      desc(investorUpdateCandidates.createdAt)
    );
  const candidateIds = candidates.map(candidate => candidate.id);
  const decisions =
    candidateIds.length === 0
      ? []
      : await db
          .select()
          .from(investorUpdateCandidateDecisions)
          .where(
            inArray(investorUpdateCandidateDecisions.candidateId, candidateIds)
          )
          .orderBy(
            desc(investorUpdateCandidateDecisions.decidedAt),
            desc(investorUpdateCandidateDecisions.id)
          );
  const latestDecisionByCandidateId = new Map<
    string,
    (typeof decisions)[number]
  >();
  for (const decision of decisions) {
    if (!latestDecisionByCandidateId.has(decision.candidateId)) {
      latestDecisionByCandidateId.set(decision.candidateId, decision);
    }
  }

  const candidateModels: InvestorUpdateCandidate[] = candidates.map(
    candidate => ({
      id: candidate.id,
      kind: candidate.kind,
      category: candidate.category,
      metricLabel: candidate.metricLabel,
      metricValue: candidate.metricValue,
      metricUnit: candidate.metricUnit,
      windowStart: toIso(candidate.windowStart),
      windowEnd: toIso(candidate.windowEnd),
      sourceRecordId: candidate.sourceRecordId,
      sourceLabel: candidate.sourceLabel,
      sourceUrl: candidate.sourceUrl,
      sourceObservedAt: toIso(candidate.sourceObservedAt),
      confidence: candidate.confidence,
      caveats: candidate.caveats,
      proposedClaim: candidate.proposedClaim,
      relevanceScore: candidate.relevanceScore,
      createdAt: toIso(candidate.createdAt),
    })
  );
  const decisionModels = new Map<string, InvestorUpdateCandidateDecision>();
  for (const [candidateId, decision] of latestDecisionByCandidateId) {
    decisionModels.set(candidateId, {
      id: decision.id,
      candidateId,
      decision: decision.decision,
      editedClaim: decision.editedClaim,
      decidedByUserId: decision.decidedByUserId,
      decidedAt: toIso(decision.decidedAt),
    });
  }

  return { draft, candidateModels, decisionModels };
}

export async function loadInvestorUpdateReviewState(): Promise<InvestorUpdateReviewState> {
  const current = await loadCurrentDraftRows();
  if (!current) {
    return {
      draft: null,
      candidates: [],
      composition: null,
      latestApproval: null,
      deliveryEvents: [],
    };
  }

  const composition = composeInvestorUpdateDraft({
    subject: current.draft.subject,
    candidates: current.candidateModels,
    decisionsByCandidateId: current.decisionModels,
  });
  const [approval] = await db
    .select()
    .from(investorUpdateFinalApprovals)
    .where(eq(investorUpdateFinalApprovals.draftId, current.draft.id))
    .orderBy(
      desc(investorUpdateFinalApprovals.approvedAt),
      desc(investorUpdateFinalApprovals.id)
    )
    .limit(1);
  const events = approval
    ? await db
        .select()
        .from(investorUpdateDeliveryEvents)
        .where(eq(investorUpdateDeliveryEvents.approvalId, approval.id))
        .orderBy(desc(investorUpdateDeliveryEvents.occurredAt))
    : [];
  const [latestDraftVersion] = await db
    .select({ revision: investorUpdateDrafts.revision })
    .from(investorUpdateDrafts)
    .where(eq(investorUpdateDrafts.id, current.draft.id))
    .limit(1);
  const draftVersionUnchanged =
    latestDraftVersion?.revision === current.draft.revision;

  return {
    draft: {
      id: current.draft.id,
      periodStart: current.draft.periodStart,
      subject: current.draft.subject,
      updatedAt: toIso(current.draft.updatedAt),
    },
    candidates: current.candidateModels.map(candidate => ({
      ...candidate,
      decision: current.decisionModels.get(candidate.id) ?? null,
    })),
    composition,
    latestApproval: approval
      ? {
          id: approval.id,
          renderedCopy: approval.renderedCopy,
          copyHash: approval.copyHash,
          recipientSegments: approval.recipientSegments,
          recipientCount: approval.recipientCount,
          approvedAt: toIso(approval.approvedAt),
          expiresAt: toIso(approval.expiresAt),
          matchesCurrentDraft:
            draftVersionUnchanged &&
            approval.draftRevision === current.draft.revision &&
            composition.pendingCandidateIds.length === 0 &&
            approval.snapshotFingerprint ===
              approvalFingerprint({
                candidateIds: current.candidateModels.map(
                  candidate => candidate.id
                ),
                decisionRecordIds: [...current.decisionModels.values()].map(
                  decision => decision.id
                ),
                renderedCopy: composition.renderedCopy,
                segments: approval.recipientSegments,
                recipientCount: approval.recipientCount,
                trackingSettings: approval.trackingSettings,
              }),
        }
      : null,
    deliveryEvents: events.map(event => ({
      id: event.id,
      eventType: event.eventType,
      recipientCount: event.recipientCount,
      externalReference: event.externalReference,
      occurredAt: toIso(event.occurredAt),
    })),
  };
}

export async function recordInvestorUpdateCandidateDecision(input: {
  readonly draftId: string;
  readonly candidateId: string;
  readonly decision: InvestorUpdateDecision;
  readonly editedClaim: string | null;
  readonly userId: string;
}): Promise<void> {
  investorUpdateCandidateDecisionSchema.parse({
    id: randomUUID(),
    candidateId: input.candidateId,
    decision: input.decision,
    editedClaim: input.editedClaim,
    decidedByUserId: input.userId,
    decidedAt: new Date().toISOString(),
  });
  const [candidate] = await db
    .select({ id: investorUpdateCandidates.id })
    .from(investorUpdateCandidates)
    .where(
      and(
        eq(investorUpdateCandidates.id, input.candidateId),
        eq(investorUpdateCandidates.draftId, input.draftId)
      )
    )
    .limit(1);
  if (!candidate) {
    throw new InvestorUpdateWorkflowError(
      'candidate_invalid',
      'Candidate does not belong to the current investor update draft.'
    );
  }
  await db.insert(investorUpdateCandidateDecisions).values({
    candidateId: input.candidateId,
    decision: input.decision,
    editedClaim: input.editedClaim,
    decidedByUserId: input.userId,
  });
}

export async function upsertInvestorUpdateDraft(input: {
  readonly periodStart: string;
  readonly subject: string;
  readonly userId: string;
}): Promise<string> {
  const period = new Date(`${input.periodStart}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-01$/.test(input.periodStart) ||
    !Number.isFinite(period.getTime()) ||
    input.subject.trim().length === 0
  ) {
    throw new InvestorUpdateWorkflowError(
      'approval_invalid',
      'Monthly drafts require a valid first-of-month period and subject.'
    );
  }
  const [draft] = await db
    .insert(investorUpdateDrafts)
    .values({
      periodStart: input.periodStart,
      subject: input.subject.trim(),
      createdByUserId: input.userId,
    })
    .onConflictDoUpdate({
      target: investorUpdateDrafts.periodStart,
      set: { subject: input.subject.trim(), updatedAt: new Date() },
    })
    .returning({ id: investorUpdateDrafts.id });
  if (!draft) {
    throw new InvestorUpdateWorkflowError(
      'approval_invalid',
      'Monthly investor update draft could not be persisted.'
    );
  }
  return draft.id;
}

export async function addInvestorUpdateCandidate(input: {
  readonly draftId: string;
  readonly candidate: Omit<InvestorUpdateCandidate, 'id' | 'createdAt'>;
  readonly sourceOwnerUserId: string;
}): Promise<string> {
  const parsed = investorUpdateCandidateSchema.parse({
    ...input.candidate,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  });
  const [[draft], [source]] = await Promise.all([
    db
      .select({ id: investorUpdateDrafts.id })
      .from(investorUpdateDrafts)
      .where(eq(investorUpdateDrafts.id, input.draftId))
      .limit(1),
    db
      .select({ id: memorySourceRecords.id })
      .from(memorySourceRecords)
      .innerJoin(users, eq(users.id, memorySourceRecords.userId))
      .where(
        and(
          eq(memorySourceRecords.id, parsed.sourceRecordId),
          eq(users.id, input.sourceOwnerUserId)
        )
      )
      .limit(1),
  ]);
  if (!draft || !source) {
    throw new InvestorUpdateWorkflowError(
      'candidate_invalid',
      'Candidate requires the current draft and a source owned by the submitting user.'
    );
  }
  const [created] = await db
    .insert(investorUpdateCandidates)
    .values({
      draftId: input.draftId,
      kind: parsed.kind,
      category: parsed.category,
      metricLabel: parsed.metricLabel,
      metricValue: parsed.metricValue,
      metricUnit: parsed.metricUnit,
      windowStart: new Date(parsed.windowStart),
      windowEnd: new Date(parsed.windowEnd),
      sourceRecordId: parsed.sourceRecordId,
      sourceLabel: parsed.sourceLabel,
      sourceUrl: parsed.sourceUrl,
      sourceObservedAt: new Date(parsed.sourceObservedAt),
      confidence: parsed.confidence,
      caveats: parsed.caveats,
      proposedClaim: parsed.proposedClaim,
      relevanceScore: parsed.relevanceScore,
    })
    .returning({ id: investorUpdateCandidates.id });
  if (!created) {
    throw new InvestorUpdateWorkflowError(
      'candidate_invalid',
      'Investor update candidate could not be persisted.'
    );
  }
  return created.id;
}

export async function approveInvestorUpdateSnapshot(input: {
  readonly draftId: string;
  readonly expectedRenderedCopy: string;
  readonly segments: readonly InvestorUpdateRecipientSegment[];
  readonly recipientCount: number;
  readonly trackingSettings: InvestorUpdateTrackingSettings;
  readonly userId: string;
  readonly now?: Date;
}): Promise<string> {
  const current = await loadCurrentDraftRows();
  if (current?.draft.id !== input.draftId) {
    throw new InvestorUpdateWorkflowError(
      'approval_invalid',
      'Only the current living draft can receive final approval.'
    );
  }
  const snapshot = prepareInvestorUpdateFinalApproval({
    subject: current.draft.subject,
    candidates: current.candidateModels,
    decisionsByCandidateId: current.decisionModels,
    segments: input.segments,
    recipientCount: input.recipientCount,
    trackingSettings: input.trackingSettings,
    expectedRenderedCopy: input.expectedRenderedCopy,
  });
  const now = input.now ?? new Date();
  const decisionRecordIds = [...current.decisionModels.values()].map(
    decision => decision.id
  );
  const fingerprint = approvalFingerprint({
    candidateIds: current.candidateModels.map(candidate => candidate.id),
    decisionRecordIds,
    renderedCopy: snapshot.renderedCopy,
    segments: snapshot.segments,
    recipientCount: snapshot.recipientCount,
    trackingSettings: snapshot.trackingSettings,
  });
  let approval: { id: string } | undefined;
  try {
    [approval] = await db
      .insert(investorUpdateFinalApprovals)
      .values({
        draftId: current.draft.id,
        renderedCopy: snapshot.renderedCopy,
        copyHash: hashCopy(snapshot.renderedCopy),
        snapshotFingerprint: fingerprint,
        draftRevision: current.draft.revision,
        decisionRecordIds,
        recipientSegments: [...snapshot.segments],
        recipientCount: snapshot.recipientCount,
        trackingSettings: snapshot.trackingSettings,
        approvedByUserId: input.userId,
        approvedAt: now,
        expiresAt: new Date(now.getTime() + INVESTOR_UPDATE_APPROVAL_TTL_MS),
      })
      .returning({ id: investorUpdateFinalApprovals.id });
  } catch (error) {
    const message = getDeepErrorMessage(error);
    if (
      message.includes('investor_update_revision_conflict') ||
      message.includes('investor_update_decision_snapshot_stale')
    ) {
      throw new InvestorUpdateWorkflowError(
        'approval_invalid',
        'The draft changed during approval. Review the latest copy and approve again.'
      );
    }
    throw error;
  }
  if (!approval) {
    throw new InvestorUpdateWorkflowError(
      'approval_invalid',
      'Final approval could not be recorded.'
    );
  }
  return approval.id;
}

export async function recordInvestorUpdateDeliveryEvent(input: {
  readonly approvalId: string;
  readonly eventType: string;
  readonly recipientCount: number;
  readonly externalReference: string;
  readonly occurredAt: string;
  readonly userId: string;
}): Promise<void> {
  const eventType = investorUpdateDeliveryEventTypeSchema.parse(
    input.eventType
  );
  const externalReference = investorUpdateOpaqueReceiptReferenceSchema.parse(
    input.externalReference
  );
  const occurredAt = new Date(input.occurredAt);
  if (!Number.isFinite(occurredAt.getTime())) {
    throw new InvestorUpdateWorkflowError(
      'receipt_timing_invalid',
      'Delivery observations require a valid occurrence time.'
    );
  }
  const [approval] = await db
    .select()
    .from(investorUpdateFinalApprovals)
    .where(eq(investorUpdateFinalApprovals.id, input.approvalId))
    .limit(1);
  if (!approval) {
    throw new InvestorUpdateWorkflowError(
      'approval_invalid',
      'Delivery event requires an existing final approval.'
    );
  }
  const [providerAccepted] =
    eventType === 'provider_accepted'
      ? []
      : await db
          .select({ occurredAt: investorUpdateDeliveryEvents.occurredAt })
          .from(investorUpdateDeliveryEvents)
          .where(
            and(
              eq(investorUpdateDeliveryEvents.approvalId, approval.id),
              eq(investorUpdateDeliveryEvents.eventType, 'provider_accepted'),
              lte(investorUpdateDeliveryEvents.occurredAt, occurredAt)
            )
          )
          .orderBy(desc(investorUpdateDeliveryEvents.occurredAt))
          .limit(1);
  const observedAt = new Date();
  assertInvestorUpdateDeliveryEventTiming({
    eventType,
    approvedAt: toIso(approval.approvedAt),
    expiresAt: toIso(approval.expiresAt),
    occurredAt: input.occurredAt,
    observedAt: toIso(observedAt),
    providerAcceptedAt: providerAccepted
      ? toIso(providerAccepted.occurredAt)
      : null,
  });
  if (
    !Number.isInteger(input.recipientCount) ||
    input.recipientCount < 0 ||
    input.recipientCount > approval.recipientCount
  ) {
    throw new InvestorUpdateWorkflowError(
      'approval_invalid',
      'Receipt count cannot exceed the approved recipient count.'
    );
  }
  await db.insert(investorUpdateDeliveryEvents).values({
    approvalId: approval.id,
    eventType,
    recipientCount: input.recipientCount,
    externalReference,
    occurredAt,
    recordedByUserId: input.userId,
  });
}
