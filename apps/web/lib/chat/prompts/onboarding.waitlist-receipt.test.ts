import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_WAITLIST_RECEIPT,
  ONBOARDING_WAITLIST_RECEIPT_WITH_EMAIL,
  waitlistReceiptForEmail,
} from './onboarding';

describe('waitlistReceiptForEmail', () => {
  it('does not promise email when contact is unknown', () => {
    const text = waitlistReceiptForEmail(null);
    expect(text).toBe(ONBOARDING_WAITLIST_RECEIPT);
    expect(text.toLowerCase()).not.toMatch(/email/);
  });

  it('promises email only when contact is known', () => {
    const text = waitlistReceiptForEmail('artist@example.com');
    expect(text).toBe(ONBOARDING_WAITLIST_RECEIPT_WITH_EMAIL);
    expect(text.toLowerCase()).toMatch(/email/);
  });
});
