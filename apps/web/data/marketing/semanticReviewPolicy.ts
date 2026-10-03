import { createHash } from 'node:crypto';

import {
  MARKETING_SEMANTIC_CHECKS,
  type MarketingClaimSupportReview,
  type MarketingCtaExpectationReview,
  type MarketingSemanticCheck,
  type MarketingSemanticEvidenceItem,
  type MarketingSemanticReasonCode,
  type MarketingSemanticReviewInput,
  type MarketingSemanticSection,
  type MarketingSemanticStage,
} from './semanticReviewTypes';

export type SemanticRecord = Record<string, unknown>;

export type NormalizedMarketingSemanticReview = {
  readonly input: MarketingSemanticReviewInput;
  readonly check: MarketingSemanticCheck;
  readonly stage: MarketingSemanticStage;
  readonly scope: string;
  readonly payload: SemanticRecord;
  readonly evidenceFingerprint: string;
};

export type SemanticPolicyFailure = {
  readonly reasonCode: MarketingSemanticReasonCode;
  readonly reason: string;
  readonly evidenceFingerprint?: string;
};

const SOURCE_SHA = /^[a-f0-9]{40}$/;
const ARTIFACT_SHA = /^[a-f0-9]{64}$/;
const FINGERPRINT = /^sha256:[a-f0-9]{64}$/;
const MAX_ITEMS = 32;
const ADVERSARIAL =
  /ignore\s+(?:all|any|the|these|previous|prior)\s+instructions?|(?:system|developer)\s+(?:message|prompt)|act\s+as\s+(?:the\s+)?(?:reviewer|judge)|(?:mark|label)\s+(?:this|the)\s+(?:page|claim|cta|section)?\s*(?:as\s+)?(?:pass|supported|green|approved)|reveal\s+(?:the\s+)?(?:system|developer)\s+prompt/i;
const SENSITIVE =
  /(?:Bearer\s+\S+|-----BEGIN\s+[\w ]*PRIVATE KEY|\b(?:sk|ghp|gho)_[\w-]{12,}|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b|data:image\/)/i;

function isRecord(value: unknown): value is SemanticRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function stableSerialize(
  value: unknown,
  seen: WeakSet<object> = new WeakSet()
): string {
  if (Array.isArray(value)) {
    if (seen.has(value)) return '"[Circular]"';
    seen.add(value);
    const output = `[${value.map(item => stableSerialize(item, seen)).join(',')}]`;
    seen.delete(value);
    return output;
  }
  if (isRecord(value)) {
    if (seen.has(value)) return '"[Circular]"';
    seen.add(value);
    const output = `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item, seen)}`
      )
      .join(',')}}`;
    seen.delete(value);
    return output;
  }
  return JSON.stringify(value) ?? 'null';
}

export function semanticFingerprint(value: unknown): string {
  return `sha256:${createHash('sha256')
    .update(stableSerialize(value))
    .digest('hex')}`;
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

function commonInput(value: SemanticRecord): value is SemanticRecord & {
  check: MarketingSemanticCheck;
  route: string;
  pageId: string;
  audience: string;
  objective: string;
  sourceSha: string;
  artifactSha256: string;
} {
  const check = checkOf(value.check);
  return (
    check !== null &&
    Boolean(text(value.route)) &&
    Boolean(text(value.pageId)) &&
    Boolean(text(value.audience)) &&
    Boolean(text(value.objective)) &&
    typeof value.sourceSha === 'string' &&
    SOURCE_SHA.test(value.sourceSha) &&
    typeof value.artifactSha256 === 'string' &&
    ARTIFACT_SHA.test(value.artifactSha256)
  );
}

function uniqueIds(items: readonly SemanticRecord[]): boolean {
  const ids = items.map(item => text(item.id));
  return ids.every(Boolean) && new Set(ids).size === ids.length;
}

function claimPayload(value: SemanticRecord): {
  readonly claim: MarketingClaimSupportReview['claim'];
  readonly supportingEvidence: readonly MarketingSemanticEvidenceItem[];
} | null {
  if (!isRecord(value.claim)) return null;
  const claim = value.claim;
  if (!text(claim.id) || !text(claim.statement)) return null;
  if (
    claim.renderedText !== undefined &&
    typeof claim.renderedText !== 'string'
  )
    return null;
  if (
    claim.digest !== undefined &&
    (typeof claim.digest !== 'string' || !FINGERPRINT.test(claim.digest))
  )
    return null;
  if (!Array.isArray(value.supportingEvidence)) return null;
  if (
    value.supportingEvidence.length === 0 ||
    value.supportingEvidence.length > MAX_ITEMS
  )
    return null;
  const evidence = value.supportingEvidence.filter(isRecord);
  if (
    evidence.length !== value.supportingEvidence.length ||
    !uniqueIds(evidence)
  )
    return null;
  if (!evidence.every(item => text(item.statement))) return null;
  if (
    !evidence.every(
      item =>
        item.digest === undefined ||
        (typeof item.digest === 'string' && FINGERPRINT.test(item.digest))
    )
  )
    return null;
  return {
    claim: {
      id: text(claim.id),
      statement: text(claim.statement),
      ...(claim.renderedText === undefined
        ? {}
        : { renderedText: claim.renderedText }),
      ...(claim.digest === undefined ? {} : { digest: claim.digest }),
    },
    supportingEvidence: evidence.map(item => {
      const digest = typeof item.digest === 'string' ? item.digest : undefined;
      return {
        id: text(item.id),
        statement: text(item.statement),
        ...(digest === undefined ? {} : { digest }),
      };
    }),
  };
}

function sectionPayload(
  value: SemanticRecord
): readonly MarketingSemanticSection[] | null {
  if (!Array.isArray(value.sections)) return null;
  if (value.sections.length < 2 || value.sections.length > MAX_ITEMS)
    return null;
  const sections = value.sections.filter(isRecord);
  if (sections.length !== value.sections.length || !uniqueIds(sections))
    return null;
  const normalized: MarketingSemanticSection[] = [];
  for (const item of sections) {
    const evidenceRefs = item.evidenceRefs;
    const mustNotRepeat = item.mustNotRepeat;
    if (
      !text(item.question) ||
      !text(item.responsibility) ||
      !text(item.customerBelief) ||
      !Array.isArray(evidenceRefs) ||
      evidenceRefs.length === 0 ||
      !evidenceRefs.every(ref => typeof ref === 'string' && text(ref)) ||
      (item.newInformation !== undefined &&
        typeof item.newInformation !== 'string') ||
      (item.renderedText !== undefined &&
        typeof item.renderedText !== 'string') ||
      (mustNotRepeat !== undefined &&
        (!Array.isArray(mustNotRepeat) ||
          !mustNotRepeat.every(ref => typeof ref === 'string' && text(ref))))
    )
      return null;
    normalized.push({
      id: text(item.id),
      question: text(item.question),
      responsibility: text(item.responsibility),
      customerBelief: text(item.customerBelief),
      evidenceRefs: evidenceRefs.map(ref => text(ref)),
      ...(item.newInformation === undefined
        ? {}
        : { newInformation: text(item.newInformation) }),
      ...(mustNotRepeat === undefined
        ? {}
        : { mustNotRepeat: mustNotRepeat.map(ref => text(ref)) }),
      ...(item.renderedText === undefined
        ? {}
        : { renderedText: text(item.renderedText) }),
    });
  }
  return normalized;
}

function ctaPayload(
  value: SemanticRecord
): MarketingCtaExpectationReview['cta'] | null {
  if (!isRecord(value.cta)) return null;
  const cta = value.cta;
  if (
    !text(cta.id) ||
    !text(cta.label) ||
    !text(cta.href) ||
    !text(cta.expectedAction)
  )
    return null;
  const optionalStrings = [
    'eligibility',
    'destinationDescription',
    'renderedLabel',
    'destinationAction',
    'destinationEligibility',
  ] as const;
  if (
    optionalStrings.some(
      key => cta[key] !== undefined && typeof cta[key] !== 'string'
    )
  )
    return null;
  const renderedLabel =
    typeof cta.renderedLabel === 'string' ? cta.renderedLabel : undefined;
  return {
    id: text(cta.id),
    label: text(cta.label),
    href: text(cta.href),
    expectedAction: text(cta.expectedAction),
    ...(cta.eligibility === undefined
      ? {}
      : { eligibility: text(cta.eligibility) }),
    ...(cta.destinationDescription === undefined
      ? {}
      : { destinationDescription: text(cta.destinationDescription) }),
    ...(renderedLabel === undefined ? {} : { renderedLabel }),
    ...(cta.destinationAction === undefined
      ? {}
      : { destinationAction: text(cta.destinationAction) }),
    ...(cta.destinationEligibility === undefined
      ? {}
      : { destinationEligibility: text(cta.destinationEligibility) }),
  };
}

function withoutDigests(
  claim: MarketingClaimSupportReview['claim'],
  supportingEvidence: readonly MarketingSemanticEvidenceItem[]
) {
  return {
    claim: {
      id: claim.id,
      statement: claim.statement,
      ...(claim.renderedText === undefined
        ? {}
        : { renderedText: claim.renderedText }),
    },
    supportingEvidence: supportingEvidence.map(item => ({
      id: item.id,
      statement: item.statement,
    })),
  };
}

function normalize(raw: unknown): NormalizedMarketingSemanticReview | null {
  if (!isRecord(raw) || !commonInput(raw)) return null;
  const check = raw.check;
  const stage = stageForCheck(check);
  const scope =
    text(raw.scope) || `marketing:${raw.route}:${raw.pageId}:${check}`;
  if (raw.scope !== undefined && (!text(raw.scope) || scope.length > 200))
    return null;
  if (
    raw.currentSourceSha !== undefined &&
    (typeof raw.currentSourceSha !== 'string' ||
      !SOURCE_SHA.test(raw.currentSourceSha))
  )
    return null;
  if (
    raw.currentArtifactSha256 !== undefined &&
    (typeof raw.currentArtifactSha256 !== 'string' ||
      !ARTIFACT_SHA.test(raw.currentArtifactSha256))
  )
    return null;
  if (
    raw.expectedEvidenceFingerprint !== undefined &&
    (typeof raw.expectedEvidenceFingerprint !== 'string' ||
      !FINGERPRINT.test(raw.expectedEvidenceFingerprint))
  )
    return null;
  const common = {
    route: text(raw.route),
    pageId: text(raw.pageId),
    audience: text(raw.audience),
    objective: text(raw.objective),
    sourceSha: raw.sourceSha,
    artifactSha256: raw.artifactSha256,
  };
  let input: MarketingSemanticReviewInput;
  let payload: SemanticRecord;
  if (check === 'claim-support') {
    const data = claimPayload(raw);
    if (!data) return null;
    input = {
      ...raw,
      ...common,
      check,
      scope,
      claim: data.claim,
      supportingEvidence: data.supportingEvidence,
    } as MarketingClaimSupportReview;
    payload = {
      ...common,
      check,
      ...withoutDigests(data.claim, data.supportingEvidence),
    };
  } else if (check === 'section-overlap') {
    const sections = sectionPayload(raw);
    if (!sections) return null;
    input = {
      ...raw,
      ...common,
      check,
      scope,
      sections,
    } as MarketingSemanticReviewInput;
    payload = { ...common, check, sections };
  } else {
    const cta = ctaPayload(raw);
    if (!cta) return null;
    input = {
      ...raw,
      ...common,
      check,
      scope,
      cta,
    } as MarketingCtaExpectationReview;
    payload = { ...common, check, cta };
  }
  return {
    input,
    check,
    stage,
    scope,
    payload,
    evidenceFingerprint: semanticFingerprint(payload),
  };
}

function allText(value: SemanticRecord): string {
  const pieces: string[] = [];
  const visit = (item: unknown): void => {
    if (typeof item === 'string') pieces.push(item);
    else if (Array.isArray(item)) item.forEach(visit);
    else if (isRecord(item)) Object.values(item).forEach(visit);
  };
  visit(value);
  return pieces.join('\n');
}

export function policyPreflight(
  raw: unknown
):
  | { readonly normalized: NormalizedMarketingSemanticReview }
  | { readonly failure: SemanticPolicyFailure } {
  if (isRecord(raw)) {
    const check = checkOf(raw.check);
    const missingClaimEvidence =
      check === 'claim-support' &&
      (!Array.isArray(raw.supportingEvidence) ||
        raw.supportingEvidence.length === 0);
    const missingSections =
      check === 'section-overlap' &&
      (!Array.isArray(raw.sections) || raw.sections.length < 2);
    if (missingClaimEvidence || missingSections)
      return {
        failure: {
          reasonCode: 'missing-evidence',
          reason: 'The semantic review requires the complete evidence set.',
        },
      };
  }
  const normalized = normalize(raw);
  if (!normalized)
    return {
      failure: {
        reasonCode: 'malformed-input',
        reason: 'The semantic review input is malformed or incomplete.',
      },
    };
  const value = raw as SemanticRecord;
  if (
    value.currentSourceSha !== undefined &&
    value.currentSourceSha !== value.sourceSha
  ) {
    return {
      failure: {
        reasonCode: 'stale-evidence',
        reason: 'The current source digest differs from the reviewed source.',
        evidenceFingerprint: normalized.evidenceFingerprint,
      },
    };
  }
  if (
    value.currentArtifactSha256 !== undefined &&
    value.currentArtifactSha256 !== value.artifactSha256
  ) {
    return {
      failure: {
        reasonCode: 'stale-evidence',
        reason:
          'The current artifact digest differs from the reviewed artifact.',
        evidenceFingerprint: normalized.evidenceFingerprint,
      },
    };
  }
  if (
    value.expectedEvidenceFingerprint !== undefined &&
    value.expectedEvidenceFingerprint !== normalized.evidenceFingerprint
  ) {
    return {
      failure: {
        reasonCode: 'stale-evidence',
        reason: 'The supplied evidence fingerprint is stale.',
        evidenceFingerprint: normalized.evidenceFingerprint,
      },
    };
  }
  const candidateText = allText(normalized.payload);
  if (SENSITIVE.test(candidateText)) {
    return {
      failure: {
        reasonCode: 'sensitive-input',
        reason: 'The supplied evidence requires sensitive-data review.',
        evidenceFingerprint: normalized.evidenceFingerprint,
      },
    };
  }
  if (ADVERSARIAL.test(candidateText)) {
    return {
      failure: {
        reasonCode: 'adversarial-input',
        reason:
          'The supplied candidate text contains reviewer-directed instructions.',
        evidenceFingerprint: normalized.evidenceFingerprint,
      },
    };
  }
  return { normalized };
}

export function marketingSemanticEvidenceFingerprint(input: unknown): string {
  const checked = policyPreflight(input);
  return 'normalized' in checked
    ? checked.normalized.evidenceFingerprint
    : semanticFingerprint(
        isRecord(input)
          ? {
              check: input.check,
              route: input.route,
              pageId: input.pageId,
              audience: input.audience,
              objective: input.objective,
            }
          : null
      );
}
