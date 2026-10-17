#!/usr/bin/env node

/**
 * Evidence-grounded Summer/Symphony operational report pilot (JOV-6477).
 *
 * This module prepares text for the existing Symphony doctor -> Linear boundary.
 * It never sends, grants outbound authority, or turns an advisory Jev result into
 * certification. Structured facts are locked before the optional single rewrite.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { JEV_ROUTE } from '../invariants/jev-gateway.mjs';
import {
  detectWritingFindings,
  prepareWritingQualityRequest,
  runWritingQualityEvaluation,
  segmentPassages,
  WRITING_QUALITY_SCHEMA,
} from '../invariants/jev-writing-quality.mjs';
import { readWritingSurfacesRegistry } from '../invariants/writing-surfaces.mjs';

export const OPS_REPORT_SCHEMA = 'jovie.agent-ops-report/v1';
export const OPS_REPORT_REVIEW_SCHEMA =
  'jovie.agent-ops-report-delivery-review/v1';
export const UNKNOWN = 'UNKNOWN';
export const NOT_APPLICABLE = 'NOT_APPLICABLE';
export const MAX_EVIDENCE_AGE_MS = 5 * 60 * 1000;
export const PROOF_TIERS = Object.freeze([
  'source',
  'tests',
  'ciQueue',
  'merge',
  'deployment',
  'authenticatedRuntime',
  'recurrence',
]);

const PROOF_STATUSES = new Set(['PROVEN', 'FAILED', UNKNOWN, NOT_APPLICABLE]);
const SOURCE_SHA = /^[a-f0-9]{40}$/u;
const PRODUCTION_CLAIM =
  /\b(?:deployed to production|live in production|production (?:is )?(?:live|healthy)|shipped to production)\b/iu;
const PROTECTED_FACT_CLAIM =
  /\b(?:owner|owned by|root cause|caused by|tests?|testing|tested|receipt|observed|source|ci|queue|merge|deployment|deployed|production|runtime|recurrence|success|successful|progress|healthy|resolved|complete|passed|failed|proven)\b|\b\d{4}-\d{2}-\d{2}\b/iu;

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function exactText(value) {
  return hasText(value) ? value.trim() : UNKNOWN;
}

function exactTimestamp(value) {
  if (!hasText(value)) return UNKNOWN;
  const timestamp = value.trim();
  return Number.isFinite(Date.parse(timestamp)) ? timestamp : UNKNOWN;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value) {
  return sha256(stableJson(value));
}

function opsSurface() {
  const surface = readWritingSurfacesRegistry().surfaces.find(
    entry => entry.id === 'agent-ops-reports'
  );
  if (!surface) throw new Error('agent-ops-reports surface is not registered');
  if (surface.repository !== 'JovieInc/Jovie' || surface.owner !== 'Summer') {
    throw new Error('agent-ops-reports inventory ownership changed');
  }
  return surface;
}

function proofTier(value = {}) {
  const status = PROOF_STATUSES.has(value?.status) ? value.status : UNKNOWN;
  return Object.freeze({
    status,
    observedAt: exactTimestamp(value?.observedAt),
    source: exactText(value?.source),
    receipt: exactText(value?.receipt),
  });
}

function freezeProofTiers(tiers = {}) {
  return Object.freeze(
    Object.fromEntries(PROOF_TIERS.map(tier => [tier, proofTier(tiers[tier])]))
  );
}

function structuredIssues(report, nowMs) {
  const issues = [];
  const observedAt = Date.parse(report.evidence.observedAt);
  if (!Number.isFinite(observedAt)) issues.push('missing-evidence-timestamp');
  else if (observedAt > nowMs + 60_000) issues.push('future-evidence');
  else if (nowMs - observedAt > MAX_EVIDENCE_AGE_MS)
    issues.push('stale-evidence');
  if (report.evidence.source === UNKNOWN)
    issues.push('missing-evidence-source');
  if (
    report.proofTiers.deployment.status === 'PROVEN' &&
    report.proofTiers.merge.status !== 'PROVEN'
  )
    issues.push('deployment-without-merge-proof');
  if (
    report.proofTiers.authenticatedRuntime.status === 'PROVEN' &&
    report.proofTiers.deployment.status !== 'PROVEN'
  )
    issues.push('runtime-without-deployment-proof');
  if (
    PRODUCTION_CLAIM.test(
      [report.observedState, report.blocker, report.rootCause].join('\n')
    ) &&
    report.proofTiers.deployment.status !== 'PROVEN'
  )
    issues.push('unsupported-production-claim');
  return Object.freeze(issues);
}

/** Build the immutable factual input before any prose review. */
export function buildOpsReport(input, { now = Date.now } = {}) {
  const surface = opsSurface();
  if (input?.domain !== 'company') {
    throw new Error('ops reports must stay in the isolated company domain');
  }
  if (input?.destination?.adapter !== 'linear-issue') {
    throw new Error('pilot may only extend the existing Linear issue adapter');
  }
  const report = {
    schema: OPS_REPORT_SCHEMA,
    domain: 'company',
    repository: surface.repository,
    producer: exactText(input.producer),
    surfaceOwner: surface.owner,
    currentOwner: exactText(input.currentOwner),
    observedState: exactText(input.observedState),
    blocker: exactText(input.blocker),
    rootCause: exactText(input.rootCause),
    nextAction: exactText(input.nextAction),
    evidence: Object.freeze({
      observedAt: exactTimestamp(input.evidence?.observedAt),
      source: exactText(input.evidence?.source),
    }),
    sourceSha: SOURCE_SHA.test(input.sourceSha ?? '')
      ? input.sourceSha
      : UNKNOWN,
    proofTiers: freezeProofTiers(input.proofTiers),
    audience: surface.audience,
    destination: Object.freeze({
      adapter: 'linear-issue',
      target: exactText(input.destination?.target),
    }),
    policyVersion: surface.policyVersion,
    reviewMode: 'observation',
  };
  return Object.freeze({
    ...report,
    evidenceFingerprint: fingerprint(report),
    deterministicIssues: structuredIssues(report, now()),
  });
}

function proofLabel(tier) {
  return tier.replace(/[A-Z]/gu, letter => ` ${letter.toLowerCase()}`);
}

/** Approved factual template. Every absent fact stays visibly UNKNOWN. */
export function renderOpsReport(report) {
  const proof = PROOF_TIERS.map(tier => {
    const item = report.proofTiers[tier];
    return `- ${proofLabel(tier)}: ${item.status}; receipt ${item.receipt}`;
  }).join('\n');
  return [
    `Symphony report: ${report.observedState}`,
    `Domain: company (${report.repository})`,
    `Evidence observed: ${report.evidence.observedAt}`,
    `Evidence source: ${report.evidence.source}`,
    `Surface owner: ${report.surfaceOwner}`,
    `Current owner: ${report.currentOwner}`,
    `Blocker: ${report.blocker}`,
    `Root cause: ${report.rootCause}`,
    `Next action: ${report.nextAction}`,
    'Proof tiers:',
    proof,
  ].join('\n');
}

function reviewQueueTemplate(report, reasons) {
  return [
    'Symphony report needs review before the reported state can be trusted.',
    `Domain: company (${report.repository})`,
    `Evidence observed: ${report.evidence.observedAt}`,
    `Evidence source: ${report.evidence.source}`,
    `Surface owner: ${report.surfaceOwner}`,
    `Current owner: ${report.currentOwner}`,
    `Blocker: ${reasons.join(', ') || UNKNOWN}`,
    'Root cause: UNKNOWN',
    `Next action: ${report.nextAction}`,
  ].join('\n');
}

function lockedFacts(report) {
  return [
    `Symphony report: ${report.observedState}`,
    `Domain: company (${report.repository})`,
    `Evidence observed: ${report.evidence.observedAt}`,
    `Evidence source: ${report.evidence.source}`,
    `Surface owner: ${report.surfaceOwner}`,
    `Current owner: ${report.currentOwner}`,
    `Blocker: ${report.blocker}`,
    `Root cause: ${report.rootCause}`,
    `Next action: ${report.nextAction}`,
    ...PROOF_TIERS.map(tier => {
      const item = report.proofTiers[tier];
      return `- ${proofLabel(tier)}: ${item.status}; receipt ${item.receipt}`;
    }),
  ];
}

export function factualFidelityIssues(candidate, report) {
  if (!hasText(candidate)) return Object.freeze(['empty-candidate']);
  const facts = lockedFacts(report);
  const issues = facts
    .filter(fact => !candidate.includes(fact))
    .map(fact => `changed-fact:${fact.slice(0, 80)}`);
  let additions = candidate.replace('Proof tiers:', '');
  for (const fact of facts) additions = additions.replace(fact, '');
  if (PROTECTED_FACT_CLAIM.test(additions))
    issues.push('new-protected-fact-claim');
  return Object.freeze(issues);
}

function evaluationInput(report, candidate, priorDraft) {
  const evidence = [
    `Observed at ${report.evidence.observedAt} via ${report.evidence.source}.`,
    `Owner ${report.currentOwner}; blocker ${report.blocker}; root cause ${report.rootCause}; next ${report.nextAction}.`,
    ...PROOF_TIERS.map(
      tier => `${tier}: ${stableJson(report.proofTiers[tier])}`
    ),
  ];
  return {
    sourceSha: report.sourceSha,
    artifactSha256: sha256(candidate),
    scope: 'JOV-6477 Summer/Symphony ops report observation pilot',
    contract: {
      surfaceId: 'agent-ops-reports',
      exactCandidate: candidate,
      intendedJob:
        'Tell the founder or operator the observed state and next useful action without inventing progress or certainty.',
      allowedClaims: lockedFacts(report),
      evidence,
      approvedVoiceExamples: [
        'State what happened, why it matters, the exact need, and the receipt.',
      ],
      ...(hasText(priorDraft) ? { priorDraft } : {}),
    },
  };
}

function deterministicFindings(report, candidate) {
  const contract = evaluationInput(report, candidate).contract;
  return detectWritingFindings(segmentPassages(candidate), contract).findings;
}

function currentSemanticReview(receipt, input, nowMs) {
  return (
    receipt?.schema === WRITING_QUALITY_SCHEMA &&
    receipt?.status === 'evaluated' &&
    receipt.requestFingerprint ===
      prepareWritingQualityRequest(input).fingerprint &&
    Array.isArray(receipt.findings) &&
    Array.isArray(receipt.unreviewed) &&
    receipt.resolvedModel === JEV_ROUTE.model &&
    Number.isFinite(receipt.completedAt) &&
    receipt.completedAt <= nowMs &&
    nowMs - receipt.completedAt <= MAX_EVIDENCE_AGE_MS
  );
}

function deliveryReview(report, message, detail) {
  const bindings = Object.freeze({
    messageSha256: sha256(message),
    audience: report.audience,
    destination: report.destination,
    evidenceFingerprint: report.evidenceFingerprint,
    policyVersion: report.policyVersion,
    resolvedModel: detail.resolvedModel,
  });
  return Object.freeze({
    schema: OPS_REPORT_REVIEW_SCHEMA,
    mode: 'observation',
    outcome: detail.outcome,
    reviewStatus: detail.reviewStatus,
    revisionCount: detail.revisionCount,
    requestFingerprint: detail.requestFingerprint ?? null,
    reviewedAt: detail.reviewedAt,
    bindings,
    reviewDigest: fingerprint(bindings),
  });
}

function prepared(report, message, detail) {
  if (detail.outcome === 'approved-template')
    message = `Writing review: unreviewed; approved factual template.\n\n${message}`;
  const review = deliveryReview(report, message, detail);
  return Object.freeze({
    report,
    message,
    audience: report.audience,
    destination: report.destination,
    decision: detail.outcome,
    review,
    idempotencyKey: `${report.destination.target}:${review.reviewDigest}`,
  });
}

function deterministicPrepared(report, message, outcome, status, nowMs) {
  return prepared(report, message, {
    outcome,
    reviewStatus: status,
    revisionCount: 0,
    resolvedModel: NOT_APPLICABLE,
    reviewedAt: new Date(nowMs).toISOString(),
  });
}

/**
 * Deterministic checks run before Jev. One targeted rewrite may occur, followed
 * by a second exact-artifact review and deterministic factual-fidelity check.
 *
 * @param {Record<string, any>} input
 * @param {{
 *   now?: () => number,
 *   review?: (input: any, options?: Record<string, any>) => Promise<any>,
 *   reviewOptions?: (input: any) => Record<string, any>,
 *   revise?: (input: {
 *     candidate: string,
 *     findings: any[],
 *     unreviewed: any[],
 *     lockedFacts: Record<string, any>
 *   }) => Promise<string>
 * }} [options]
 */
export async function prepareOpsReportDelivery(
  input,
  {
    now = Date.now,
    review = runWritingQualityEvaluation,
    reviewOptions = () => ({}),
    revise,
  } = {}
) {
  const nowMs = now();
  const report = buildOpsReport(input, { now: () => nowMs });
  const template = renderOpsReport(report);
  const blocking = report.deterministicIssues.filter(issue =>
    [
      'missing-evidence-timestamp',
      'missing-evidence-source',
      'stale-evidence',
      'future-evidence',
      'deployment-without-merge-proof',
      'runtime-without-deployment-proof',
      'unsupported-production-claim',
    ].includes(issue)
  );
  if (blocking.length) {
    return deterministicPrepared(
      report,
      reviewQueueTemplate(report, blocking),
      'review-queue',
      'deterministic-rejection',
      nowMs
    );
  }

  const deterministic = deterministicFindings(report, template);
  if (deterministic.some(finding => finding.severity === 'block')) {
    return deterministicPrepared(
      report,
      reviewQueueTemplate(report, ['deterministic-copy-block']),
      'review-queue',
      'deterministic-rejection',
      nowMs
    );
  }

  if (report.sourceSha === UNKNOWN) {
    return deterministicPrepared(
      report,
      template,
      'approved-template',
      'missing-source-receipt',
      nowMs
    );
  }

  let candidate = template;
  let candidateInput = evaluationInput(report, candidate);
  let receipt = await review(candidateInput, reviewOptions(candidateInput));
  let revisionCount = 0;
  if (
    currentSemanticReview(receipt, candidateInput, now()) &&
    receipt.findings.length &&
    !receipt.unreviewed.length &&
    typeof revise === 'function'
  ) {
    revisionCount = 1;
    const revised = await revise({
      candidate,
      findings: receipt.findings ?? [],
      unreviewed: receipt.unreviewed ?? [],
      lockedFacts: lockedFacts(report),
    });
    const fidelity = factualFidelityIssues(revised, report);
    const revisedDeterministic = hasText(revised)
      ? deterministicFindings(report, revised)
      : [{ severity: 'block' }];
    if (
      fidelity.length === 0 &&
      !revisedDeterministic.some(finding => finding.severity === 'block') &&
      !PRODUCTION_CLAIM.test(revised)
    ) {
      candidate = revised;
      candidateInput = evaluationInput(report, candidate, template);
      receipt = await review(candidateInput, reviewOptions(candidateInput));
    } else {
      receipt = { status: 'revision-fidelity-failed' };
    }
  }

  if (
    !currentSemanticReview(receipt, candidateInput, now()) ||
    receipt.findings.length ||
    receipt.unreviewed.length
  ) {
    return prepared(report, template, {
      outcome: 'approved-template',
      reviewStatus:
        receipt?.status === 'evaluated'
          ? 'unreviewed'
          : (receipt?.status ?? 'missing-review'),
      revisionCount,
      resolvedModel: NOT_APPLICABLE,
      reviewedAt: new Date(now()).toISOString(),
      requestFingerprint: receipt?.requestFingerprint,
    });
  }
  return prepared(report, candidate, {
    outcome: 'observed',
    reviewStatus: receipt.status,
    revisionCount,
    resolvedModel: receipt.resolvedModel,
    reviewedAt: new Date(receipt.completedAt).toISOString(),
    requestFingerprint: receipt.requestFingerprint,
  });
}

/** Exact message/destination/evidence/policy/model must still match at send time. */
export function verifyOpsReportDelivery(preparedReport, currentInput, options) {
  const nowMs = (options?.now ?? Date.now)();
  const current = buildOpsReport(currentInput, options);
  const review = preparedReport?.review;
  const expected = review?.bindings;
  const reviewedAt = Date.parse(review?.reviewedAt);
  if (
    review?.schema !== OPS_REPORT_REVIEW_SCHEMA ||
    review.mode !== 'observation' ||
    !expected ||
    review.outcome !== preparedReport.decision ||
    !['observed', 'approved-template', 'review-queue'].includes(
      review.outcome
    ) ||
    typeof review.reviewedAt !== 'string' ||
    !Number.isFinite(reviewedAt) ||
    reviewedAt > nowMs ||
    nowMs - reviewedAt > MAX_EVIDENCE_AGE_MS ||
    (review.outcome !== 'review-queue' &&
      current.deterministicIssues.length > 0) ||
    (review.outcome === 'observed'
      ? expected.resolvedModel !== JEV_ROUTE.model ||
        review.reviewStatus !== 'evaluated'
      : expected.resolvedModel !== NOT_APPLICABLE) ||
    preparedReport.audience !== current.audience ||
    fingerprint(preparedReport.destination) !== fingerprint(current.destination)
  )
    throw new Error('ops report review invalidated before delivery');
  const actual = {
    messageSha256: sha256(preparedReport.message),
    audience: current.audience,
    destination: current.destination,
    evidenceFingerprint: current.evidenceFingerprint,
    policyVersion: current.policyVersion,
    resolvedModel:
      review.outcome === 'observed' ? JEV_ROUTE.model : NOT_APPLICABLE,
  };
  if (
    fingerprint(actual) !== review.reviewDigest ||
    fingerprint(expected) !== review.reviewDigest
  ) {
    throw new Error('ops report review invalidated before delivery');
  }
  return true;
}

/** Testable send seam; production keeps using the existing Linear adapter. */
export async function deliverOpsReport(
  preparedReport,
  currentInput,
  { send, dedupe = new Set(), now = Date.now, signal = undefined }
) {
  signal?.throwIfAborted();
  verifyOpsReportDelivery(preparedReport, currentInput, { now });
  if (dedupe.has(preparedReport.idempotencyKey)) {
    return Object.freeze({ outcome: 'suppressed-duplicate' });
  }
  if (typeof send !== 'function')
    throw new Error('existing send adapter required');
  await send(preparedReport.message, preparedReport.destination);
  dedupe.add(preparedReport.idempotencyKey);
  return Object.freeze({ outcome: 'sent-to-existing-adapter' });
}

async function main() {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  if (process.argv[2] === '--verify') {
    verifyOpsReportDelivery(input.preparedReport, input.currentInput);
    process.stdout.write('{"verified":true}\n');
    return;
  }
  const result = await prepareOpsReportDelivery(input);
  verifyOpsReportDelivery(result, input);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  main().catch(error => {
    process.stderr.write(`ops-report: ${error.message}\n`);
    process.exitCode = 1;
  });
}
