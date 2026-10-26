import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listInvoices: vi.fn(),
  listInvoicePayments: vi.fn(),
  createRefund: vi.fn(),
  cancelSubscription: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    invoices: { list: mocks.listInvoices },
    invoicePayments: { list: mocks.listInvoicePayments },
    refunds: { create: mocks.createRefund },
    subscriptions: { cancel: mocks.cancelSubscription },
  },
}));

import { refundFirstMonthAndCancel } from './claim-rejection-refund';

const KEY = 'claim-verification-reject:profile-1';

describe('refundFirstMonthAndCancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listInvoices.mockResolvedValue({
      data: [
        { id: 'in_second', created: 200, amount_paid: 1200 },
        { id: 'in_first', created: 100, amount_paid: 1200 },
        { id: 'in_zero', created: 50, amount_paid: 0 },
      ],
    });
    mocks.listInvoicePayments.mockResolvedValue({
      data: [
        {
          status: 'paid',
          payment: { type: 'payment_intent', payment_intent: 'pi_first' },
        },
      ],
    });
    mocks.createRefund.mockResolvedValue({ id: 're_1', amount: 1200 });
    mocks.cancelSubscription.mockResolvedValue({ status: 'canceled' });
  });

  it('refunds the first paid invoice with an idempotency key, then cancels', async () => {
    await expect(
      refundFirstMonthAndCancel({
        subscriptionId: 'sub_1',
        idempotencyKey: KEY,
      })
    ).resolves.toEqual({ refundId: 're_1', amount: 1200, canceled: true });

    expect(mocks.listInvoicePayments).toHaveBeenCalledWith({
      invoice: 'in_first',
      limit: 10,
    });
    expect(mocks.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent: 'pi_first',
        amount: 1200,
        metadata: expect.objectContaining({
          source: 'claim_verification_rejected',
          invoice: 'in_first',
        }),
      }),
      { idempotencyKey: KEY }
    );
    expect(mocks.cancelSubscription).toHaveBeenCalledWith('sub_1');
    expect(mocks.createRefund.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.cancelSubscription.mock.invocationCallOrder[0]
    );
  });

  it('treats an already-refunded charge and canceled subscription as done', async () => {
    mocks.createRefund.mockRejectedValue(
      Object.assign(new Error('refunded'), { code: 'charge_already_refunded' })
    );
    mocks.cancelSubscription.mockRejectedValue(
      Object.assign(new Error('gone'), { code: 'resource_missing' })
    );
    await expect(
      refundFirstMonthAndCancel({
        subscriptionId: 'sub_1',
        idempotencyKey: KEY,
      })
    ).resolves.toEqual({ refundId: null, amount: 1200, canceled: true });
  });

  it('does not cancel when the refund fails for another reason', async () => {
    mocks.createRefund.mockRejectedValue(new Error('card_declined'));
    await expect(
      refundFirstMonthAndCancel({
        subscriptionId: 'sub_1',
        idempotencyKey: KEY,
      })
    ).rejects.toThrow('card_declined');
    expect(mocks.cancelSubscription).not.toHaveBeenCalled();
  });

  it('only cancels when nothing was ever paid', async () => {
    mocks.listInvoices.mockResolvedValue({ data: [] });
    await expect(
      refundFirstMonthAndCancel({
        subscriptionId: 'sub_1',
        idempotencyKey: KEY,
      })
    ).resolves.toEqual({ refundId: null, amount: null, canceled: true });
    expect(mocks.createRefund).not.toHaveBeenCalled();
    expect(mocks.cancelSubscription).toHaveBeenCalledWith('sub_1');
  });
});
