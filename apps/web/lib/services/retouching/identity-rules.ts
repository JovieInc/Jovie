/**
 * Identity-preservation refusal floor for the White Space retouch skill.
 * Encodes retouch-white-space.md: if the input is too low quality or
 * ambiguous to preserve identity confidently, return a safe refusal
 * instead of guessing.
 */

export const RETOUCH_IDENTITY_RULES = `If the input is too low quality or ambiguous to preserve identity confidently, return a safe refusal instead of guessing.`;

export const RETOUCH_IDENTITY_ERROR_CODE =
  'IDENTITY_GUARDRAIL_REFUSAL' as const;

export const RETOUCH_IDENTITY_REFUSAL_MESSAGE =
  "This photo couldn't be retouched while preserving your likeness. Try a clearer, well-lit photo where your face is fully visible.";

export const RETOUCH_RULE_CASE_IDS = ['ambiguous-identity-refused'] as const;

export type RetouchRuleCaseId = (typeof RETOUCH_RULE_CASE_IDS)[number];

export type RetouchRuleCaseResult = {
  readonly id: RetouchRuleCaseId;
  readonly passed: boolean;
  readonly reason: string;
};

export type RetouchIdentityConfidence = 'confident' | 'low' | 'ambiguous';

export type RetouchIdentityDisposition = 'proceed' | 'refuse';

export interface GateRetouchIdentityInput {
  readonly identityConfidence: RetouchIdentityConfidence;
  readonly imageReturned?: boolean;
}

export interface RetouchIdentityGateResult {
  readonly disposition: RetouchIdentityDisposition;
  readonly errorCode: typeof RETOUCH_IDENTITY_ERROR_CODE | null;
  readonly reason: string;
}

/** Safe-refusal gate for low-quality or ambiguous identity. */
export function gateRetouchIdentity(
  input: GateRetouchIdentityInput
): RetouchIdentityGateResult {
  if (
    input.identityConfidence === 'low' ||
    input.identityConfidence === 'ambiguous'
  ) {
    return {
      disposition: 'refuse',
      errorCode: RETOUCH_IDENTITY_ERROR_CODE,
      reason: RETOUCH_IDENTITY_REFUSAL_MESSAGE,
    };
  }

  if (input.imageReturned === false) {
    return {
      disposition: 'refuse',
      errorCode: RETOUCH_IDENTITY_ERROR_CODE,
      reason: RETOUCH_IDENTITY_REFUSAL_MESSAGE,
    };
  }

  return {
    disposition: 'proceed',
    errorCode: null,
    reason: 'Identity can be preserved confidently; retouch may proceed',
  };
}

function evaluateAmbiguousIdentityRefused(): RetouchRuleCaseResult {
  const ambiguous = gateRetouchIdentity({
    identityConfidence: 'ambiguous',
  });
  const lowQuality = gateRetouchIdentity({
    identityConfidence: 'low',
    imageReturned: true,
  });
  const modelDeclined = gateRetouchIdentity({
    identityConfidence: 'confident',
    imageReturned: false,
  });
  const confident = gateRetouchIdentity({
    identityConfidence: 'confident',
    imageReturned: true,
  });
  const passed =
    ambiguous.disposition === 'refuse' &&
    ambiguous.errorCode === RETOUCH_IDENTITY_ERROR_CODE &&
    lowQuality.disposition === 'refuse' &&
    lowQuality.errorCode === RETOUCH_IDENTITY_ERROR_CODE &&
    modelDeclined.disposition === 'refuse' &&
    confident.disposition === 'proceed' &&
    confident.errorCode === null &&
    RETOUCH_IDENTITY_RULES.includes('safe refusal instead of guessing');
  return {
    id: 'ambiguous-identity-refused',
    passed,
    reason: passed
      ? 'Low-quality or ambiguous identity is refused; confident identity may proceed'
      : 'Ambiguous/low-quality identity was guessed or a confident input was refused',
  };
}

export function evaluateRetouchRuleCase(
  id: RetouchRuleCaseId
): RetouchRuleCaseResult {
  switch (id) {
    case 'ambiguous-identity-refused':
      return evaluateAmbiguousIdentityRefused();
  }
}

export function evaluateAllRetouchRuleCases(): RetouchRuleCaseResult[] {
  return RETOUCH_RULE_CASE_IDS.map(evaluateRetouchRuleCase);
}
