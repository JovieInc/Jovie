import { describe, expect, it } from 'vitest';
import {
  getPaymentFailedHtml,
  getPaymentFailedSubject,
  getPaymentFailedText,
} from './payment-failed';
import {
  getPaymentRecoveredHtml,
  getPaymentRecoveredSubject,
  getPaymentRecoveredText,
} from './payment-recovered';

const PLAN_NAME = 'Artist Presence';

describe('payment lifecycle email plan naming', () => {
  it('uses one canonical plan name throughout final payment-failure copy', () => {
    const data = {
      userName: 'Ada',
      amountDue: 19_900,
      currency: 'usd',
      attemptCount: 3,
      planName: PLAN_NAME,
      invoiceId: 'in_test',
      daysRemaining: 2,
    };
    const copy = [
      getPaymentFailedSubject(data),
      getPaymentFailedText(data),
      getPaymentFailedHtml(data),
    ].join('\n');

    expect(copy).toContain(PLAN_NAME);
    expect(copy).not.toMatch(/\bPro\b/);
  });

  it('uses one canonical plan name throughout payment-recovery copy', () => {
    const data = {
      userName: 'Ada',
      amountPaid: 19_900,
      currency: 'usd',
      planName: PLAN_NAME,
    };
    const copy = [
      getPaymentRecoveredSubject(data),
      getPaymentRecoveredText(data),
      getPaymentRecoveredHtml(data),
    ].join('\n');

    expect(copy).toContain(PLAN_NAME);
    expect(copy).not.toMatch(/\bPro\b/);
  });
});
