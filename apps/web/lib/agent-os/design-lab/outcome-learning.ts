import 'server-only';

import { marketingDecisionDigest } from '@/data/marketing';
import type { MarketingFrozenDecisionContext } from '@/data/marketing/decision';
import type { MarketingImprovementOutcomeBundle } from '@/data/marketing/improvement';
import { normalizeMarketingCommercialOutcome } from '@/data/marketing/improvementOutcomes';
import type {
  MarketingCommercialOutcomeRecord,
  MarketingSemanticOutcomeRecord,
  MarketingTasteOutcomeRecord,
} from '@/data/marketing/improvementRecords';
import { buildCertificationDecisionDigest } from '@/lib/agent-os/certification';
import type { MarketingCertificationProjectionRow } from '@/lib/agent-os/certification-adapter';
import { getMarketingCertificationStore } from '@/lib/agent-os/certification-runtime-store';
import {
  DESIGN_LAB_OUTCOME_LEARNING_SCHEMA,
  type DesignLabApprovedFounderReference,
  type DesignLabApprovedReferenceLookup,
  type DesignLabCommercialOutcomeReceipt,
  type DesignLabCommercialResult,
  type DesignLabOutcomeLearningFailure,
  type DesignLabOutcomeLearningProjection,
  type DesignLabOutcomeLearningRequest,
  type DesignLabOutcomeLearningResult,
  type DesignLabOutcomeProjectionSource,
} from './outcome-learning-contracts';
import type { DesignLabDecisionReviewReadyArtifact } from './decision-review';

export {
  DESIGN_LAB_OUTCOME_LEARNING_SCHEMA,
  type DesignLabApprovedFounderReference,
  type DesignLabApprovedReferenceLookup,
  type DesignLabCommercialOutcomeReceipt,
  type DesignLabCommercialResult,
  type DesignLabOutcomeLearningFailure,
  type DesignLabOutcomeLearningProjection,
  type DesignLabOutcomeLearningRequest,
  type DesignLabOutcomeLearningResult,
} from './outcome-learning-contracts';

interface ReviewBinding {
  readonly route: string;
  readonly decisionId: string;
  readonly pageId: string;
  readonly contextDigest: string;
  readonly sourceSha: string;
  readonly artifactSha256: string;
  readonly candidateDigest: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function exactSha(value: unknown, length: 40 | 64): value is string {
  return typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
}

function validDate(value: unknown): value is string {
  return hasText(value) && Number.isFinite(Date.parse(value));
}

function textList(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.length > 0 && value.every(item => hasText(item))
  );
}

function metrics(value: unknown): value is Readonly<Record<string, number>> {
  return (
    isRecord(value) &&
    Object.keys(value).length > 0 &&
    Object.values(value).every(
      item => typeof item === 'number' && Number.isFinite(item)
    )
  );
}

function sameJson(left: unknown, right: unknown): boolean {
  try {
    return marketingDecisionDigest(left) === marketingDecisionDigest(right);
  } catch {
    return false;
  }
}

function failure(
  status: DesignLabOutcomeLearningFailure,
  reason: string
): DesignLabOutcomeLearningResult {
  return { ok: false, status, reason, projection: null };
}

function reviewBinding(
  artifact: DesignLabDecisionReviewReadyArtifact
): { readonly binding: ReviewBinding } | { readonly error: string } {
  if (
    !hasText(artifact.route) ||
    artifact.advisory !== true ||
    artifact.certified !== false ||
    artifact.dispatchTriggered !== false ||
    artifact.generationTriggered !== false ||
    artifact.published !== false ||
    !exactSha(artifact.sourceSha, 40) ||
    !exactSha(artifact.artifactSha256, 64) ||
    !exactSha(artifact.artifactDigest.replace(/^sha256:/, ''), 64)
  ) {
    return { error: 'review packet has invalid advisory or evidence metadata' };
  }
  const context = isRecord(artifact.context) ? artifact.context : null;
  const selection = isRecord(artifact.selection) ? artifact.selection : null;
  const selected = selection?.selectedCandidate;
  if (
    !context ||
    !hasText(context.decisionId) ||
    !hasText(context.pageId) ||
    !hasText(context.contextDigest) ||
    !exactSha(String(context.contextDigest).replace(/^sha256:/, ''), 64) ||
    artifact.decisionStatus !== 'accepted' ||
    selection?.status !== 'accepted' ||
    !isRecord(selected) ||
    !hasText(selected.digest) ||
    !exactSha(String(selected.digest).replace(/^sha256:/, ''), 64)
  ) {
    return { error: 'review packet has no accepted candidate bound to context' };
  }
  const candidates = Array.isArray(artifact.candidates)
    ? artifact.candidates
    : [];
  const selectedCandidate = candidates.find(candidate => {
    if (!isRecord(candidate)) return false;
    const nested = isRecord(candidate.candidate) ? candidate.candidate : candidate;
    return nested.digest === selected.digest;
  });
  if (!selectedCandidate) {
    return { error: 'selected candidate digest is absent from the packet' };
  }
  return {
    binding: {
      artifactSha256: artifact.artifactSha256,
      candidateDigest: selected.digest,
      contextDigest: context.contextDigest,
      decisionId: context.decisionId,
      pageId: context.pageId,
      route: artifact.route,
      sourceSha: artifact.sourceSha,
    },
  };
}

function semanticRecords(
  artifact: DesignLabDecisionReviewReadyArtifact,
  binding: ReviewBinding
): readonly MarketingSemanticOutcomeRecord[] | null {
  const outcomes = isRecord(artifact.outcomes) ? artifact.outcomes : null;
  const semantic = outcomes?.semantic;
  if (!Array.isArray(semantic)) return null;
  const candidateDigests = new Set(
    (Array.isArray(artifact.candidates) ? artifact.candidates : []).flatMap(
      candidate => {
        if (!isRecord(candidate)) return [];
        const nested = isRecord(candidate.candidate) ? candidate.candidate : candidate;
        return hasText(nested.digest) ? [nested.digest] : [];
      }
    )
  );
  const valid = semantic.every(item => {
    if (!isRecord(item)) return false;
    return (
      item.schema === 'marketing-semantic-outcome/v1' &&
      item.decisionId === binding.decisionId &&
      item.contextDigest === binding.contextDigest &&
      hasText(item.candidateId) &&
      exactSha(String(item.candidateDigest ?? '').replace(/^sha256:/, ''), 64) &&
      candidateDigests.has(item.candidateDigest) &&
      hasText(item.checkId) &&
      ['supported', 'contradicted', 'insufficient', 'needs-specialist', 'unavailable'].includes(
        String(item.status)
      ) &&
      Array.isArray(item.findings) &&
      item.findings.every(finding => hasText(finding)) &&
      textList(item.evidenceRefs) &&
      (item.fingerprint === null || exactSha(String(item.fingerprint).replace(/^sha256:/, ''), 64)) &&
      item.advisory === true &&
      item.certified === false
    );
  });
  if (!valid) return null;
  return semantic as readonly MarketingSemanticOutcomeRecord[];
}

function tasteRecord(
  artifact: DesignLabDecisionReviewReadyArtifact,
  binding: ReviewBinding
): MarketingTasteOutcomeRecord | null {
  const outcomes = isRecord(artifact.outcomes) ? artifact.outcomes : null;
  const taste = outcomes?.taste;
  if (!isRecord(taste)) return null;
  if (
    taste.schema !== 'marketing-taste-outcome/v1' ||
    taste.decisionId !== binding.decisionId ||
    taste.contextDigest !== binding.contextDigest ||
    taste.candidateDigest !== binding.candidateDigest ||
    !['pending', 'approved', 'rejected', 'unknown'].includes(String(taste.status)) ||
    !Array.isArray(taste.evidenceRefs) ||
    !taste.evidenceRefs.every(item => typeof item === 'string') ||
    (taste.reviewer !== null && !hasText(taste.reviewer)) ||
    taste.certified !== false
  ) {
    return null;
  }
  return taste as MarketingTasteOutcomeRecord;
}

function validateReference(
  reference: DesignLabApprovedFounderReference,
  binding: ReviewBinding,
  subjectId: string
): string | null {
  if (
    !hasText(reference.referenceId) ||
    reference.retrievedFrom !== 'marketing-certification-store' ||
    !validDate(reference.retrievedAt) ||
    reference.subjectId !== subjectId ||
    reference.route !== binding.route ||
    reference.pageId !== binding.pageId ||
    reference.contextDigest !== binding.contextDigest ||
    reference.sourceSha !== binding.sourceSha ||
    reference.artifactSha256 !== binding.artifactSha256 ||
    reference.candidateDigest !== binding.candidateDigest
  ) {
    return 'approved founder reference is not bound to the exact review context';
  }
  const decision = reference.decision;
  const packet = reference.packet;
  if (
    decision.decision !== 'approved' ||
    decision.subjectId !== reference.subjectId ||
    !hasText(decision.id) ||
    !hasText(decision.reviewer) ||
    !validDate(decision.decidedAt) ||
    packet.contract !== 'jovie.certification/v1' ||
    packet.subject.id !== reference.subjectId ||
    packet.candidateDigest !== binding.candidateDigest ||
    packet.source?.sha !== binding.sourceSha
  ) {
    return 'approved founder reference has an invalid decision or candidate/source binding';
  }
  if (buildCertificationDecisionDigest(packet) !== decision.evidenceDigest) {
    return 'approved founder decision digest does not match its packet';
  }
  return null;
}

function existingOutcomeConsumerAccepts(
  commercial: MarketingCommercialOutcomeRecord,
  binding: ReviewBinding
): boolean {
  const context: MarketingFrozenDecisionContext = {
    allowedMutationScope: [],
    audience: 'design-lab',
    claimRevision: binding.contextDigest,
    contextDigest: binding.contextDigest,
    conversionObjective: 'outcome-learning',
    decisionId: binding.decisionId,
    dependencyGraph: {},
    offer: 'design-lab-candidate',
    pageId: binding.pageId,
    recipeRevision: binding.contextDigest,
    rubricRevision: binding.contextDigest,
    sourceRevision: binding.sourceSha,
  };
  const fallback: MarketingCommercialOutcomeRecord = {
    candidateDigest: binding.candidateDigest,
    certified: false,
    contextDigest: binding.contextDigest,
    decisionId: binding.decisionId,
    evidenceRefs: [],
    link: null,
    metrics: null,
    schema: 'marketing-commercial-outcome/v1',
    status: 'unknown',
  };
  return sameJson(
    normalizeMarketingCommercialOutcome({
      candidateDigest: binding.candidateDigest,
      context,
      fallback,
      outcome: commercial,
    }),
    commercial
  );
}

function validateReceipt(
  receipt: DesignLabCommercialOutcomeReceipt,
  binding: ReviewBinding,
  commercial: MarketingCommercialOutcomeRecord
): string | null {
  if (
    !hasText(receipt.receiptId) ||
    !hasText(receipt.sourceRef) ||
    !exactSha(receipt.sourceSha, 40) ||
    receipt.route !== binding.route ||
    receipt.pageId !== binding.pageId ||
    receipt.decisionId !== binding.decisionId ||
    receipt.contextDigest !== binding.contextDigest ||
    receipt.candidateDigest !== binding.candidateDigest ||
    !hasText(receipt.variantId) ||
    !validDate(receipt.observedAt) ||
    !Array.isArray(receipt.evidenceRefs) ||
    !receipt.evidenceRefs.every(item => hasText(item)) ||
    !sameJson(receipt.evidenceRefs, commercial.evidenceRefs) ||
    !sameJson(receipt.record, commercial) ||
    receipt.sourceSha !== binding.sourceSha ||
    commercial.schema !== 'marketing-commercial-outcome/v1' ||
    commercial.decisionId !== binding.decisionId ||
    commercial.contextDigest !== binding.contextDigest ||
    commercial.candidateDigest !== binding.candidateDigest ||
    commercial.certified !== false ||
    commercial.link?.source !== 'existing-outcome-loop' ||
    commercial.link.variantId !== receipt.variantId ||
    commercial.link.outcomeReceiptId !== receipt.receiptId ||
    (receipt.workflowRunId ?? null) !== (commercial.link.workflowRunId ?? null)
  ) {
    return 'commercial outcome receipt is not bound to the exact review evidence';
  }
  const expectedStatus: Record<
    DesignLabCommercialResult,
    MarketingCommercialOutcomeRecord['status']
  > = {
    positive: 'observed-positive',
    negative: 'observed-zero',
    inconclusive: 'measuring',
    unknown: 'unknown',
  };
  if (commercial.status !== expectedStatus[receipt.result]) {
    return 'commercial outcome result disagrees with the existing outcome record';
  }
  if (!existingOutcomeConsumerAccepts(commercial, binding)) {
    return 'existing marketing outcome consumer rejected the commercial record';
  }
  if (receipt.result === 'positive' || receipt.result === 'negative') {
    if (!metrics(receipt.metrics) || !sameJson(receipt.metrics, commercial.metrics)) {
      return 'observed commercial outcomes require exact finite metrics';
    }
    if (
      receipt.result === 'negative' &&
      Object.values(receipt.metrics).some(value => value !== 0)
    ) {
      return 'negative commercial outcomes require exact zero metrics';
    }
    if (
      receipt.result === 'positive' &&
      Object.values(receipt.metrics).every(value => value <= 0)
    ) {
      return 'positive commercial outcomes require a positive measured metric';
    }
  } else if (receipt.metrics !== null || commercial.metrics !== null) {
    return 'immature or unknown commercial outcomes cannot carry invented metrics';
  }
  if (receipt.windowStart !== null && !validDate(receipt.windowStart)) {
    return 'commercial outcome windowStart is invalid';
  }
  if (receipt.windowEnd !== null && !validDate(receipt.windowEnd)) {
    return 'commercial outcome windowEnd is invalid';
  }
  if (
    receipt.windowStart &&
    receipt.windowEnd &&
    Date.parse(receipt.windowEnd) < Date.parse(receipt.windowStart)
  ) {
    return 'commercial outcome window is reversed';
  }
  return null;
}

/**
 * Convert one existing certification projection into the reference shape
 * consumed below. The projection is read from MarketingCertificationStore;
 * this helper does not create or persist another approved-reference store.
 */
export function approvedFounderReferenceFromMarketingProjection(
  input: DesignLabOutcomeProjectionSource
): DesignLabApprovedFounderReference | null {
  const decision = input.projection.admission.currentDecision;
  if (!decision || decision.decision !== 'approved') return null;
  return {
    artifactSha256: input.artifactSha256,
    candidateDigest: input.candidateDigest,
    contextDigest: input.contextDigest,
    decision,
    packet: input.projection.packet,
    pageId: input.pageId,
    referenceId: input.referenceId,
    retrievedAt: input.retrievedAt,
    retrievedFrom: 'marketing-certification-store',
    route: input.route,
    sourceSha: input.sourceSha,
    subjectId: input.projection.identityId,
  };
}

/** Read the current approved decision from the existing certification ledger. */
export async function readApprovedFounderReferenceFromMarketingStore(
  input: DesignLabApprovedReferenceLookup
): Promise<DesignLabApprovedFounderReference | null> {
  const retrievedAt = input.retrievedAt ?? new Date().toISOString();
  const projection = await getMarketingCertificationStore().projectLedger(retrievedAt);
  const row = projection.rows.find(entry => entry.identityId === input.subjectId);
  if (!row) return null;
  const decision = row.admission.currentDecision;
  if (!decision || decision.decision !== 'approved') return null;
  return approvedFounderReferenceFromMarketingProjection({
    artifactSha256: input.artifactSha256,
    candidateDigest: input.candidateDigest,
    contextDigest: input.contextDigest,
    pageId: input.pageId,
    projection: row,
    referenceId: `marketing-certification:${input.subjectId}:${decision.id}`,
    retrievedAt,
    route: input.route,
    sourceSha: input.sourceSha,
  });
}

export async function consumeDesignLabOutcomeLearning(
  input: DesignLabOutcomeLearningRequest
): Promise<DesignLabOutcomeLearningResult> {
  const bindingResult = reviewBinding(input.artifact);
  if ('error' in bindingResult) {
    return failure('invalid-review', bindingResult.error);
  }
  const binding = { ...bindingResult.binding, route: input.artifact.route };
  const semantic = semanticRecords(input.artifact, binding);
  if (!semantic) {
    return failure('invalid-review', 'review packet semantic outcomes are invalid');
  }
  const recordedTaste = tasteRecord(input.artifact, binding);
  if (!recordedTaste) {
    return failure('invalid-review', 'review packet taste outcome is invalid');
  }

  let reference = input.approvedReference;
  if (reference === undefined) {
    const readReference =
      input.readApprovedReference ?? readApprovedFounderReferenceFromMarketingStore;
    try {
      reference = await readReference({
        candidateDigest: binding.candidateDigest,
        contextDigest: binding.contextDigest,
        artifactSha256: binding.artifactSha256,
        pageId: binding.pageId,
        route: binding.route,
        sourceSha: binding.sourceSha,
        subjectId: input.subjectId,
      });
    } catch {
      reference = null;
    }
  }
  if (!reference) {
    return failure('no-approval', 'no approved founder reference was retrieved');
  }
  const referenceError = validateReference(reference, binding, input.subjectId);
  if (referenceError) return failure('misbound-reference', referenceError);

  const outcomes = input.artifact.outcomes as Record<string, unknown>;
  const commercial = outcomes.commercial as MarketingCommercialOutcomeRecord;
  const link = commercial.link;
  if (!link?.outcomeReceiptId || !link.variantId) {
    return failure(
      'outcome-unavailable',
      'approved review has no existing outcome receipt link'
    );
  }

  let receipt = input.outcomeReceipt;
  if (receipt === undefined && input.readOutcomeReceipt) {
    try {
      receipt = await input.readOutcomeReceipt({
        receiptId: link.outcomeReceiptId,
        variantId: link.variantId,
        workflowRunId: link.workflowRunId ?? null,
      });
    } catch {
      receipt = null;
    }
  }
  if (!receipt) {
    return failure('outcome-unavailable', 'existing outcome receipt was not readable');
  }
  const receiptError = validateReceipt(receipt, binding, commercial);
  if (receiptError) return failure('invalid-outcome', receiptError);

  const outcomeBundle: MarketingImprovementOutcomeBundle = {
    commercial,
    semantic,
    taste: {
      ...recordedTaste,
      evidenceRefs: [
        reference.referenceId,
        reference.decision.id,
        reference.decision.evidenceDigest,
      ],
      reviewer: reference.decision.reviewer,
      status: 'approved',
    },
  };
  if (input.recordOutcomes) {
    try {
      await input.recordOutcomes(outcomeBundle);
    } catch {
      return failure(
        'learning-consumer-unavailable',
        'existing marketing outcome consumer did not accept the reviewed bundle'
      );
    }
  }

  const learningRefs = [
    input.artifact.artifactDigest,
    reference.referenceId,
    reference.decision.evidenceDigest,
    receipt.receiptId,
    receipt.sourceRef,
  ];
  const recommendation =
    receipt.result === 'positive'
      ? 'consider-bounded-follow-up'
      : receipt.result === 'negative'
        ? 'retain-incumbent'
        : 'preserve-uncertainty';
  const projection: DesignLabOutcomeLearningProjection = {
    activationTriggered: false,
    approval: {
      decisionEvidenceDigest: reference.decision.evidenceDigest,
      decisionId: reference.decision.id,
      decidedAt: reference.decision.decidedAt,
      referenceId: reference.referenceId,
      reviewer: reference.decision.reviewer,
      subjectId: reference.subjectId,
    },
    artifactDigest: input.artifact.artifactDigest,
    causalStatus: 'unproven',
    certified: false,
    commercial: {
      evidenceRefs: receipt.evidenceRefs,
      metrics: receipt.metrics,
      observedAt: receipt.observedAt,
      receiptId: receipt.receiptId,
      result: receipt.result,
      existingRecordStatus: commercial.status,
      sourceRef: receipt.sourceRef,
      sourceSha: receipt.sourceSha,
      variantId: receipt.variantId,
      windowEnd: receipt.windowEnd,
      windowStart: receipt.windowStart,
      workflowRunId: receipt.workflowRunId ?? null,
    },
    context: binding,
    experimentActivated: false,
    learningDigest: marketingDecisionDigest({
      artifactDigest: input.artifact.artifactDigest,
      approval: reference.decision.evidenceDigest,
      commercialReceipt: receipt,
      context: binding,
      semantic,
    }),
    learningRefs,
    recommendation,
    reviewId: input.artifact.reviewId,
    schema: DESIGN_LAB_OUTCOME_LEARNING_SCHEMA,
    semantic,
    taste: {
      evidenceRefs: [
        reference.referenceId,
        reference.decision.id,
        reference.decision.evidenceDigest,
      ],
      reviewer: reference.decision.reviewer,
      status: 'approved',
    },
    existingOutcomeConsumer: input.recordOutcomes ? 'recorded' : 'not-requested',
  };
  return { ok: true, projection, status: 'admitted' };
}
