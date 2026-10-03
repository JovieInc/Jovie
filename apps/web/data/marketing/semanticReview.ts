import 'server-only';

import {
  prepareJevRequest,
  runJevEvaluation,
} from '../../../../scripts/invariants/jev-gateway.mjs';
import { deterministicIssue } from './semanticReviewDeterministic';
import {
  marketingSemanticEvidenceFingerprint,
  type NormalizedMarketingSemanticReview,
  policyPreflight,
  stableSerialize,
} from './semanticReviewPolicy';
import {
  MARKETING_SEMANTIC_CHECKS,
  MARKETING_SEMANTIC_JEV_ROUTE,
  MARKETING_SEMANTIC_REVIEW_SCHEMA,
  MARKETING_SEMANTIC_VERDICTS,
  type MarketingSemanticCheck,
  type MarketingSemanticFinding,
  type MarketingSemanticReasonCode,
  type MarketingSemanticReviewInput,
  type MarketingSemanticReviewOptions,
  type MarketingSemanticReviewResult,
  type MarketingSemanticStage,
  type MarketingSemanticVerdict,
  type PreparedMarketingSemanticRequest,
} from './semanticReviewTypes';

export * from './semanticReviewTypes';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function checkOf(value: unknown): MarketingSemanticCheck | null {
  return typeof value === 'string' &&
    (MARKETING_SEMANTIC_CHECKS as readonly string[]).includes(value)
    ? (value as MarketingSemanticCheck)
    : null;
}

function stageForCheck(check: MarketingSemanticCheck): MarketingSemanticStage {
  if (check === 'claim-support') return 'marketing-claim-support';
  if (check === 'section-overlap') return 'marketing-section-overlap';
  return 'marketing-cta-expectation';
}

function verdictOf(value: unknown): MarketingSemanticVerdict | null {
  return typeof value === 'string' &&
    (MARKETING_SEMANTIC_VERDICTS as readonly string[]).includes(value)
    ? (value as MarketingSemanticVerdict)
    : null;
}

function finding(
  code: string,
  message: string,
  evidenceIds: readonly string[] = []
): MarketingSemanticFinding {
  return Object.freeze({
    code,
    message,
    evidenceIds: Object.freeze([...evidenceIds]),
  });
}

function baseResult(
  raw: unknown
): Omit<
  MarketingSemanticReviewResult,
  | 'status'
  | 'verdict'
  | 'abstained'
  | 'reasonCode'
  | 'reason'
  | 'findings'
  | 'evidenceFingerprint'
  | 'requestFingerprint'
  | 'transportStatus'
  | 'model'
  | 'modelIdentityBasis'
  | 'resolvedModel'
> {
  const value = isRecord(raw) ? raw : {};
  const check = checkOf(value.check);
  return {
    schema: MARKETING_SEMANTIC_REVIEW_SCHEMA,
    check,
    stage: check ? stageForCheck(check) : null,
    route: text(value.route) || null,
    pageId: text(value.pageId) || null,
    scope: text(value.scope) || null,
    sourceSha: text(value.sourceSha) || null,
    artifactSha256: text(value.artifactSha256) || null,
    advisory: true,
    blocking: false,
    certified: false,
    humanCertified: false,
  };
}

type ResultDetail = {
  readonly status: 'evaluated' | 'abstained';
  readonly verdict: MarketingSemanticVerdict;
  readonly reasonCode: MarketingSemanticReasonCode | null;
  readonly reason: string;
  readonly findings?: readonly MarketingSemanticFinding[];
  readonly evidenceFingerprint?: string | null;
  readonly requestFingerprint?: string | null;
  readonly transportStatus?: string | null;
  readonly model?: string | null;
  readonly modelIdentityBasis?: string | null;
  readonly resolvedModel?: string | null;
};

function result(
  raw: unknown,
  detail: ResultDetail
): MarketingSemanticReviewResult {
  return Object.freeze({
    ...baseResult(raw),
    ...detail,
    abstained: detail.status === 'abstained',
    findings: Object.freeze([...(detail.findings ?? [])]),
    evidenceFingerprint: detail.evidenceFingerprint ?? null,
    requestFingerprint: detail.requestFingerprint ?? null,
    transportStatus: detail.transportStatus ?? null,
    model: detail.model ?? null,
    modelIdentityBasis: detail.modelIdentityBasis ?? null,
    resolvedModel: detail.resolvedModel ?? null,
  });
}

function abstain(
  raw: unknown,
  reasonCode: MarketingSemanticReasonCode,
  reason: string,
  detail: Partial<
    Pick<
      MarketingSemanticReviewResult,
      | 'verdict'
      | 'findings'
      | 'evidenceFingerprint'
      | 'requestFingerprint'
      | 'transportStatus'
      | 'model'
    >
  > = {}
): MarketingSemanticReviewResult {
  return result(raw, {
    status: 'abstained',
    verdict: detail.verdict ?? 'insufficient',
    reasonCode,
    reason,
    ...detail,
  });
}

function stateFor(normalized: NormalizedMarketingSemanticReview): string {
  const context = {
    route: normalized.input.route,
    pageId: normalized.input.pageId,
    audience: normalized.input.audience,
    objective: normalized.input.objective,
    check: normalized.check,
  };
  return `Context: ${stableSerialize(context)}\nEvidence: ${stableSerialize(normalized.payload)}`;
}

export function prepareMarketingSemanticRequest(
  input: unknown
): PreparedMarketingSemanticRequest | null {
  const checked = policyPreflight(input);
  if ('failure' in checked || deterministicIssue(checked.normalized))
    return null;
  const normalized = checked.normalized;
  try {
    const request = prepareJevRequest({
      sourceSha: normalized.input.sourceSha,
      artifactSha256: normalized.input.artifactSha256,
      scope: normalized.scope,
      stage: normalized.stage,
      modality: 'text',
      state: stateFor(normalized),
    });
    return Object.freeze({
      sourceSha: request.sourceSha,
      artifactSha256: request.artifactSha256,
      scope: request.scope,
      stage: request.stage,
      modality: 'text',
      state: request.state,
      fingerprint: request.fingerprint,
    });
  } catch {
    return null;
  }
}

async function defaultEvaluate(
  request: PreparedMarketingSemanticRequest,
  gateway: MarketingSemanticReviewOptions['gateway']
): Promise<unknown> {
  if (!gateway?.readCurrentFingerprint) return { status: 'not-admitted' };
  return runJevEvaluation(
    {
      sourceSha: request.sourceSha,
      artifactSha256: request.artifactSha256,
      scope: request.scope,
      stage: request.stage,
      modality: request.modality,
      state: request.state,
    },
    {
      approval: gateway.approval,
      readCurrentFingerprint: gateway.readCurrentFingerprint,
      apiKey: gateway.apiKey,
      signal: gateway.signal,
      previous: gateway.previous,
      now: gateway.now,
      timeoutMs: gateway.timeoutMs,
      transport: gateway.transport,
    }
  );
}

function modelResult(
  raw: unknown,
  input: MarketingSemanticReviewInput,
  prepared: PreparedMarketingSemanticRequest,
  evidenceFingerprint: string
): MarketingSemanticReviewResult {
  const value = isRecord(raw) ? raw : {};
  const status = text(value.status);
  if (status !== 'evaluated') {
    const reasonCode: MarketingSemanticReasonCode =
      status === 'stale'
        ? 'stale-evidence'
        : status === 'unchanged'
          ? 'unchanged-evidence'
          : status === 'invalid-response'
            ? 'invalid-response'
            : 'reviewer-unavailable';
    const reason =
      reasonCode === 'stale-evidence'
        ? 'The evidence changed during review.'
        : reasonCode === 'unchanged-evidence'
          ? 'The same evidence was already evaluated.'
          : reasonCode === 'invalid-response'
            ? 'The reviewer response was invalid.'
            : 'The reviewer was unavailable.';
    return abstain(input, reasonCode, reason, {
      evidenceFingerprint,
      requestFingerprint:
        typeof value.requestFingerprint === 'string'
          ? value.requestFingerprint
          : null,
      transportStatus: status || null,
    });
  }
  if (
    typeof value.requestFingerprint !== 'string' ||
    value.requestFingerprint !== prepared.fingerprint
  ) {
    return abstain(
      input,
      'stale-evidence',
      'The reviewer response was not bound to the exact request.',
      {
        evidenceFingerprint,
        requestFingerprint:
          typeof value.requestFingerprint === 'string'
            ? value.requestFingerprint
            : null,
        transportStatus: status,
      }
    );
  }
  const verdict = verdictOf(value.alignment);
  if (!verdict)
    return abstain(
      input,
      'invalid-response',
      'The reviewer response did not contain a supported verdict.',
      {
        evidenceFingerprint,
        requestFingerprint: prepared.fingerprint,
        transportStatus: status,
      }
    );
  const findings: MarketingSemanticFinding[] = [];
  if (value.certified === true)
    findings.push(
      finding(
        'model-certification-discarded',
        'Model certification claims are ignored at this advisory boundary.'
      )
    );
  return result(input, {
    status: 'evaluated',
    verdict,
    reasonCode: null,
    reason: 'The exact curated text evidence was evaluated by Jev.',
    findings,
    evidenceFingerprint,
    requestFingerprint: prepared.fingerprint,
    transportStatus: status,
    model: MARKETING_SEMANTIC_JEV_ROUTE.model,
    modelIdentityBasis:
      typeof value.modelIdentityBasis === 'string'
        ? value.modelIdentityBasis
        : null,
    resolvedModel:
      typeof value.resolvedModel === 'string' ? value.resolvedModel : null,
  });
}

export async function reviewMarketingSemantics(
  input: unknown,
  options: MarketingSemanticReviewOptions = {}
): Promise<MarketingSemanticReviewResult> {
  const checked = policyPreflight(input);
  if ('failure' in checked) {
    return abstain(input, checked.failure.reasonCode, checked.failure.reason, {
      evidenceFingerprint: checked.failure.evidenceFingerprint,
    });
  }
  const normalized = checked.normalized;
  const issue = deterministicIssue(normalized);
  if (issue) {
    return abstain(input, issue.reasonCode, issue.reason, {
      verdict: issue.verdict,
      evidenceFingerprint: normalized.evidenceFingerprint,
      findings: [
        finding(issue.findingCode, issue.findingMessage, issue.evidenceIds),
      ],
    });
  }
  const prepared = prepareMarketingSemanticRequest(input);
  if (!prepared)
    return abstain(
      input,
      'malformed-input',
      'The semantic review request could not be prepared.',
      { evidenceFingerprint: normalized.evidenceFingerprint }
    );
  try {
    const raw = options.evaluate
      ? await options.evaluate(prepared)
      : await defaultEvaluate(prepared, options.gateway);
    return modelResult(
      raw,
      normalized.input,
      prepared,
      normalized.evidenceFingerprint
    );
  } catch {
    return abstain(
      input,
      'reviewer-unavailable',
      'The reviewer was unavailable.',
      {
        evidenceFingerprint: normalized.evidenceFingerprint,
        transportStatus: 'provider-error',
      }
    );
  }
}

export const reviewMarketingClaimSupport = reviewMarketingSemantics;
export const reviewMarketingSectionOverlap = reviewMarketingSemantics;
export const reviewMarketingCtaExpectation = reviewMarketingSemantics;

export { marketingSemanticEvidenceFingerprint };
