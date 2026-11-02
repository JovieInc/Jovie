import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  sendEmail: vi.fn(),
  createBillingPortalSession: vi.fn(),
  getPriceMappingDetails: vi.fn(),
}));

// Mock server-only
vi.mock('server-only', () => ({}));

// Mock dependencies that dunning.ts uses
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

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  getPaymentFailedHtml,
  getPaymentFailedSubject,
  getPaymentFailedText,
} from '@/lib/email/templates/payment-failed';
import { getPlanDisplayName } from '@/lib/entitlements/registry';
import { captureError } from '@/lib/error-tracking';
import {
  isRecoveryScenario,
  type PaymentFailureInfo,
  sendPaymentFailedEmail,
  shouldSendDunningEmail,
} from '@/lib/stripe/dunning';
import { logger } from '@/lib/utils/logger';

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

  describe('sendPaymentFailedEmail', () => {
    const info: PaymentFailureInfo = {
      userId: '11111111-1111-4111-8111-111111111111',
      amountDue: 1200,
      currency: 'usd',
      attemptCount: 1,
      invoiceId: 'in_failed',
      priceId: 'price_pro',
      customerId: 'cus_failed',
    };

    beforeEach(() => {
      vi.clearAllMocks();
      mocks.limit.mockReset().mockResolvedValue([]);
      mocks.sendEmail
        .mockReset()
        .mockResolvedValue({ status: 'sent', detail: 'msg_123' });
      mocks.createBillingPortalSession.mockReset().mockResolvedValue({
        url: 'https://billing.stripe.com/portal',
      });
      mocks.getPriceMappingDetails.mockReset().mockReturnValue({
        description: 'Pro Monthly',
        plan: 'pro',
        interval: 'month',
      });
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.test');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('looks up a Better Auth app user id on users.id as well as clerkId', async () => {
      const appUserId = '11111111-1111-4111-8111-111111111111';

      const result = await sendPaymentFailedEmail({
        userId: appUserId,
        amountDue: 1200,
        currency: 'usd',
        attemptCount: 1,
        invoiceId: 'in_123',
        priceId: 'price_pro',
      });

      expect(result).toEqual({
        success: false,
        error: 'No email found for user',
      });
      expect(eq).toHaveBeenCalledWith('users.id', appUserId);
      expect(eq).toHaveBeenCalledWith('users.clerkId', appUserId);
      expect(logger.warn).toHaveBeenCalledWith(
        'No email found for user, skipping dunning email',
        { userId: appUserId }
      );
      expect(mocks.sendEmail).not.toHaveBeenCalled();
      expect(mocks.createBillingPortalSession).not.toHaveBeenCalled();
      expect(getPaymentFailedSubject).not.toHaveBeenCalled();
      expect(getPaymentFailedText).not.toHaveBeenCalled();
      expect(getPaymentFailedHtml).not.toHaveBeenCalled();
      expect(captureError).not.toHaveBeenCalled();
    });

    it('sends the exact failed-payment template and billing portal to the recipient', async () => {
      mocks.limit.mockResolvedValue([
        { email: 'artist@example.test', name: 'Alex' },
      ]);

      await expect(sendPaymentFailedEmail(info)).resolves.toEqual({
        success: true,
      });

      expect(db.select).toHaveBeenCalledWith({ email: 'email', name: 'name' });
      expect(mocks.createBillingPortalSession).toHaveBeenCalledExactlyOnceWith({
        customerId: 'cus_failed',
        returnUrl: 'https://app.example.test/app/billing',
      });
      expect(mocks.getPriceMappingDetails).toHaveBeenCalledExactlyOnceWith(
        'price_pro'
      );
      const templateData = {
        userName: 'Alex',
        amountDue: 1200,
        currency: 'usd',
        attemptCount: 1,
        planName: 'Pro Monthly',
        invoiceId: 'in_failed',
        portalUrl: 'https://billing.stripe.com/portal',
        daysRemaining: 5,
      };
      expect(getPaymentFailedSubject).toHaveBeenCalledExactlyOnceWith(
        templateData
      );
      expect(getPaymentFailedText).toHaveBeenCalledExactlyOnceWith(
        templateData
      );
      expect(getPaymentFailedHtml).toHaveBeenCalledExactlyOnceWith(
        templateData
      );
      expect(mocks.sendEmail).toHaveBeenCalledExactlyOnceWith({
        stream: 'transactional',
        purpose: 'dunning-payment-failed',
        consent: 'account-transaction',
        to: 'artist@example.test',
        subject: 'Payment failed',
        text: 'Payment failed text',
        html: '<html>failed</html>',
      });
      expect(logger.info).toHaveBeenCalledExactlyOnceWith(
        'Sent payment failed email',
        {
          userId: info.userId,
          attemptCount: 1,
          messageId: 'msg_123',
        }
      );
      expect(captureError).not.toHaveBeenCalled();
    });

    it('fails closed and records the original recipient lookup error', async () => {
      const error = new Error('database unavailable');
      mocks.limit.mockRejectedValue(error);

      await expect(sendPaymentFailedEmail(info)).resolves.toEqual({
        success: false,
        error: 'No email found for user',
      });

      expect(captureError).toHaveBeenCalledExactlyOnceWith(
        'Error fetching user for dunning email',
        error,
        { userId: info.userId }
      );
      expect(mocks.sendEmail).not.toHaveBeenCalled();
      expect(mocks.createBillingPortalSession).not.toHaveBeenCalled();
    });

    it.each([
      { label: 'absent price', priceId: undefined },
      { label: 'unknown price', priceId: 'price_missing' },
    ])('uses the canonical default plan for $label', async ({ priceId }) => {
      mocks.limit.mockResolvedValue([
        { email: 'artist@example.test', name: 'Alex' },
      ]);
      mocks.getPriceMappingDetails.mockReturnValue(null);

      await expect(
        sendPaymentFailedEmail({ ...info, priceId })
      ).resolves.toEqual({
        success: true,
      });

      expect(getPaymentFailedHtml).toHaveBeenCalledWith(
        expect.objectContaining({ planName: getPlanDisplayName('pro') })
      );
      if (priceId === undefined) {
        expect(mocks.getPriceMappingDetails).not.toHaveBeenCalled();
      } else {
        expect(mocks.getPriceMappingDetails).toHaveBeenCalledExactlyOnceWith(
          priceId
        );
      }
    });

    it.each([
      { status: 'error', error: 'provider rejected' },
      { status: 'skipped', detail: 'provider unavailable' },
    ] as const)(
      'reports provider $status without claiming delivery',
      async result => {
        mocks.limit.mockResolvedValue([
          { email: 'artist@example.test', name: null },
        ]);
        mocks.sendEmail.mockResolvedValue(result);

        await expect(
          sendPaymentFailedEmail({ ...info, customerId: undefined })
        ).resolves.toEqual({
          success: false,
          error: result.status === 'error' ? result.error : result.detail,
        });

        expect(getPaymentFailedHtml).toHaveBeenCalledWith(
          expect.objectContaining({ userName: 'artist' })
        );
        expect(mocks.createBillingPortalSession).not.toHaveBeenCalled();
        if (result.status === 'error') {
          expect(logger.error).toHaveBeenCalledExactlyOnceWith(
            'Failed to send payment failed email',
            {
              userId: info.userId,
              error: result.error,
            }
          );
        } else {
          expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
            'Payment failed email skipped',
            {
              userId: info.userId,
              detail: result.detail,
            }
          );
        }
        expect(logger.info).not.toHaveBeenCalled();
        expect(captureError).not.toHaveBeenCalled();
      }
    );

    it.each([
      {
        rejection: new Error('provider exploded'),
        message: 'provider exploded',
      },
      { rejection: 'provider unavailable', message: 'Unknown error' },
    ])(
      'fails closed when the provider rejects with $message',
      async ({ rejection, message }) => {
        mocks.limit.mockResolvedValue([
          { email: 'artist@example.test', name: 'Alex' },
        ]);
        mocks.sendEmail.mockRejectedValue(rejection);

        await expect(sendPaymentFailedEmail(info)).resolves.toEqual({
          success: false,
          error: message,
        });

        expect(captureError).toHaveBeenCalledExactlyOnceWith(
          'Error sending payment failed email',
          rejection,
          {
            userId: info.userId,
          }
        );
        expect(logger.info).not.toHaveBeenCalled();
      }
    );

    it.each(['rejected', 'missing URL'] as const)(
      'still sends when the optional portal is %s',
      async outcome => {
        mocks.limit.mockResolvedValue([
          { email: 'artist@example.test', name: 'Alex' },
        ]);
        if (outcome === 'rejected') {
          mocks.createBillingPortalSession.mockRejectedValue(
            new Error('portal unavailable')
          );
        } else {
          mocks.createBillingPortalSession.mockResolvedValue({ url: null });
        }

        await expect(sendPaymentFailedEmail(info)).resolves.toEqual({
          success: true,
        });

        expect(mocks.sendEmail).toHaveBeenCalledOnce();
        expect(getPaymentFailedHtml).toHaveBeenCalledWith(
          expect.objectContaining({ portalUrl: undefined })
        );
        expect(captureError).not.toHaveBeenCalled();
      }
    );
  });
});
