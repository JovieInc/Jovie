import {
  add,
  buildInvestorFollowUpSnapshotHash,
  buildInvestorMaterialContentHash,
  PRIVATE_MEMO_PATH,
  PUBLIC_ARTICLE_PATH,
  SHA256,
  time,
} from './answer-loop-certification-shared';
import type {
  InvestorAnswerFirstLoopEvidence,
  InvestorAnswerFirstLoopIssue,
  InvestorAnswerMaterialReceipt,
  InvestorQuestionRecord,
} from './answer-loop-certification-types';

export function validateQuestionEvidence(
  question: InvestorQuestionRecord,
  evidence: InvestorAnswerFirstLoopEvidence,
  now: number,
  issues: InvestorAnswerFirstLoopIssue[]
): void {
  const capturedAt = time(question.capturedAt);
  const occurredAt = time(question.source.occurredAt);
  const reviewedAt = time(question.classification.reviewedAt);
  if (
    capturedAt === null ||
    occurredAt === null ||
    reviewedAt === null ||
    occurredAt > capturedAt ||
    capturedAt > now ||
    reviewedAt > now
  ) {
    add(
      issues,
      'invalid-time',
      'question',
      'Question receipt times are invalid.'
    );
  }
  if (
    !question.questionId.trim() ||
    !question.tenantId.trim() ||
    !question.relationshipRef.trim() ||
    !question.exactQuestion.trim() ||
    !question.source.sourceEventId.trim() ||
    !question.source.provenanceRef.trim() ||
    question.source.availability !== 'available'
  ) {
    add(
      issues,
      'question-provenance',
      'question.source',
      'The private question requires available, traceable provenance.'
    );
  }
  const authorization = question.source.authorization;
  if (
    (authorization.basis === 'synthetic-fixture' &&
      !authorization.fixtureLabel.trim()) ||
    (authorization.basis === 'permitted-record' &&
      !authorization.permissionRef.trim())
  ) {
    add(
      issues,
      'question-permission',
      'question.source.authorization',
      'Capture requires a labeled fixture or a permission receipt.'
    );
  }
  if (
    question.untrustedContent !== true ||
    question.privacy.disclosure !== 'private-investor' ||
    question.privacy.publicQuotePermission ||
    question.privacy.trainingPermission ||
    question.privacy.externalSearchPermission ||
    question.privacy.adUsePermission
  ) {
    add(
      issues,
      'question-privacy',
      'question.privacy',
      'Private source text must remain untrusted and excluded from public reuse.'
    );
  }
  const classification = question.classification;
  if (
    !classification.theme.trim() ||
    !classification.underlyingConcern.trim() ||
    !classification.reviewedBy.trim() ||
    classification.route !== 'reuse-approved-answer' ||
    classification.canonicalAnswerId !==
      evidence.answerPack.sourceAnswer.answerId ||
    classification.canonicalAnswerVersion !==
      evidence.answerPack.sourceAnswer.version ||
    classification.matchConfidence === null ||
    classification.matchConfidence < 0 ||
    classification.matchConfidence > 1 ||
    !classification.matchRationale?.trim()
  ) {
    add(
      issues,
      'question-classification',
      'question.classification',
      'Certification requires a reviewed, explained match to the exact answer version.'
    );
  }
}

export function validateMaterialEvidence(
  material: InvestorAnswerMaterialReceipt,
  expectedKind: InvestorAnswerMaterialReceipt['kind'],
  evidence: InvestorAnswerFirstLoopEvidence,
  question: InvestorQuestionRecord,
  now: number,
  issues: InvestorAnswerFirstLoopIssue[]
): void {
  const expectedDisclosure =
    expectedKind === 'public-article' ? 'public' : 'private-investor';
  const expectedPath =
    expectedKind === 'public-article' ? PUBLIC_ARTICLE_PATH : PRIVATE_MEMO_PATH;
  if (
    material.kind !== expectedKind ||
    material.disclosure !== expectedDisclosure ||
    !expectedPath.test(material.path) ||
    material.content.sections.length === 0 ||
    !material.content.title.trim() ||
    !material.content.summary.trim() ||
    material.tracking.opens ||
    material.tracking.clicks ||
    material.tracking.advertising ||
    !SHA256.test(material.contentHash) ||
    buildInvestorMaterialContentHash(material) !== material.contentHash ||
    material.review.approvedContentHash !== material.contentHash
  ) {
    add(
      issues,
      'material-invalid',
      expectedKind,
      'Material must bind approved content, a stable path, and tracking-off scope.'
    );
  }
  if (
    material.answerId !== evidence.answerPack.sourceAnswer.answerId ||
    material.answerVersion !== evidence.answerPack.sourceAnswer.version
  ) {
    add(
      issues,
      'answer-binding',
      expectedKind,
      'Material does not bind the current canonical answer version.'
    );
  }
  const reviewedAt = time(material.review.reviewedAt);
  const reviewExpiry = time(material.review.expiresAt);
  if (
    !material.review.reviewedBy.trim() ||
    reviewedAt === null ||
    reviewExpiry === null ||
    reviewedAt > now ||
    reviewExpiry <= now
  ) {
    add(
      issues,
      'material-stale',
      `${expectedKind}.review`,
      'Material review is stale.'
    );
  }
  if (material.availability === 'published') {
    const release = material.releaseApproval;
    if (
      !release ||
      release.contentHash !== material.contentHash ||
      !release.approvedBy.trim() ||
      !release.destination.trim() ||
      !release.allowedAudience.trim() ||
      time(release.approvedAt) === null ||
      (time(release.expiresAt) ?? 0) <= now
    ) {
      add(
        issues,
        'material-invalid',
        `${expectedKind}.releaseApproval`,
        'Published material requires an exact, current release approval.'
      );
    }
  }

  const claimMap = new Map(
    evidence.answerPack.sourceAnswer.claims.map(claim => [claim.claimId, claim])
  );
  if (material.claimReceipts.length !== claimMap.size) {
    add(
      issues,
      'material-invalid',
      `${expectedKind}.claimReceipts`,
      'Material must carry every referenced claim receipt exactly once.'
    );
  }
  const seenClaims = new Set<string>();
  for (const receipt of material.claimReceipts) {
    const claim = claimMap.get(receipt.claimId);
    const asOf = time(receipt.asOf);
    const claimReviewedAt = time(receipt.reviewedAt);
    const expiresAt = time(receipt.expiresAt);
    if (
      !claim ||
      seenClaims.has(receipt.claimId) ||
      claim.revisionId !== receipt.revisionId ||
      claim.disclosure !== receipt.disclosure ||
      !claim.evidenceRefs.every(ref => receipt.sourceRefs.includes(ref)) ||
      !receipt.reviewedBy.trim() ||
      receipt.limitations.length === 0 ||
      receipt.limitations.some(limit => !limit.trim()) ||
      asOf === null ||
      claimReviewedAt === null ||
      expiresAt === null ||
      asOf > claimReviewedAt ||
      claimReviewedAt > now ||
      expiresAt <= now ||
      (expectedKind === 'public-article' && receipt.disclosure !== 'public')
    ) {
      add(
        issues,
        expiresAt !== null && expiresAt <= now
          ? 'material-stale'
          : 'material-invalid',
        `${expectedKind}.claimReceipts.${receipt.claimId}`,
        'Claim receipts require exact revision, evidence, review, expiry, limits, and scope.'
      );
    }
    seenClaims.add(receipt.claimId);
  }

  if (expectedKind === 'public-article') {
    const publicText = [
      material.content.title,
      material.content.summary,
      ...material.content.sections.flatMap(section => [
        section.heading,
        section.body,
      ]),
    ]
      .join('\n')
      .toLowerCase();
    const privateMarkers = [
      question.exactQuestion,
      ...question.privateIdentityMarkers,
      ...evidence.answerPack.sourceAnswer.claims
        .filter(claim => claim.disclosure !== 'public')
        .map(claim => claim.statement),
    ].filter(marker => marker.trim());
    if (
      privateMarkers.some(marker => publicText.includes(marker.toLowerCase()))
    ) {
      add(
        issues,
        'public-private-leak',
        'publicArticle.content',
        'Public material contains private question, identity, or claim text.'
      );
    }
  } else {
    const access = material.privateAccess;
    if (
      !access ||
      access.relationshipRef !== question.relationshipRef ||
      time(access.authorizedAt) === null ||
      time(access.checkedAt) === null ||
      (time(access.expiresAt) ?? 0) <= now
    ) {
      add(
        issues,
        'private-access-invalid',
        'privateMemo.privateAccess',
        'Private material requires current relationship-scoped render authorization.'
      );
    }
    if (access?.revokedAt !== null && access?.revokedAt !== undefined) {
      add(
        issues,
        'private-access-revoked',
        'privateMemo.privateAccess.revokedAt',
        'Revoked private access fails closed.'
      );
    }
  }
}

export function validateFollowUpEvidence(
  evidence: InvestorAnswerFirstLoopEvidence,
  question: InvestorQuestionRecord,
  now: number,
  issues: InvestorAnswerFirstLoopIssue[]
): void {
  const { followUp, publicArticle, privateMemo } = evidence;
  const expectedHash = buildInvestorFollowUpSnapshotHash(followUp);
  if (
    !followUp.followUpId.trim() ||
    !followUp.revision.trim() ||
    !followUp.directAnswer.trim() ||
    !followUp.body.includes(followUp.directAnswer) ||
    followUp.body.length > 1_200 ||
    !followUp.senderRef.trim() ||
    !followUp.recipientRef.trim() ||
    followUp.answerId !== evidence.answerPack.sourceAnswer.answerId ||
    followUp.answerVersion !== evidence.answerPack.sourceAnswer.version ||
    !SHA256.test(followUp.approval.snapshotHash) ||
    followUp.approval.snapshotHash !== expectedHash ||
    followUp.limits.opensTracking ||
    followUp.limits.clicksTracking ||
    followUp.limits.advertising
  ) {
    add(
      issues,
      'follow-up-invalid',
      'followUp',
      'Follow-up must answer directly and bind exact reviewed content and delivery scope.'
    );
  }
  const materials = new Map(
    [publicArticle, privateMemo].map(material => [
      material.artifactId,
      material,
    ])
  );
  if (followUp.materialLinks.length === 0) {
    add(
      issues,
      'follow-up-invalid',
      'followUp.materialLinks',
      'Supporting depth is required.'
    );
  }
  for (const link of followUp.materialLinks) {
    const material = materials.get(link.artifactId);
    if (
      !material ||
      link.contentRevision !== material.contentRevision ||
      link.contentHash !== material.contentHash ||
      link.path !== material.path ||
      !followUp.body.includes(link.path)
    ) {
      add(
        issues,
        'follow-up-invalid',
        `followUp.materialLinks.${link.artifactId}`,
        'Each link must reference the exact approved material revision named in the email.'
      );
    }
  }
  const reviewedAt = time(followUp.approval.reviewedAt);
  const expiresAt = time(followUp.limits.expiresAt);
  if (
    !followUp.approval.reviewedBy.trim() ||
    reviewedAt === null ||
    reviewedAt > now ||
    expiresAt === null ||
    expiresAt <= now
  ) {
    add(
      issues,
      'follow-up-stale',
      'followUp.approval',
      'Follow-up approval is stale.'
    );
  }
  if (
    followUp.limits.fundraisingSolicitation &&
    !followUp.limits.legalReviewRef
  ) {
    add(
      issues,
      'follow-up-invalid',
      'followUp.limits.legalReviewRef',
      'Fundraising solicitation requires a legal review reference.'
    );
  }
  if (
    followUp.recipientRef !== question.relationshipRef ||
    followUp.recipientAuthorization.state !== 'authorized' ||
    !followUp.recipientAuthorization.basisRef.trim() ||
    time(followUp.recipientAuthorization.checkedAt) === null ||
    (time(followUp.recipientAuthorization.expiresAt) ?? 0) <= now ||
    followUp.recipientAuthorization.revokedAt !== null
  ) {
    add(
      issues,
      'recipient-unauthorized',
      'followUp.recipientAuthorization',
      'Recipient authorization must be current and bound to the private relationship.'
    );
  }
  if (
    followUp.suppression.state !== 'clear' ||
    time(followUp.suppression.checkedAt) === null
  ) {
    add(
      issues,
      'recipient-suppressed',
      'followUp.suppression',
      'Suppression must be rechecked and clear.'
    );
  }
}
