import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn());
const mockProcess = vi.hoisted(() => vi.fn());
const mockMerchCheckout = vi.hoisted(() => vi.fn());
const mockMerchRefund = vi.hoisted(() => vi.fn());
const mockFileIssue = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
}));

vi.mock('@/lib/db/schema/billing', () => ({
  stripeWebhookEvents: {
    id: 'id',
    stripeEventId: 'stripeEventId',
    type: 'type',
    payload: 'payload',
    stripeCreatedAt: 'stripeCreatedAt',
    createdAt: 'createdAt',
    processedAt: 'processedAt',
    processingStartedAt: 'processingStartedAt',
  },
}));

vi.mock('@/lib/stripe/webhooks/process-verified-event', () => ({
  processVerifiedStripeEvent: mockProcess,
}));

vi.mock('@/lib/merch/orders', () => ({
  handleMerchCheckoutCompleted: mockMerchCheckout,
  handleMerchChargeRefunded: mockMerchRefund,
}));

vi.mock('@/lib/billing/webhook-remediation-issue', () => ({
  fileBillingWebhookRemediationIssue: mockFileIssue,
}));

function selectRows(rows: unknown[]) {
  mockDbSelect.mockReturnValue({
    from: () => ({
      where: () => ({
        orderBy: () => ({
          limit: () => Promise.resolve(rows),
        }),
      }),
    }),
  });
}

function updateReturning(rows: unknown[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ returning });
  mockDbUpdate.mockReturnValue({
    set: () => ({ where }),
  });
  return { where };
}

describe('reprocessUnprocessedStripeWebhookEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProcess.mockResolvedValue(undefined);
    mockMerchCheckout.mockResolvedValue(undefined);
    mockMerchRefund.mockResolvedValue(undefined);
    mockFileIssue.mockResolvedValue(undefined);
  });

  it('logs a subscription-state event and processes it with the billing handler', async () => {
    const createdAt = new Date('2026-09-01T00:00:00.000Z');
    selectRows([
      {
        id: 'row-1',
        stripeEventId: 'evt_sub',
        type: 'customer.subscription.updated',
        stripeCreatedAt: createdAt,
        createdAt,
        payload: {
          id: 'evt_sub',
          type: 'customer.subscription.updated',
          data: { object: { id: 'sub_1', status: 'active' } },
        },
      },
    ]);
    updateReturning([{ id: 'row-1' }]);

    const { reprocessUnprocessedStripeWebhookEvents } = await import(
      '@/lib/stripe/webhooks/reprocess-unprocessed'
    );
    const stats = await reprocessUnprocessedStripeWebhookEvents();

    expect(stats.processed).toBe(1);
    expect(stats.subscriptionStateEventIds).toEqual(['evt_sub']);
    expect(mockProcess).toHaveBeenCalledOnce();
    expect(mockMerchCheckout).not.toHaveBeenCalled();
    expect(mockFileIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        examined: 1,
        processed: 1,
        subscriptionStateEventIds: ['evt_sub'],
      })
    );
  });

  it('sends merch checkout to the merch handler only', async () => {
    const createdAt = new Date('2026-09-02T00:00:00.000Z');
    selectRows([
      {
        id: 'row-2',
        stripeEventId: 'evt_merch',
        type: 'checkout.session.completed',
        stripeCreatedAt: createdAt,
        createdAt,
        payload: {
          id: 'evt_merch',
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_merch',
              metadata: { merch_order_id: 'order-1' },
            },
          },
        },
      },
    ]);
    updateReturning([{ id: 'row-2' }]);

    const { reprocessUnprocessedStripeWebhookEvents } = await import(
      '@/lib/stripe/webhooks/reprocess-unprocessed'
    );
    const stats = await reprocessUnprocessedStripeWebhookEvents();

    expect(stats.processed).toBe(1);
    expect(stats.subscriptionStateEventIds).toEqual([]);
    expect(mockMerchCheckout).toHaveBeenCalledOnce();
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it('runs merch refund lookup and the billing handler for charge.refunded', async () => {
    const createdAt = new Date('2026-09-03T00:00:00.000Z');
    selectRows([
      {
        id: 'row-3',
        stripeEventId: 'evt_refund',
        type: 'charge.refunded',
        stripeCreatedAt: createdAt,
        createdAt,
        payload: {
          id: 'evt_refund',
          type: 'charge.refunded',
          data: { object: { id: 'ch_1', payment_intent: 'pi_1' } },
        },
      },
    ]);
    updateReturning([{ id: 'row-3' }]);

    const { reprocessUnprocessedStripeWebhookEvents } = await import(
      '@/lib/stripe/webhooks/reprocess-unprocessed'
    );
    await reprocessUnprocessedStripeWebhookEvents();

    expect(mockMerchRefund).toHaveBeenCalledOnce();
    expect(mockProcess).toHaveBeenCalledOnce();
  });

  it('does not mark an unreadable payload processed', async () => {
    selectRows([
      {
        id: 'row-4',
        stripeEventId: 'evt_bad',
        type: 'invoice.payment_succeeded',
        stripeCreatedAt: null,
        createdAt: new Date('2026-09-04T00:00:00.000Z'),
        payload: {},
      },
    ]);

    const { reprocessUnprocessedStripeWebhookEvents } = await import(
      '@/lib/stripe/webhooks/reprocess-unprocessed'
    );
    const stats = await reprocessUnprocessedStripeWebhookEvents();

    expect(stats.failed).toBe(1);
    expect(stats.processed).toBe(0);
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockProcess).not.toHaveBeenCalled();
    expect(mockFileIssue).toHaveBeenCalled();
  });
});
