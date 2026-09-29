import {
  validateFollowUpEvidence,
  validateMaterialEvidence,
  validateQuestionEvidence,
} from './answer-loop-certification-evidence';
import {
  add,
  deduplicateInvestorQuestions,
  digest,
  questionSnapshot,
  type StableValue,
  time,
} from './answer-loop-certification-shared';
import {
  INVESTOR_ANSWER_FIRST_LOOP_CONTRACT,
  type InvestorAnswerFirstLoopCertification,
  type InvestorAnswerFirstLoopEvidence,
  type InvestorAnswerFirstLoopIssue,
  type InvestorFollowUpDeliveryEvent,
} from './answer-loop-certification-types';
import { validateAnswerReusePack } from './answer-reuse';

export {
  buildInvestorFollowUpSnapshotHash,
  buildInvestorMaterialContentHash,
  deduplicateInvestorQuestions,
} from './answer-loop-certification-shared';
export type * from './answer-loop-certification-types';

function reconcileDeliveryEvents(
  evidence: InvestorAnswerFirstLoopEvidence,
  issues: InvestorAnswerFirstLoopIssue[]
): readonly InvestorFollowUpDeliveryEvent[] {
  const events = new Map<string, InvestorFollowUpDeliveryEvent>();
  for (const event of evidence.deliveryEvents) {
    const existing = events.get(event.eventId);
    if (!existing) {
      events.set(event.eventId, event);
    } else if (
      digest(existing as unknown as StableValue) !==
      digest(event as unknown as StableValue)
    ) {
      add(
        issues,
        'delivery-event-conflict',
        `deliveryEvents.${event.eventId}`,
        'A provider event id was replayed with changed data.'
      );
    }
  }
  const unique = [...events.values()].sort(
    (left, right) =>
      (time(left.occurredAt) ?? 0) - (time(right.occurredAt) ?? 0)
  );
  if (new Set(unique.map(event => event.attemptId)).size > 1) {
    add(
      issues,
      'duplicate-send-attempt',
      'deliveryEvents.attemptId',
      'One approval cannot create multiple delivery attempts.'
    );
  }
  if (new Set(unique.map(event => event.idempotencyKey)).size > 1) {
    add(
      issues,
      'duplicate-send-attempt',
      'deliveryEvents.idempotencyKey',
      'Retries must preserve the original delivery idempotency key.'
    );
  }
  for (const event of unique) {
    if (
      !event.eventId.trim() ||
      !event.attemptId.trim() ||
      !event.idempotencyKey.trim() ||
      event.followUpId !== evidence.followUp.followUpId ||
      event.snapshotHash !== evidence.followUp.approval.snapshotHash ||
      event.senderRef !== evidence.followUp.senderRef ||
      event.recipientRef !== evidence.followUp.recipientRef ||
      event.destination !== evidence.followUp.destination ||
      time(event.occurredAt) === null ||
      event.authorizationState !== 'authorized' ||
      event.suppressionState !== 'clear' ||
      (time(event.authorizationCheckedAt) ?? Number.POSITIVE_INFINITY) >
        (time(event.occurredAt) ?? Number.NEGATIVE_INFINITY) ||
      (time(event.authorizationCheckedAt) ?? Number.NEGATIVE_INFINITY) <
        (time(evidence.followUp.approval.reviewedAt) ??
          Number.POSITIVE_INFINITY) ||
      (time(event.suppressionCheckedAt) ?? Number.POSITIVE_INFINITY) >
        (time(event.occurredAt) ?? Number.NEGATIVE_INFINITY) ||
      (time(event.suppressionCheckedAt) ?? Number.NEGATIVE_INFINITY) <
        (time(evidence.followUp.approval.reviewedAt) ??
          Number.POSITIVE_INFINITY) ||
      (event.eventType === 'delivered' && !event.providerReference?.trim())
    ) {
      add(
        issues,
        'delivery-binding',
        `deliveryEvents.${event.eventId}`,
        'Delivery evidence must bind the exact approval and execution-time authorization checks.'
      );
    }
  }
  const latest = unique.at(-1);
  if (!latest) {
    add(
      issues,
      'delivery-incomplete',
      'deliveryEvents',
      'A delivery receipt is required.'
    );
  } else if (latest.eventType === 'ambiguous') {
    add(
      issues,
      'provider-ambiguous',
      `deliveryEvents.${latest.eventId}`,
      'An ambiguous provider result cannot be treated as delivered or retried blindly.'
    );
  } else if (latest.eventType === 'failed') {
    add(
      issues,
      'delivery-failed',
      `deliveryEvents.${latest.eventId}`,
      'Delivery failed.'
    );
  } else if (latest.eventType !== 'delivered') {
    add(
      issues,
      'delivery-incomplete',
      `deliveryEvents.${latest.eventId}`,
      'A provider-accepted request is distinct from confirmed delivery.'
    );
  }
  return unique;
}

export function certifyInvestorAnswerFirstLoop(
  evidence: InvestorAnswerFirstLoopEvidence
): InvestorAnswerFirstLoopCertification {
  const issues: InvestorAnswerFirstLoopIssue[] = [];
  const now = time(evidence.evaluatedAt);
  if (now === null) {
    add(
      issues,
      'invalid-time',
      'evaluatedAt',
      'Evaluation time must be a real ISO date.'
    );
  }
  const deduplication = deduplicateInvestorQuestions(evidence.questionRecords);
  issues.push(...deduplication.issues);
  const question = deduplication.records.find(
    candidate => candidate.questionId === evidence.questionId
  );
  if (!question) {
    add(
      issues,
      'question-missing',
      'questionId',
      'The selected private question is missing.'
    );
  }
  if (validateAnswerReusePack(evidence.answerPack).length > 0) {
    add(
      issues,
      'answer-invalid',
      'answerPack',
      'The canonical answer pack is invalid.'
    );
  }
  if (evidence.answerPack.sourceAnswer.review.state !== 'approved') {
    add(
      issues,
      'answer-not-approved',
      'answerPack.sourceAnswer.review',
      'Answer is not approved.'
    );
  }

  if (question && now !== null) {
    validateQuestionEvidence(question, evidence, now, issues);
    validateMaterialEvidence(
      evidence.publicArticle,
      'public-article',
      evidence,
      question,
      now,
      issues
    );
    validateMaterialEvidence(
      evidence.privateMemo,
      'private-memo',
      evidence,
      question,
      now,
      issues
    );
    validateFollowUpEvidence(evidence, question, now, issues);
  }
  const deliveryEvents = reconcileDeliveryEvents(evidence, issues);
  const delivered = [...deliveryEvents]
    .reverse()
    .find(event => event.eventType === 'delivered');
  const outcomeAt = time(evidence.outcome.observedAt);
  if (
    !evidence.outcome.outcomeId.trim() ||
    !evidence.outcome.sourceRef.trim() ||
    outcomeAt === null ||
    outcomeAt > (now ?? Number.NEGATIVE_INFINITY) ||
    outcomeAt <
      (time(delivered?.occurredAt ?? '') ?? Number.POSITIVE_INFINITY) ||
    (evidence.outcome.type === 'controlled-test-delivered' &&
      evidence.followUp.allowedAudience !== 'controlled-test')
  ) {
    add(
      issues,
      'outcome-invalid',
      'outcome',
      'Outcome receipt is missing or chronologically invalid.'
    );
  }
  if (
    evidence.outcome.type === 'click' ||
    evidence.outcome.actor === 'scanner' ||
    evidence.outcome.actor === 'unknown-bot'
  ) {
    add(
      issues,
      'scanner-intent',
      'outcome',
      'Scanner or unknown-bot activity is not investor intent or a relationship outcome.'
    );
  }

  if (issues.length > 0 || !question || !delivered || now === null) {
    return { status: 'blocked', issues, receipt: null };
  }

  const synthetic = question.source.authorization.basis === 'synthetic-fixture';
  return {
    status: 'certified',
    issues: [],
    receipt: {
      contract: INVESTOR_ANSWER_FIRST_LOOP_CONTRACT,
      status: 'certified',
      scope: synthetic ? 'synthetic-controlled-test' : 'permitted-question',
      certifiedAt: evidence.evaluatedAt,
      evidenceDigest: digest({
        answerId: evidence.answerPack.sourceAnswer.answerId,
        answerVersion: evidence.answerPack.sourceAnswer.version,
        deliveryEvents: deliveryEvents as unknown as StableValue,
        followUpHash: evidence.followUp.approval.snapshotHash,
        outcome: evidence.outcome as unknown as StableValue,
        privateMaterialHash: evidence.privateMemo.contentHash,
        publicMaterialHash: evidence.publicArticle.contentHash,
        question: questionSnapshot(question),
      }),
      questionId: question.questionId,
      answerId: evidence.answerPack.sourceAnswer.answerId,
      answerVersion: evidence.answerPack.sourceAnswer.version,
      publicArtifactId: evidence.publicArticle.artifactId,
      privateArtifactId: evidence.privateMemo.artifactId,
      followUpId: evidence.followUp.followUpId,
      deliveryAttemptId: delivered.attemptId,
      outcomeId: evidence.outcome.outcomeId,
      limitations: [
        synthetic
          ? 'Synthetic controlled-recipient proof; no investor delivery or relationship outcome is claimed.'
          : 'Certification records supported receipts only; delivery or response does not prove fundraising causality.',
        'Source, CI, merge, deploy, runtime, publication, delivery, and relationship outcomes remain distinct evidence.',
      ],
    },
  };
}
