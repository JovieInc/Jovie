import { describe, expect, it } from 'vitest';
import {
  evaluateAllRetouchRuleCases,
  evaluateRetouchRuleCase,
  gateRetouchIdentity,
  RETOUCH_IDENTITY_ERROR_CODE,
  RETOUCH_IDENTITY_REFUSAL_MESSAGE,
  RETOUCH_IDENTITY_RULES,
  RETOUCH_RULE_CASE_IDS,
  type RetouchRuleCaseId,
} from '@/lib/services/retouching/identity-rules';

const REFUSAL = {
  disposition: 'refuse',
  errorCode: 'IDENTITY_GUARDRAIL_REFUSAL',
  reason:
    "This photo couldn't be retouched while preserving your likeness. Try a clearer, well-lit photo where your face is fully visible.",
} as const;

const PROCEED = {
  disposition: 'proceed',
  errorCode: null,
  reason: 'Identity can be preserved confidently; retouch may proceed',
} as const;

describe('gateRetouchIdentity', () => {
  it('exposes the refusal contract the client renders', () => {
    expect(RETOUCH_IDENTITY_ERROR_CODE).toBe(REFUSAL.errorCode);
    expect(RETOUCH_IDENTITY_REFUSAL_MESSAGE).toBe(REFUSAL.reason);
    expect(RETOUCH_IDENTITY_RULES).toBe(
      'If the input is too low quality or ambiguous to preserve identity confidently, return a safe refusal instead of guessing.'
    );
  });

  it.each([
    ['ambiguous', undefined],
    ['ambiguous', true],
    ['low', undefined],
    ['low', true],
    ['low', false],
  ] as const)(
    'refuses %s identity (imageReturned=%s) instead of guessing',
    (identityConfidence, imageReturned) => {
      expect(
        gateRetouchIdentity({ identityConfidence, imageReturned })
      ).toEqual(REFUSAL);
    }
  );

  it('refuses a confident input when the model returned no image', () => {
    expect(
      gateRetouchIdentity({
        identityConfidence: 'confident',
        imageReturned: false,
      })
    ).toEqual(REFUSAL);
  });

  it.each([true, undefined])(
    'lets confident identity proceed (imageReturned=%s)',
    imageReturned => {
      expect(
        gateRetouchIdentity({ identityConfidence: 'confident', imageReturned })
      ).toEqual(PROCEED);
    }
  );
});

describe('retouch rule cases', () => {
  it('passes the ambiguous-identity rule case', () => {
    expect(RETOUCH_RULE_CASE_IDS).toEqual(['ambiguous-identity-refused']);
    expect(evaluateRetouchRuleCase('ambiguous-identity-refused')).toEqual({
      id: 'ambiguous-identity-refused',
      passed: true,
      reason:
        'Low-quality or ambiguous identity is refused; confident identity may proceed',
    });
  });

  it('evaluates every registered case', () => {
    expect(evaluateAllRetouchRuleCases()).toEqual([
      evaluateRetouchRuleCase('ambiguous-identity-refused'),
    ]);
  });

  it('rejects unknown case ids', () => {
    expect(() =>
      evaluateRetouchRuleCase('made-up-case' as RetouchRuleCaseId)
    ).toThrow(new TypeError('Unknown retouch rule case: made-up-case'));
  });
});
