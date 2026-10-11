import { type CopyRegister, lintCopy } from '@jovie/copy';
import {
  getCapabilityRecord,
  isFeatureUsable,
} from '@/data/marketing/featureAvailability';
import type {
  AnswerClaimAssertion,
  AnswerDerivativeContent,
  AnswerReusePack,
  AnswerReuseValidationIssue,
  AnswerReuseValidationOptions,
  CanonicalAnswerClaim,
  DerivativeChannel,
  DistributionApprovals,
  DistributionDecision,
  DistributionScope,
  PublicDiscoveryProjection,
} from './answer-reuse-types';

export { applyAnswerSourceChange } from './answer-reuse-invalidation';
export type * from './answer-reuse-types';

const STABLE_BLOG_PATH = /^\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CAPABILITY_EVIDENCE_REF =
  /featureAvailability\.ts#([a-z0-9]+(?:-[a-z0-9]+)*)$/u;
const UNPROVEN_ASSERTIONS: readonly AnswerClaimAssertion[] = [
  'hypothesis',
  'plan',
  'forecast',
];
const FACTUAL_ASSERTIONS: readonly AnswerClaimAssertion[] = [
  'observed-fact',
  'founder-attested',
];
const RANKING_PROMISE =
  /\b(?:will|guaranteed? to|guarantees?)\s+rank\b|\brank(?:s|ing)?\s+(?:first|higher|at the top)\b/iu;

function isIsoDate(value: string | undefined): boolean {
  return Boolean(
    value &&
      /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/u.test(value) &&
      !Number.isNaN(new Date(value).getTime())
  );
}

function contentText(content: AnswerDerivativeContent): string {
  return [
    content.title,
    content.summary,
    ...content.sections.flatMap(section => [section.heading, section.body]),
  ].join('\n');
}

function copyRegister(channel: DerivativeChannel): CopyRegister {
  return channel === 'founder-social' ? 'founder-tim' : 'jovie-marketing';
}

function distributionEntries(
  approvals: DistributionApprovals
): readonly [DistributionScope, DistributionDecision][] {
  return [
    ['public-publishing', approvals.publicPublishing],
    ['email-social-sending', approvals.emailSocialSending],
    ['paid-promotion', approvals.paidPromotion],
  ];
}

function issue(
  issues: AnswerReuseValidationIssue[],
  derivativeId: string | undefined,
  code: string,
  path: string,
  message: string
): void {
  issues.push({ derivativeId, code, path, message });
}

/**
 * JOV-5024: every canonical claim carries exact wording, assertion type,
 * subject, evidence references, as-of date, review receipt, freshness policy,
 * limitations, and disclosure scope. Unproven assertions can never carry
 * demonstrated-performance evidence quality, and availability claims are
 * resolved against the shared JOV-6216 capability contract (fail closed).
 */
function validateCanonicalClaim(
  claim: CanonicalAnswerClaim,
  index: number,
  issues: AnswerReuseValidationIssue[]
): void {
  const path = `sourceAnswer.claims.${index}`;
  if (
    !claim.assertion ||
    !claim.subject.trim() ||
    !claim.reviewedBy.trim() ||
    !isIsoDate(claim.asOf) ||
    !isIsoDate(claim.reviewedAt)
  ) {
    issue(
      issues,
      undefined,
      'invalid-claim-record',
      path,
      'Claims require an assertion type, subject, as-of date, and a dated accountable reviewer.'
    );
  }
  if (claim.expiresAt !== undefined) {
    if (!isIsoDate(claim.expiresAt) || claim.expiresAt <= claim.asOf) {
      issue(
        issues,
        undefined,
        'invalid-claim-expiry',
        `${path}.expiresAt`,
        'Claim freshness windows must be real dates after the as-of date.'
      );
    }
  }
  if (
    UNPROVEN_ASSERTIONS.includes(claim.assertion) &&
    claim.evidenceQuality !== 'hypothesis'
  ) {
    issue(
      issues,
      undefined,
      'unproven-claim-quality',
      `${path}.evidenceQuality`,
      'Hypotheses, plans, and forecasts can never be published as demonstrated performance.'
    );
  }
  if (claim.assertion === 'forecast' && !claim.expiresAt) {
    issue(
      issues,
      undefined,
      'forecast-freshness',
      `${path}.expiresAt`,
      'Forecasts require an explicit freshness window.'
    );
  }
  if (
    (UNPROVEN_ASSERTIONS.includes(claim.assertion) ||
      claim.kind === 'measured-outcome') &&
    claim.limitations.length === 0
  ) {
    issue(
      issues,
      undefined,
      'claim-limitations',
      `${path}.limitations`,
      'Unproven and measured claims must state their limitations.'
    );
  }
  if (claim.kind === 'measured-outcome') {
    if (
      !claim.cohort ||
      !claim.cohort.label.trim() ||
      !Number.isInteger(claim.cohort.sampleSize) ||
      claim.cohort.sampleSize < 1
    ) {
      issue(
        issues,
        undefined,
        'measured-claim-cohort',
        `${path}.cohort`,
        'Measured claims must keep their cohort label and sample size attached.'
      );
    }
  }
  if (claim.kind === 'current-availability') {
    const capabilityIds = claim.evidenceRefs
      .map(ref => CAPABILITY_EVIDENCE_REF.exec(ref)?.[1])
      .filter((id): id is string => Boolean(id));
    if (capabilityIds.length === 0) {
      issue(
        issues,
        undefined,
        'capability-evidence-required',
        `${path}.evidenceRefs`,
        'Availability claims must bind a featureAvailability capability id.'
      );
    }
    for (const capabilityId of capabilityIds) {
      const record = getCapabilityRecord(capabilityId);
      if (!record) {
        issue(
          issues,
          undefined,
          'unknown-capability',
          `${path}.evidenceRefs`,
          `Availability claim references unknown capability '${capabilityId}'.`
        );
        continue;
      }
      if (claim.disclosure === 'public' && record.publication !== 'public') {
        issue(
          issues,
          undefined,
          'unpublished-capability-claim',
          path,
          `Capability '${capabilityId}' is not cleared for public publication.`
        );
      }
      if (
        !isFeatureUsable(record) &&
        FACTUAL_ASSERTIONS.includes(claim.assertion)
      ) {
        issue(
          issues,
          undefined,
          'unavailable-capability-fact',
          path,
          `Capability '${capabilityId}' is not usable; it cannot be claimed as an observed fact.`
        );
      }
    }
  }
}

export function validateAnswerReusePack(
  pack: AnswerReusePack,
  options: AnswerReuseValidationOptions = {}
): readonly AnswerReuseValidationIssue[] {
  const issues: AnswerReuseValidationIssue[] = [];
  const evaluatedAt = options.evaluatedAt;
  const { sourceAnswer } = pack;
  const claims = new Map(
    sourceAnswer.claims.map(claim => [claim.claimId, claim] as const)
  );

  if (claims.size !== sourceAnswer.claims.length) {
    issue(
      issues,
      undefined,
      'duplicate-source-claim',
      'sourceAnswer.claims',
      'Canonical claim ids must be unique.'
    );
  }
  for (const [index, claim] of sourceAnswer.claims.entries()) {
    if (
      !claim.claimId.trim() ||
      !claim.revisionId.trim() ||
      !claim.statement.trim() ||
      !isIsoDate(claim.revisedAt)
    ) {
      issue(
        issues,
        undefined,
        'invalid-source-claim',
        `sourceAnswer.claims.${index}`,
        'Canonical claims require stable ids, a statement, and a real revision date.'
      );
    }
    if (
      claim.evidenceQuality !== 'hypothesis' &&
      claim.evidenceRefs.length === 0
    ) {
      issue(
        issues,
        undefined,
        'missing-claim-evidence',
        `sourceAnswer.claims.${index}.evidenceRefs`,
        'Canonical and verified claims require evidence references.'
      );
    }
    validateCanonicalClaim(claim, index, issues);
  }

  if (
    sourceAnswer.review.state === 'approved' &&
    (!sourceAnswer.review.reviewedBy ||
      !isIsoDate(sourceAnswer.review.reviewedAt) ||
      !sourceAnswer.review.approvalBasis)
  ) {
    issue(
      issues,
      undefined,
      'source-approval-receipt',
      'sourceAnswer.review',
      'Approved source answers require reviewer, review date, and approval basis.'
    );
  }

  const privateMarkers = [
    sourceAnswer.privateContext?.question,
    ...(sourceAnswer.privateContext?.identities ?? []),
    ...sourceAnswer.claims
      .filter(claim => claim.disclosure !== 'public')
      .map(claim => claim.statement),
  ].filter((value): value is string => Boolean(value?.trim()));
  const canonicalPaths = new Map<string, string>();
  const derivativeIdCounts = new Map<string, number>();
  for (const derivative of pack.derivatives) {
    derivativeIdCounts.set(
      derivative.derivativeId,
      (derivativeIdCounts.get(derivative.derivativeId) ?? 0) + 1
    );
  }

  for (const derivative of pack.derivatives) {
    const id = derivative.derivativeId;
    const text = contentText(derivative.content);
    const normalizedText = text.toLowerCase();

    if ((derivativeIdCounts.get(id) ?? 0) > 1) {
      issue(
        issues,
        id,
        'duplicate-derivative',
        'derivativeId',
        'Derivative ids must be unique within the usage map.'
      );
    }

    if (
      derivative.sourceAnswerId !== sourceAnswer.answerId ||
      derivative.sourceAnswerVersion !== sourceAnswer.version
    ) {
      issue(
        issues,
        id,
        'stale-source',
        'sourceAnswerVersion',
        'Derivative must bind the current canonical answer id and version.'
      );
    }
    if (!derivative.audience.trim() || !derivative.purpose.trim()) {
      issue(
        issues,
        id,
        'missing-use-context',
        'audience',
        'Audience and purpose are required.'
      );
    }
    if (!derivative.intendedUse.trim() || !derivative.nextStep.trim()) {
      issue(
        issues,
        id,
        'missing-intended-use',
        'intendedUse',
        'An intended use and relevant next step are required.'
      );
    }
    if (!isIsoDate(derivative.contentRevision)) {
      issue(
        issues,
        id,
        'invalid-content-revision',
        'contentRevision',
        'Content revision must be a real ISO date, never request time.'
      );
    }
    if (derivative.content.sections.length === 0) {
      issue(
        issues,
        id,
        'missing-headings',
        'content.sections',
        'Derivatives require at least one clear, non-empty section heading.'
      );
    }
    const headings = new Set<string>();
    for (const [index, section] of derivative.content.sections.entries()) {
      const heading = section.heading.trim().toLowerCase();
      if (!heading || headings.has(heading)) {
        issue(
          issues,
          id,
          'unclear-heading',
          `content.sections.${index}.heading`,
          'Section headings must be non-empty and unique.'
        );
      }
      headings.add(heading);
    }

    const seenClaims = new Set<string>();
    for (const [index, claimUse] of derivative.claimUses.entries()) {
      const claim = claims.get(claimUse.claimId);
      if (!claim || claim.revisionId !== claimUse.revisionId) {
        issue(
          issues,
          id,
          'unknown-claim-revision',
          `claimUses.${index}`,
          'Claim use must bind an exact current source claim revision.'
        );
      } else {
        if (
          derivative.disclosure === 'public' &&
          claim.disclosure !== 'public'
        ) {
          issue(
            issues,
            id,
            'private-claim',
            `claimUses.${index}`,
            'A private or internal claim cannot enter a public derivative.'
          );
        }
        if (evaluatedAt && claim.expiresAt && claim.expiresAt < evaluatedAt) {
          issue(
            issues,
            id,
            'expired-claim-evidence',
            `claimUses.${index}`,
            'Claim evidence is past its freshness window and must be re-reviewed.'
          );
        }
      }
      if (seenClaims.has(claimUse.claimId)) {
        issue(
          issues,
          id,
          'duplicate-claim-use',
          `claimUses.${index}`,
          'Each claim revision is referenced once per derivative.'
        );
      }
      seenClaims.add(claimUse.claimId);
    }
    if (derivative.claimUses.length === 0) {
      issue(
        issues,
        id,
        'missing-claims',
        'claimUses',
        'Every derivative requires at least one source claim revision.'
      );
    }

    if (derivative.disclosure === 'public') {
      for (const marker of privateMarkers) {
        if (normalizedText.includes(marker.toLowerCase())) {
          issue(
            issues,
            id,
            'private-context-leak',
            'content',
            'Public copy contains private source context or a non-public claim.'
          );
          break;
        }
      }
    }
    if (
      derivative.channel === 'customer-editorial' &&
      (derivative.treatment !== 'customer-value' ||
        derivative.content.summary.trim() === sourceAnswer.directAnswer.trim())
    ) {
      issue(
        issues,
        id,
        'investor-rebuttal-reuse',
        'content.summary',
        'Customer editorial must explain customer value instead of copying the source answer.'
      );
    }
    if (RANKING_PROMISE.test(text)) {
      issue(
        issues,
        id,
        'ranking-promise',
        'content',
        'Answer reuse cannot promise search or agent ranking.'
      );
    }
    for (const finding of lintCopy(text, {
      register: copyRegister(derivative.channel),
    }).blocking) {
      issue(issues, id, `copy-${finding.rule}`, 'content', finding.message);
    }

    if (
      derivative.review.state === 'approved' &&
      (sourceAnswer.review.state !== 'approved' ||
        !derivative.review.reviewedBy ||
        !isIsoDate(derivative.review.reviewedAt))
    ) {
      issue(
        issues,
        id,
        'derivative-approval-receipt',
        'review',
        'Approved derivatives require an approved source and dated review receipt.'
      );
    }
    for (const [scope, decision] of distributionEntries(
      derivative.distribution
    )) {
      if (
        decision.state === 'approved' &&
        (!decision.approvedBy || !isIsoDate(decision.decidedAt))
      ) {
        issue(
          issues,
          id,
          'distribution-approval-receipt',
          `distribution.${scope}`,
          'Each distribution approval requires its own approver and date.'
        );
      }
      if (
        derivative.review.state !== 'approved' &&
        decision.state === 'approved'
      ) {
        issue(
          issues,
          id,
          derivative.review.state === 'draft'
            ? 'draft-distribution'
            : 'unreviewed-distribution',
          `distribution.${scope}`,
          'Only currently approved copy can receive distribution permission.'
        );
      }
    }

    for (const [index, receipt] of derivative.usageReceipts.entries()) {
      if (!isIsoDate(receipt.usedAt) || !receipt.reference.trim()) {
        issue(
          issues,
          id,
          'invalid-usage-receipt',
          `usageReceipts.${index}`,
          'Observed use requires a dated, traceable reference.'
        );
      }
    }

    const needsCanonical =
      derivative.channel === 'customer-editorial' ||
      derivative.releaseState !== 'candidate';
    if (
      needsCanonical &&
      (!derivative.canonicalPath ||
        !STABLE_BLOG_PATH.test(derivative.canonicalPath))
    ) {
      issue(
        issues,
        id,
        'unstable-canonical',
        'canonicalPath',
        'Editorial publication requires one stable canonical blog path.'
      );
    }
    if (derivative.canonicalPath) {
      const existing = canonicalPaths.get(derivative.canonicalPath);
      if (existing) {
        issue(
          issues,
          existing,
          'duplicate-canonical',
          'canonicalPath',
          `Canonical path is also claimed by ${id}.`
        );
        issue(
          issues,
          id,
          'duplicate-canonical',
          'canonicalPath',
          `Canonical path is already owned by ${existing}.`
        );
      } else {
        canonicalPaths.set(derivative.canonicalPath, id);
      }
    }
    if (
      derivative.distribution.publicPublishing.state === 'approved' &&
      (derivative.disclosure !== 'public' ||
        derivative.review.state !== 'approved')
    ) {
      issue(
        issues,
        id,
        'public-approval-scope',
        'distribution.publicPublishing',
        'Public publishing approval requires public disclosure and approved copy.'
      );
    }
    if (
      derivative.releaseState === 'published' &&
      derivative.distribution.publicPublishing.state !== 'approved'
    ) {
      issue(
        issues,
        id,
        'published-without-approval',
        'releaseState',
        'Published content requires a scoped public-publishing approval.'
      );
    }
  }

  return issues;
}

/**
 * Projects one approved source into the existing editorial, sitemap, and agent
 * discovery owners. It does not write a route, publish copy, or send anything.
 */
export function buildPublicDiscoveryProjection(
  pack: AnswerReusePack,
  options: AnswerReuseValidationOptions = {}
): PublicDiscoveryProjection {
  const issues = validateAnswerReusePack(pack, options);
  const sourceIssues = issues.filter(candidate => !candidate.derivativeId);
  const claimMap = new Map(
    pack.sourceAnswer.claims.map(claim => [claim.claimId, claim] as const)
  );
  const editorialEntries: PublicDiscoveryProjection['editorialEntries'][number][] =
    [];
  const rejections: PublicDiscoveryProjection['rejections'][number][] = [];

  for (const derivative of pack.derivatives) {
    if (derivative.releaseState !== 'published') continue;
    const derivativeIssues = issues.filter(
      candidate => candidate.derivativeId === derivative.derivativeId
    );
    const blocking = [...sourceIssues, ...derivativeIssues];
    if (blocking.length > 0) {
      rejections.push({
        derivativeId: derivative.derivativeId,
        codes: [...new Set(blocking.map(candidate => candidate.code))],
      });
      continue;
    }
    if (!derivative.canonicalPath) continue;
    editorialEntries.push({
      derivativeId: derivative.derivativeId,
      canonicalPath: derivative.canonicalPath,
      title: derivative.content.title,
      summary: derivative.content.summary,
      sections: derivative.content.sections,
      audience: derivative.audience,
      purpose: derivative.purpose,
      owner: derivative.owner,
      sourceAnswerId: derivative.sourceAnswerId,
      sourceAnswerVersion: derivative.sourceAnswerVersion,
      claims: derivative.claimUses.flatMap(claimUse => {
        const claim = claimMap.get(claimUse.claimId);
        return claim ? [claim] : [];
      }),
      lastModified: derivative.contentRevision,
    });
  }

  return {
    editorialEntries,
    sitemapEntries: editorialEntries.map(entry => ({
      canonicalPath: entry.canonicalPath,
      lastModified: entry.lastModified,
    })),
    agentEntries: editorialEntries.map(entry => ({
      canonicalPath: entry.canonicalPath,
      title: entry.title,
      summary: entry.summary,
      sections: entry.sections,
      claimIds: entry.claims.map(claim => claim.claimId),
      lastModified: entry.lastModified,
    })),
    rejections,
  };
}
