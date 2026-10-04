import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSelect = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockProcessStripeWebhookEvent = vi.hoisted(() => vi.fn());
const mockMerchCheckout = vi.hoisted(() => vi.fn());
const mockMerchRefund = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: { select: mockSelect, update: mockUpdate },
}));
vi.mock('@/lib/stripe/webhooks/process-event', () => ({
  processStripeWebhookEvent: mockProcessStripeWebhookEvent,
}));
vi.mock('@/lib/merch/orders', () => ({
  handleMerchChargeRefunded: mockMerchRefund,
  handleMerchCheckoutCompleted: mockMerchCheckout,
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import {
  parseStoredEvent,
  replayUnprocessedStripeWebhooks,
} from '@/lib/billing/webhook-replay';

const now = new Date('2026-10-04T12:00:00.000Z');

function selectRows(rows: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        orderBy: () => ({ limit: () => Promise.resolve(rows) }),
      }),
    }),
  };
}

function updateReturning(rows: { id: string }[]) {
  return {
    set: () => ({
      where: () => ({ returning: () => Promise.resolve(rows) }),
    }),
  };
}

function updateWithoutReturning() {
  return {
    set: () => ({ where: () => Promise.resolve() }),
  };
}

function candidate(id: string, type: string, object: Record<string, unknown>) {
  return {
    id: 'row_1',
    stripeEventId: id,
    type,
    stripeCreatedAt: new Date('2026-10-01T00:00:00.000Z'),
    payload: {
      id,
      type,
      created: 1_759_276_800,
      data: { object },
    },
  };
}

describe('parseStoredEvent', () => {
  it('rejects payload identity that does not match the durable row', () => {
    expect(
      parseStoredEvent({
        stripeEventId: 'evt_expected',
        type: 'customer.subscription.updated',
        stripeCreatedAt: now,
        payload: {
          id: 'evt_other',
          type: 'customer.subscription.updated',
          data: { object: {} },
        },
      })
    ).toBeNull();
  });
});

describe('replayUnprocessedStripeWebhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReset();
    mockUpdate.mockReset();
    mockProcessStripeWebhookEvent.mockReset();
    mockProcessStripeWebhookEvent.mockResolvedValue(undefined);
    mockMerchCheckout.mockResolvedValue(undefined);
    mockMerchRefund.mockResolvedValue(undefined);
  });

  it('re-drives a stored event through the canonical processor and marks it', async () => {
    mockSelect.mockReturnValueOnce(
      selectRows([
        candidate('evt_sub', 'customer.subscription.updated', {
          id: 'sub_1',
        }),
      ])
    );
    mockUpdate
      .mockReturnValueOnce(updateReturning([{ id: 'row_1' }]))
      .mockReturnValueOnce(updateReturning([{ id: 'row_1' }]));

    const summary = await replayUnprocessedStripeWebhooks(now);

    expect(summary).toEqual({ processed: 1, blocked: [], failed: [] });
    expect(mockProcessStripeWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'evt_sub' }),
      new Date(1_759_276_800 * 1000)
    );
  });

  it('routes stored merch checkout through the merch processor', async () => {
    mockSelect.mockReturnValueOnce(
      selectRows([
        candidate('evt_merch', 'checkout.session.completed', {
          id: 'cs_1',
          metadata: { merch_order_id: 'order_1' },
        }),
      ])
    );
    mockUpdate
      .mockReturnValueOnce(updateReturning([{ id: 'row_1' }]))
      .mockReturnValueOnce(updateReturning([{ id: 'row_1' }]));

    const summary = await replayUnprocessedStripeWebhooks(now);

    expect(summary.processed).toBe(1);
    expect(mockMerchCheckout).toHaveBeenCalledOnce();
    expect(mockProcessStripeWebhookEvent).not.toHaveBeenCalled();
  });

  it('records a reason instead of allowing replay to mutate Stripe', async () => {
    mockSelect.mockReturnValueOnce(
      selectRows([
        candidate('evt_refund', 'charge.refunded', {
          id: 'ch_1',
          payment_intent: null,
        }),
      ])
    );
    mockUpdate
      .mockReturnValueOnce(updateReturning([{ id: 'row_1' }]))
      .mockReturnValueOnce(updateWithoutReturning());

    const summary = await replayUnprocessedStripeWebhooks(now);

    expect(summary.processed).toBe(0);
    expect(summary.failed).toEqual([]);
    expect(summary.blocked).toEqual([
      expect.objectContaining({
        stripeEventId: 'evt_refund',
        reason: expect.stringContaining('Stripe Dashboard'),
      }),
    ]);
    expect(mockProcessStripeWebhookEvent).not.toHaveBeenCalled();
  });

  it('keeps a failed processor event unprocessed and records the reason', async () => {
    mockSelect.mockReturnValueOnce(
      selectRows([
        candidate('evt_failed', 'invoice.payment_failed', { id: 'in_1' }),
      ])
    );
    mockUpdate
      .mockReturnValueOnce(updateReturning([{ id: 'row_1' }]))
      .mockReturnValueOnce(updateWithoutReturning());
    mockProcessStripeWebhookEvent.mockRejectedValue(
      new Error('billing write failed')
    );

    const summary = await replayUnprocessedStripeWebhooks(now);

    expect(summary).toMatchObject({
      processed: 0,
      blocked: [],
      failed: [
        {
          stripeEventId: 'evt_failed',
          type: 'invoice.payment_failed',
          reason: 'billing write failed',
        },
      ],
    });
  });
});
