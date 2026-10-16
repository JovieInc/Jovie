/** Portable advisory evidence, never certification, human approval or send authority. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { JEV_ROUTE } from './jev-gateway.mjs';
import { evidenceFingerprint } from './jev-shadow.mjs';
import {
  WRITING_QUALITY_CALIBRATION,
  WRITING_QUALITY_RUBRIC_VERSION,
  WRITING_QUALITY_RUBRICS,
} from './jev-writing-quality.mjs';

export const WRITING_RECEIPT_SCHEMA = 'jev-writing-pilot-receipt/v1';
export const writingTextDigest = text =>
  createHash('sha256').update(text, 'utf8').digest('hex');
const implementationFiles = [
  '../../packages/copy/lint.ts',
  '../../packages/copy/rules.ts',
  './jev-gateway.mjs',
  './jev-shadow.mjs',
  './jev-writing-controller.mjs',
  './jev-writing-quality.mjs',
  './jev-writing-receipt.mjs',
  './run-outcome.mjs',
  './writing-surfaces-registry.json',
  './writing-surfaces.mjs',
];
const implementations = () =>
  Object.fromEntries(
    implementationFiles.map(path => [
      path,
      createHash('sha256')
        .update(readFileSync(new URL(path, import.meta.url)))
        .digest('hex'),
    ])
  );
const loadedImplementations = implementations();
export const writingImplementationCurrent = () =>
  evidenceFingerprint(loadedImplementations) ===
  evidenceFingerprint(implementations());
const id = value =>
  typeof value === 'string' && /^[\w.:/-]{1,200}$/.test(value) ? value : null;
const number = value => (Number.isFinite(value) && value >= 0 ? value : null);
const reasons = new Set([
  'budget-failure',
  'cancelled',
  'failed-fidelity',
  'factual-failure',
  'invalid-review',
  'leakage-failure',
  'missing-evidence',
  'privacy-failure',
  'revision-exhausted',
  'safety-failure',
  'stale-input',
  'timeout',
  'writer-failure',
]);
export const writingFailureReason = value =>
  reasons.has(value) ? value : 'invalid-review';
const findings = values =>
  (values ?? []).map(value =>
    Object.fromEntries([
      ...['passageId', 'axis', 'category', 'severity', 'rule', 'source'].map(
        key => [key, id(value[key])]
      ),
      ['confidence', number(value.confidence)],
    ])
  );
function freeze(value) {
  for (const child of Object.values(value))
    if (child && typeof child === 'object') freeze(child);
  return Object.freeze(value);
}

/** Raw context is fingerprinted locally; only digests and opaque voice refs travel. */
export function writingReceiptBinding(input) {
  if (
    !id(input.candidateId) ||
    !/^[a-f0-9]{40}$/.test(input.sourceSha) ||
    !id(input.writerModelId) ||
    !/^[a-f0-9]{64}$/.test(input.writerImplementationSha256) ||
    !Array.isArray(input.voiceReferences) ||
    !input.voiceReferences.length ||
    !input.voiceReferences.every(
      ref => id(ref.id) && id(ref.version) && /^[a-f0-9]{64}$/.test(ref.sha256)
    )
  )
    throw new Error(
      'exact candidate, writer implementation and voice references required'
    );
  return {
    candidateId: input.candidateId,
    sourceSha: input.sourceSha,
    inputDigest: evidenceFingerprint(input),
    evidenceDigest: evidenceFingerprint(input.contract.evidence),
    briefDigest: evidenceFingerprint(input.contract),
    voice: {
      references: input.voiceReferences.map(ref => ({
        id: ref.id,
        version: ref.version,
        sha256: ref.sha256,
      })),
      examplesDigest: evidenceFingerprint(input.contract.approvedVoiceExamples),
    },
    writer: {
      modelId: input.writerModelId,
      implementationSha256: input.writerImplementationSha256,
    },
    evaluatorRoute: JEV_ROUTE,
    rubric: {
      version: WRITING_QUALITY_RUBRIC_VERSION,
      digest: evidenceFingerprint(WRITING_QUALITY_RUBRICS),
    },
    calibration: {
      version: WRITING_QUALITY_CALIBRATION.version,
      digest: evidenceFingerprint(WRITING_QUALITY_CALIBRATION),
    },
    implementations: loadedImplementations,
  };
}

/** Project only documented telemetry; SDK echo/metadata do not prove backend identity. */
export function writingCallObservation(stage, result, startedAt, completedAt) {
  return {
    stage,
    startedAt,
    completedAt,
    status: id(result?.status),
    textSha256:
      typeof result?.text === 'string' ? writingTextDigest(result.text) : null,
    requestFingerprint: id(result?.requestFingerprint),
    selectedModel: id(result?.modelId ?? result?.route?.model),
    modelIdentityBasis:
      stage === 'evaluate'
        ? 'gateway-route-and-reported-metadata'
        : 'caller-reported',
    backendIdentityProven: false,
    resolvedModel: id(result?.resolvedModel),
    resolvedProvider: id(result?.resolvedProvider),
    inputTokens: number(result?.inputTokens ?? result?.usage?.inputTokens),
    outputTokens: number(result?.outputTokens ?? result?.usage?.outputTokens),
    billedCostUsd: number(
      stage === 'evaluate' ? result?.billedCostUsd : result?.costUsd
    ),
    modelCostUsd: number(result?.modelCostUsd),
    surchargeCostUsd: number(result?.surchargeCostUsd),
    costBasis: stage === 'evaluate' ? 'gateway-reported' : 'caller-reported',
    responseId: id(result?.responseId),
    generationId: id(result?.generationId),
  };
}

function seal(body) {
  return freeze({
    ...structuredClone(body),
    receiptDigest: evidenceFingerprint(body),
  });
}

/** Called only after the controller's final freshness check; never formats text. */
export function createWritingPilotReceipt(input, outcome, trace) {
  return seal({
    schema: WRITING_RECEIPT_SCHEMA,
    advisory: true,
    certified: false,
    humanApproved: false,
    sendingAuthority: false,
    binding: trace.binding,
    artifacts: {
      originalTextSha256:
        trace.originalText === null
          ? null
          : writingTextDigest(trace.originalText),
      finalTextSha256:
        outcome.status === 'reviewed' ? writingTextDigest(outcome.text) : null,
    },
    outcome: {
      status: outcome.status,
      reviewStatus:
        outcome.status === 'reviewed' ? 'reviewed' : 'review-needed',
      fallbackReason: outcome.reason
        ? writingFailureReason(outcome.reason)
        : null,
      revisionCount: outcome.revisionCount,
      writerCalls: outcome.writerCalls,
      evaluationRounds: outcome.evaluationRounds,
      reservedUsd: outcome.reservedUsd,
    },
    initialFindings: findings(trace.initialFindings),
    terminalChecks: trace.checks.map(check => ({
      textSha256: check.textSha256,
      status: id(check.status),
      findings: findings(check.findings),
      unreviewed: (check.unreviewed ?? []).map(value => ({
        axis: id(value.axis),
        reason: id(value.reason),
      })),
    })),
    timing: { startedAt: trace.startedAt, completedAt: trace.completedAt },
    calls: trace.calls,
    template: null,
  });
}

/** Fail closed for stale context, byte edits, copied candidates and altered receipts.
 * This verifies evidence integrity, not authenticity or authority. Current input
 * and bytes must come from the artifact store, not from the receipt being checked.
 * A true result includes review-needed/template outcomes; check reviewStatus separately.
 */
export function verifyWritingPilotReceipt(receipt, current) {
  try {
    const { receiptDigest, ...body } = receipt;
    return (
      writingImplementationCurrent() &&
      receipt.schema === WRITING_RECEIPT_SCHEMA &&
      receipt.advisory === true &&
      receipt.certified === false &&
      receipt.humanApproved === false &&
      receipt.sendingAuthority === false &&
      receiptDigest === evidenceFingerprint(body) &&
      evidenceFingerprint(receipt.binding) ===
        evidenceFingerprint(writingReceiptBinding(current.input)) &&
      receipt.artifacts.originalTextSha256 ===
        (current.originalText === null
          ? null
          : writingTextDigest(current.originalText)) &&
      receipt.artifacts.finalTextSha256 ===
        (current.finalText === null
          ? null
          : writingTextDigest(current.finalText)) &&
      evidenceFingerprint(receipt.template) ===
        evidenceFingerprint(current.template ?? null)
    );
  } catch {
    return false;
  }
}

/** Bind an externally approved template version AFTER rendering/sanitization.
 * This records selection; it supplies neither template approval nor model review.
 */
export function bindApprovedWritingTemplate(receipt, current, template) {
  if (
    !verifyWritingPilotReceipt(receipt, current) ||
    !id(template?.id) ||
    !id(template?.version) ||
    typeof template?.renderedText !== 'string' ||
    !template.renderedText.trim()
  )
    throw new Error('current receipt and exact rendered template required');
  const { receiptDigest: _digest, ...body } = receipt;
  const textSha256 = writingTextDigest(template.renderedText);
  return {
    text: template.renderedText,
    receipt: seal({
      ...body,
      artifacts: { ...body.artifacts, finalTextSha256: textSha256 },
      outcome: {
        ...body.outcome,
        status: 'approved-template',
        reviewStatus: 'not-reviewed',
        fallbackReason: body.outcome.fallbackReason ?? 'template-selected',
      },
      template: {
        id: template.id,
        version: template.version,
        renderedTextSha256: textSha256,
      },
    }),
  };
}
