import {
  type NormalizedMarketingSemanticReview,
  semanticFingerprint,
} from './semanticReviewPolicy';
import type { MarketingSemanticReasonCode } from './semanticReviewTypes';

export type SemanticDeterministicIssue = {
  readonly reasonCode: Extract<
    MarketingSemanticReasonCode,
    | 'stale-evidence'
    | 'deterministic-overlap'
    | 'deterministic-destination-mismatch'
    | 'deterministic-rendered-text-mismatch'
    | 'rendered-evidence-required'
  >;
  readonly verdict: 'contradicted' | 'needs-specialist';
  readonly reason: string;
  readonly findingCode: string;
  readonly findingMessage: string;
  readonly evidenceIds: readonly string[];
};

function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function deterministicIssue(
  normalized: NormalizedMarketingSemanticReview
): SemanticDeterministicIssue | null {
  const raw = normalized.input;
  if (raw.check === 'claim-support') {
    const claim = raw.claim;
    const claimValue = {
      id: claim.id,
      statement: claim.statement,
      ...(claim.renderedText === undefined
        ? {}
        : { renderedText: claim.renderedText }),
    };
    if (
      claim.digest !== undefined &&
      claim.digest !== semanticFingerprint(claimValue)
    )
      return {
        reasonCode: 'stale-evidence',
        verdict: 'contradicted',
        reason: 'The claim digest does not match the claim content.',
        findingCode: 'claim-digest-mismatch',
        findingMessage: 'Claim digest does not match the claim content.',
        evidenceIds: [claim.id],
      };
    for (const item of raw.supportingEvidence) {
      if (
        item.digest !== undefined &&
        item.digest !==
          semanticFingerprint({ id: item.id, statement: item.statement })
      )
        return {
          reasonCode: 'stale-evidence',
          verdict: 'contradicted',
          reason: 'A supporting-evidence digest does not match its content.',
          findingCode: 'evidence-digest-mismatch',
          findingMessage:
            'Supporting-evidence digest does not match its content.',
          evidenceIds: [item.id],
        };
    }
    if (
      claim.renderedText !== undefined &&
      claim.renderedText !== claim.statement
    )
      return {
        reasonCode: 'deterministic-rendered-text-mismatch',
        verdict: 'contradicted',
        reason: 'Rendered claim text differs from the reviewed claim.',
        findingCode: 'claim-rendered-text-mismatch',
        findingMessage:
          'Rendered claim text does not match the claim statement.',
        evidenceIds: [claim.id],
      };
  }
  if (raw.check === 'section-overlap') {
    const fields = ['question', 'responsibility', 'customerBelief'] as const;
    for (let left = 0; left < raw.sections.length; left += 1) {
      for (let right = left + 1; right < raw.sections.length; right += 1) {
        const one = raw.sections[left];
        const two = raw.sections[right];
        const field = fields.find(
          key => normalizeText(one[key]) === normalizeText(two[key])
        );
        if (field)
          return {
            reasonCode: 'deterministic-overlap',
            verdict: 'contradicted',
            reason: 'Two sections repeat the same visitor-facing information.',
            findingCode: `exact-section-${field}-overlap`,
            findingMessage: `Sections ${one.id} and ${two.id} share the same ${field}.`,
            evidenceIds: [one.id, two.id],
          };
      }
    }
  }
  if (raw.check === 'cta-expectation') {
    const cta = raw.cta;
    if (!cta.renderedLabel?.trim())
      return {
        reasonCode: 'rendered-evidence-required',
        verdict: 'needs-specialist',
        reason: 'Rendered CTA text is required before semantic review.',
        findingCode: 'cta-rendered-text-missing',
        findingMessage: 'Rendered CTA text is required before semantic review.',
        evidenceIds: [cta.id],
      };
    if (cta.renderedLabel !== cta.label)
      return {
        reasonCode: 'deterministic-rendered-text-mismatch',
        verdict: 'contradicted',
        reason: 'Rendered CTA text differs from the registered CTA label.',
        findingCode: 'cta-rendered-text-mismatch',
        findingMessage: 'Rendered CTA label does not match the CTA contract.',
        evidenceIds: [cta.id],
      };
    if (
      cta.destinationAction !== undefined &&
      cta.destinationAction !== cta.expectedAction
    )
      return {
        reasonCode: 'deterministic-destination-mismatch',
        verdict: 'contradicted',
        reason: 'The CTA destination action differs from its expected action.',
        findingCode: 'cta-destination-action-mismatch',
        findingMessage:
          'CTA destination action does not match the expected action.',
        evidenceIds: [cta.id],
      };
    if (
      cta.eligibility !== undefined &&
      cta.destinationEligibility !== undefined &&
      cta.eligibility !== cta.destinationEligibility
    )
      return {
        reasonCode: 'deterministic-destination-mismatch',
        verdict: 'contradicted',
        reason:
          'The CTA destination eligibility differs from its stated eligibility.',
        findingCode: 'cta-destination-eligibility-mismatch',
        findingMessage:
          'CTA destination eligibility does not match the CTA contract.',
        evidenceIds: [cta.id],
      };
  }
  return null;
}
