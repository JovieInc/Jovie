import { describe, expect, it } from 'vitest';
import {
  buildPromotionReceipt,
  buildRollbackReceipt,
  evaluatePromotionGate,
  NORTH_STAR_METRIC,
  PROMOTION_RECEIPT_SCHEMA,
  PROTECTED_EVAL_CHECK,
  parsePromotionReceipt,
  parseRollbackReceipt,
  ROLLBACK_RECEIPT_SCHEMA,
} from '@/lib/onboarding/promotion-gate';

const GATE = {
  evalCheck: {
    checkName: PROTECTED_EVAL_CHECK,
    conclusion: 'success',
    headSha: 'a'.repeat(40),
  },
  cohort: {
    metric: NORTH_STAR_METRIC,
    impressions: 200,
    conversions: 80,
    holdoutRegressed: false,
  },
};

const CHANGE = {
  lineKey: 'waitlist:cand_ab12cd34',
  stepId: 'waitlist',
  action: 'promote' as const,
  status: 'active' as const,
  weight: 20,
  previous: { status: 'candidate' as const, weight: 20 },
  text: 'Early list, real spots — you keep your place.',
};

describe('evaluatePromotionGate', () => {
  it('opens only for green ci-promptfoo-evals plus north-star cohort', () => {
    expect(evaluatePromotionGate(GATE).ok).toBe(true);
    expect(evaluatePromotionGate(null).ok).toBe(false);
    expect(evaluatePromotionGate({ cohort: GATE.cohort }).ok).toBe(false);
    expect(evaluatePromotionGate({ evalCheck: GATE.evalCheck }).ok).toBe(false);
    expect(
      evaluatePromotionGate({
        evalCheck: { checkName: 'unprotected-eval', conclusion: 'success' },
        cohort: GATE.cohort,
      }).ok
    ).toBe(false);
    expect(
      evaluatePromotionGate({
        evalCheck: { ...GATE.evalCheck, conclusion: 'cancelled' },
        cohort: GATE.cohort,
      }).ok
    ).toBe(false);
    expect(
      evaluatePromotionGate({
        evalCheck: GATE.evalCheck,
        cohort: { ...GATE.cohort, metric: 'clicks' },
      }).ok
    ).toBe(false);
    expect(
      evaluatePromotionGate({
        evalCheck: GATE.evalCheck,
        cohort: { ...GATE.cohort, holdoutRegressed: true },
      }).ok
    ).toBe(false);
  });
});

describe('promotion receipts', () => {
  it('builds a versioned receipt only when the gate is green', () => {
    const receipt = buildPromotionReceipt({
      receiptId: 'promo-2026-09-29-1',
      evidence: GATE,
      changes: [CHANGE],
      issuedAt: '2026-09-29T00:00:00.000Z',
    });
    expect(receipt?.schema).toBe(PROMOTION_RECEIPT_SCHEMA);
    expect(receipt?.changes).toHaveLength(1);
    expect(
      buildPromotionReceipt({
        receiptId: 'promo-blocked',
        evidence: { evalCheck: null, cohort: GATE.cohort },
        changes: [CHANGE],
      })
    ).toBeNull();
  });

  it('parses merged receipts strictly and rejects fabricated evidence', () => {
    const receipt = buildPromotionReceipt({
      receiptId: 'promo-1',
      evidence: GATE,
      changes: [CHANGE],
    });
    expect(parsePromotionReceipt(receipt)?.receiptId).toBe('promo-1');
    expect(
      parsePromotionReceipt({
        ...receipt,
        evidence: {
          ...receipt?.evidence,
          evalCheck: {
            checkName: PROTECTED_EVAL_CHECK,
            conclusion: 'failure',
          },
        },
      })
    ).toBeNull();
    expect(parsePromotionReceipt({ schema: 'other/v9' })).toBeNull();
  });

  it('derives an inverse rollback receipt', () => {
    const receipt = buildPromotionReceipt({
      receiptId: 'promo-1',
      evidence: GATE,
      changes: [CHANGE],
    });
    if (!receipt) throw new Error('receipt missing');
    const rollback = buildRollbackReceipt(receipt, { receiptId: 'rb-1' });
    expect(rollback.schema).toBe(ROLLBACK_RECEIPT_SCHEMA);
    expect(rollback.rollsBack).toBe('promo-1');
    expect(rollback.changes[0]).toMatchObject({
      lineKey: CHANGE.lineKey,
      action: 'restore',
      status: 'candidate',
      weight: 20,
    });
    expect(parseRollbackReceipt(rollback)?.receiptId).toBe('rb-1');
    expect(parseRollbackReceipt(receipt)).toBeNull();
  });
});
