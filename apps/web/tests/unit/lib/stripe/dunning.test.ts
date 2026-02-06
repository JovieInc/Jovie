import { describe, expect, it, vi } from 'vitest';

// Mock server-only
vi.mock('server-only', () => ({}));

// Mock dependencies that dunning.ts uses
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: { clerkId: 'clerk_id', email: 'email', name: 'name' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}));

vi.mock('@/lib/email/templates/payment-failed', () => ({
  getPaymentFailedHtml: vi.fn().mockReturnValue('<html>failed</html>'),
  getPaymentFailedSubject: vi.fn().mockReturnValue('Payment failed'),
  getPaymentFailedText: vi.fn().mockReturnValue('Payment failed text'),
}));

vi.mock('@/lib/email/templates/payment-recovered', () => ({
  getPaymentRecoveredHtml: vi.fn().mockReturnValue('<html>recovered</html>'),
  getPaymentRecoveredSubject: vi.fn().mockReturnValue('Payment recovered'),
  getPaymentRecoveredText: vi.fn().mockReturnValue('recovered text'),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/notifications/providers/resend', () => ({
  ResendEmailProvider: vi.fn().mockImplementation(() => ({
    sendEmail: vi.fn().mockResolvedValue({ status: 'sent', detail: 'msg_123' }),
  })),
}));

vi.mock('@/lib/stripe/client', () => ({
  createBillingPortalSession: vi.fn().mockResolvedValue({
    url: 'https://billing.stripe.com/portal',
  }),
}));

vi.mock('@/lib/stripe/config', () => ({
  getPriceMappingDetails: vi.fn().mockReturnValue({
    description: 'Pro Monthly',
    plan: 'pro',
    interval: 'month',
  }),
}));

import {
  isRecoveryScenario,
  shouldSendDunningEmail,
} from '@/lib/stripe/dunning';

describe('dunning', () => {
  describe('shouldSendDunningEmail', () => {
    it('should send email for attempt 1', () => {
      expect(shouldSendDunningEmail(1)).toBe(true);
    });

    it('should send email for attempt 2', () => {
      expect(shouldSendDunningEmail(2)).toBe(true);
    });

    it('should send email for attempt 3', () => {
      expect(shouldSendDunningEmail(3)).toBe(true);
    });

    it('should send email for attempt 4', () => {
      expect(shouldSendDunningEmail(4)).toBe(true);
    });

    it('should not send email for attempt 5', () => {
      expect(shouldSendDunningEmail(5)).toBe(false);
    });

    it('should not send email for attempt 10', () => {
      expect(shouldSendDunningEmail(10)).toBe(false);
    });

    it('should send email for attempt 0 (edge case)', () => {
      expect(shouldSendDunningEmail(0)).toBe(true);
    });
  });

  describe('isRecoveryScenario', () => {
    it('should return true for past_due previous status', () => {
      expect(isRecoveryScenario('past_due')).toBe(true);
    });

    it('should return true for unpaid previous status', () => {
      expect(isRecoveryScenario('unpaid')).toBe(true);
    });

    it('should return true for incomplete previous status', () => {
      expect(isRecoveryScenario('incomplete')).toBe(true);
    });

    it('should return false for active previous status', () => {
      expect(isRecoveryScenario('active')).toBe(false);
    });

    it('should return false for canceled previous status', () => {
      expect(isRecoveryScenario('canceled')).toBe(false);
    });

    it('should return false for undefined previous status', () => {
      expect(isRecoveryScenario(undefined)).toBe(false);
    });

    it('should return false for trialing previous status', () => {
      expect(isRecoveryScenario('trialing')).toBe(false);
    });
  });
});
