import { describe, expect, it } from 'vitest';
import {
  evaluateAllRetouchRuleCases,
  evaluateRetouchRuleCase,
  gateRetouchIdentity,
  RETOUCH_IDENTITY_ERROR_CODE,
  RETOUCH_IDENTITY_REFUSAL_MESSAGE,
  RETOUCH_IDENTITY_RULES,
  RETOUCH_RULE_CASE_IDS,
} from '@/lib/services/retouching/identity-rules';

describe('retouch identity safe-refusal gate', () => {
  it('encodes the ambiguous-identity rule case', () => {
    expect(RETOUCH_RULE_CASE_IDS).toEqual(['ambiguous-identity-refused']);
    for (const result of evaluateAllRetouchRuleCases()) {
      expect(result.passed, result.reason).toBe(true);
    }
    expect(evaluateRetouchRuleCase('ambiguous-identity-refused').passed).toBe(
      true
    );
  });

  it('refuses low-quality or ambiguous identity instead of guessing', () => {
    expect(
      gateRetouchIdentity({ identityConfidence: 'ambiguous' })
    ).toMatchObject({
      disposition: 'refuse',
      errorCode: RETOUCH_IDENTITY_ERROR_CODE,
      reason: RETOUCH_IDENTITY_REFUSAL_MESSAGE,
    });
    expect(
      gateRetouchIdentity({ identityConfidence: 'low', imageReturned: true })
    ).toMatchObject({
      disposition: 'refuse',
      errorCode: RETOUCH_IDENTITY_ERROR_CODE,
    });
    expect(
      gateRetouchIdentity({
        identityConfidence: 'confident',
        imageReturned: true,
      })
    ).toMatchObject({
      disposition: 'proceed',
      errorCode: null,
    });
    expect(RETOUCH_IDENTITY_RULES).toContain(
      'safe refusal instead of guessing'
    );
  });
});
