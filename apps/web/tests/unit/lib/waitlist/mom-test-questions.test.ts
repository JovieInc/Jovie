import { describe, expect, it } from 'vitest';
import { isLeadingQuestion } from '@/lib/acquisition/conversation-loop';
import {
  MOM_TEST_QUESTION_VALUES,
  MOM_TEST_QUESTIONS,
  PROMO_SPEND_BANDS,
} from '@/lib/waitlist/role-qualification';

describe('Mom Test question enforcement (Tim 2026-11-09)', () => {
  it('asks about past behavior and current spend, never hypothetical intent', () => {
    expect(MOM_TEST_QUESTION_VALUES.length).toBeGreaterThanOrEqual(2);
    for (const question of MOM_TEST_QUESTION_VALUES) {
      expect(
        isLeadingQuestion(question),
        `scripted question reads as leading: ${question}`
      ).toBe(false);
    }
  });

  it('still blocks the classic leading questions', () => {
    expect(isLeadingQuestion('Would you pay for this?')).toBe(true);
    expect(isLeadingQuestion('Do you like the idea of auto-merch?')).toBe(true);
    expect(isLeadingQuestion('How much would you pay monthly?')).toBe(true);
  });

  it('keeps the spend band options non-leading and bounded', () => {
    expect(PROMO_SPEND_BANDS).toEqual(['none', 'under_50', '50_plus']);
    // The spend question asks what they pay today, not what they would pay.
    expect(MOM_TEST_QUESTIONS.promoSpend).not.toMatch(/would you/i);
  });
});
