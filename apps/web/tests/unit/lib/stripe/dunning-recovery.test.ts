import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  sendEmail: vi.fn(),
  createBillingPortalSession: vi.fn(),
  getPriceMappingDetails: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: mocks.limit,
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    id: 'users.id',
    clerkId: 'users.clerkId',
    email: 'email',
    name: 'name',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  or: vi.fn((...args: unknown[]) => ({ or: args })),
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

vi.mock('@/lib/notifications/providers/gateway', () => ({
  GatewayEmailProvider: vi.fn().mockImplementation(function () {
    return { sendEmail: mocks.sendEmail };
  }),
}));

vi.mock('@/lib/stripe/client', () => ({
  createBillingPortalSession: mocks.createBillingPortalSession,
}));

vi.mock('@/lib/stripe/config', () => ({
  getPriceMappingDetails: mocks.getPriceMappingDetails,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { getPaymentFailedHtml } from '@/lib/email/templates/payment-failed';
import {
  getPaymentRecoveredHtml,
  getPaymentRecoveredSubject,
  getPaymentRecoveredText,
} from '@/lib/email/templates/payment-recovered';
import { getPlanDisplayName } from '@/lib/entitlements/registry';
import { captureError } from '@/lib/error-tracking';
import {
  type PaymentFailureInfo,
  type PaymentRecoveryInfo,
  sendPaymentFailedEmail,
  sendPaymentRecoveredEmail,
} from '@/lib/stripe/dunning';
import { logger } from '@/lib/utils/logger';

describe('dunning recovery + daysRemaining', () => {
  describe('sendPaymentFailedEmail daysRemaining', () => {
    const info: PaymentFailureInfo = {
      userId: '11111111-1111-4111-8111-111111111111',
      amountDue: 1200,
      currency: 'usd',
      attemptCount: 1,
      customerId: 'cus_failed',
      priceId: 'price_pro',
      invoiceId: 'in_failed',
    };

    beforeEach(() => {
      vi.clearAllMocks();
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.test');
      mocks.limit.mockReset().mockResolvedValue([]);
      mocks.sendEmail
        .mockReset()
        .mockResolvedValue({ status: 'sent', detail: 'msg_failed' });
      mocks.createBillingPortalSession.mockReset().mockResolvedValue({
        url: 'https://billing.stripe.com/portal',
      });
      mocks.getPriceMappingDetails.mockReset().mockReturnValue({
        description: 'Pro Monthly',
        plan: 'pro',
        interval: 'month',
      });
    });

    it.each([
      { attemptCount: 0, daysRemaining: 7 },
      { attemptCount: 1, daysRemaining: 5 },
      { attemptCount: 2, daysRemaining: 3 },
      { attemptCount: 3, daysRemaining: 1 },
      { attemptCount: 4, daysRemaining: 1 },
      { attemptCount: 10, daysRemaining: 1 },
    ])(
      'templates daysRemaining=$daysRemaining for attempt $attemptCount',
      async ({ attemptCount, daysRemaining }) => {
        mocks.limit.mockResolvedValue([
          { email: 'artist@example.test', name: 'Alex' },
        ]);

        await expect(
          sendPaymentFailedEmail({ ...info, attemptCount })
        ).resolves.toEqual({ success: true });

        expect(getPaymentFailedHtml).toHaveBeenCalledWith(
          expect.objectContaining({ attemptCount, daysRemaining })
        );
      }
    );
  });

  describe('sendPaymentRecoveredEmail', () => {
    const recovery: PaymentRecoveryInfo = {
      userId: '11111111-1111-4111-8111-111111111111',
      amountPaid: 1200,
      currency: 'usd',
      priceId: 'price_pro',
      invoiceId: 'in_recovered',
    };

    beforeEach(() => {
      vi.clearAllMocks();
      mocks.limit.mockReset().mockResolvedValue([]);
      mocks.sendEmail
        .mockReset()
        .mockResolvedValue({ status: 'sent', detail: 'msg_rec' });
      mocks.getPriceMappingDetails.mockReset().mockReturnValue({
        description: 'Pro Monthly',
        plan: 'pro',
        interval: 'month',
      });
    });

    it('fails closed when the recipient cannot be resolved', async () => {
      await expect(sendPaymentRecoveredEmail(recovery)).resolves.toEqual({
        success: false,
        error: 'No email found for user',
      });
      expect(logger.warn).toHaveBeenCalledWith(
        'No email found for user, skipping recovery email',
        { userId: recovery.userId }
      );
      expect(mocks.sendEmail).not.toHaveBeenCalled();
      expect(getPaymentRecoveredHtml).not.toHaveBeenCalled();
    });

    it('sends the recovered template with invoice idempotency', async () => {
      mocks.limit.mockResolvedValue([
        { email: 'artist@example.test', name: 'Alex' },
      ]);

      await expect(sendPaymentRecoveredEmail(recovery)).resolves.toEqual({
        success: true,
      });

      const templateData = {
        userName: 'Alex',
        amountPaid: 1200,
        currency: 'usd',
        planName: 'Pro Monthly',
      };
      expect(getPaymentRecoveredSubject).toHaveBeenCalledExactlyOnceWith();
      expect(getPaymentRecoveredText).toHaveBeenCalledExactlyOnceWith(
        templateData
      );
      expect(getPaymentRecoveredHtml).toHaveBeenCalledExactlyOnceWith(
        templateData
      );
      expect(mocks.sendEmail).toHaveBeenCalledExactlyOnceWith({
        stream: 'transactional',
        purpose: 'dunning-payment-recovered',
        consent: 'account-transaction',
        to: 'artist@example.test',
        subject: 'Payment recovered',
        text: 'recovered text',
        html: '<html>recovered</html>',
        idempotencyKey: 'payment-recovered:in_recovered',
      });
      expect(logger.info).toHaveBeenCalledExactlyOnceWith(
        'Sent payment recovered email',
        { userId: recovery.userId, messageId: 'msg_rec' }
      );
    });

    it('omits idempotency when invoiceId is absent', async () => {
      mocks.limit.mockResolvedValue([
        { email: 'artist@example.test', name: null },
      ]);

      await expect(
        sendPaymentRecoveredEmail({
          userId: recovery.userId,
          amountPaid: 500,
          currency: 'usd',
        })
      ).resolves.toEqual({ success: true });

      expect(mocks.sendEmail).toHaveBeenCalledExactlyOnceWith(
        expect.not.objectContaining({ idempotencyKey: expect.anything() })
      );
      expect(getPaymentRecoveredHtml).toHaveBeenCalledWith(
        expect.objectContaining({
          userName: 'artist',
          planName: getPlanDisplayName('pro'),
        })
      );
    });

    it.each([
      { status: 'error', error: 'provider rejected' },
      { status: 'skipped', detail: 'provider unavailable' },
    ] as const)(
      'reports provider $status without claiming recovery delivery',
      async result => {
        mocks.limit.mockResolvedValue([
          { email: 'artist@example.test', name: 'Alex' },
        ]);
        mocks.sendEmail.mockResolvedValue(result);

        await expect(sendPaymentRecoveredEmail(recovery)).resolves.toEqual({
          success: false,
          error: result.status === 'error' ? result.error : result.detail,
        });
        expect(logger.info).not.toHaveBeenCalled();
      }
    );

    it('fails closed when the provider throws', async () => {
      const boom = new Error('provider exploded');
      mocks.limit.mockResolvedValue([
        { email: 'artist@example.test', name: 'Alex' },
      ]);
      mocks.sendEmail.mockRejectedValue(boom);

      await expect(sendPaymentRecoveredEmail(recovery)).resolves.toEqual({
        success: false,
        error: 'provider exploded',
      });
      expect(captureError).toHaveBeenCalledExactlyOnceWith(
        'Error sending payment recovered email',
        boom,
        { userId: recovery.userId }
      );
    });
  });
});
