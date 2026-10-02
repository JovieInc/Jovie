import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSelect = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockProcessStripeWebhookEvent = vi.hoisted(() => vi.fn());
const mockHandleMerchCheckoutCompleted = vi.hoisted(() => vi.fn());
const mockHandleMerchChargeRefunded = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
  },
}));

vi.mock('@/lib/stripe/webhooks/process-event', () => ({
  processStripeWebhookEvent: mockProcessStripeWebhookEvent,
}));

vi.mock('@/lib/merch/orders', () => ({
  handleMerchCheckoutCompleted: mockHandleMerchCheckoutCompleted,
  handleMerchChargeRefunded: mockHandleMerchChargeRefunded,
}));

vi.mock('@/lib/stripe/webhooks/handlers/charge-handler', () => {
  class StripeWriteBlockedError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'StripeWriteBlockedError';
    }
  }
  return { StripeWriteBlockedError };
});

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import {
  parseStoredEvent,
  replayUnprocessedStripeWebhooks,
} from '@/lib/billing/webhook-replay';
import { StripeWriteBlockedError } from '@/lib/stripe/webhooks/handlers/charge-handler';

const now = new Date('2026-10-02T23:00:00.000Z');

function selectChain(rows: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        orderBy: () => ({
          limit: () => Promise.resolve(rows),
        }),
        limit: () => Promise.resolve(rows),
      }),
    }),
  };
}

function updateChain(returned: { id: string }[]) {
  const query = Promise.resolve(returned) as Promise<{ id: string }[]> & {
    returning: () => Promise<{ id: string }[]>;
  };
  query.returning = () => Promise.resolve(returned);
  return {
    set: () => ({
      where: () => query,
    }),
  };
}

function storedEvent(overrides: {
  id: string;
  type: string;
  object: Record<string, unknown>;
}) {
  return {
    id: 'row_1',
    stripeEventId: overrides.id,
    type: overrides.type,
    stripeCreatedAt: new Date('2026-10-01T00:00:00.000Z'),
    payload: {
      id: overrides.id,
      type: overrides.type,
      created: 1_759_276_800,
      data: { object: overrides.object },
    },
  };
}

describe('parseStoredEvent', () => {
  it('rejects a payload whose id or type does not match the row', () => {
    expect(
      parseStoredEvent({
        stripeEventId: 'evt_1',
        type: 'customer.subscription.updated',
        stripeCreatedAt: now,
        payload: {
          id: 'evt_other',
          type: 'customer.subscription.updated',
          created: 1,
          data: { object: { id: 'sub_1' } },
        },
      })
    ).toBeNull();
  });

  it('accepts a stored Stripe event', () => {
    const event = parseStoredEvent({
      stripeEventId: 'evt_1',
      type: 'customer.subscription.updated',
      stripeCreatedAt: null,
      payload: {
        id: 'evt_1',
        type: 'customer.subscription.updated',
        created: 1_700_000_000,
        data: { object: { id: 'sub_1' } },
      },
    });
    expect(event?.id).toBe('evt_1');
    expect(event?.created).toBe(1_700_000_000);
  });
});

describe('replayUnprocessedStripeWebhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReset();
    mockUpdate.mockReset();
    mockProcessStripeWebhookEvent.mockReset();
    mockProcessStripeWebhookEvent.mockResolvedValue(undefined);
    mockHandleMerchCheckoutCompleted.mockResolvedValue(undefined);
    mockHandleMerchChargeRefunded.mockResolvedValue(undefined);
  });

  it('processes a stored subscription event without Stripe writes and marks it', async () => {
    const candidate = storedEvent({
      id: 'evt_sub',
      type: 'customer.subscription.updated',
      object: { id: 'sub_1' },
    });
    mockSelect.mockReturnValueOnce(selectChain([candidate]));
    mockUpdate
      .mockReturnValueOnce(updateChain([{ id: 'row_1' }]))
      .mockReturnValueOnce(updateChain([{ id: 'row_1' }]));

    const summary = await replayUnprocessedStripeWebhooks(now);

    expect(summary).toEqual({ processed: 1, blocked: [], failed: [] });
    expect(mockProcessStripeWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'evt_sub' }),
      expect.any(Date),
      { stripeWritesAllowed: false }
    );
    expect(mockHandleMerchCheckoutCompleted).not.toHaveBeenCalled();
  });

  it('routes a merch checkout away from the subscription handler', async () => {
    const candidate = storedEvent({
      id: 'evt_merch',
      type: 'checkout.session.completed',
      object: { id: 'cs_1', metadata: { merch_order_id: 'order_1' } },
    });
    mockSelect.mockReturnValueOnce(selectChain([candidate]));
    mockUpdate
      .mockReturnValueOnce(updateChain([{ id: 'row_1' }]))
      .mockReturnValueOnce(updateChain([{ id: 'row_1' }]));

    const summary = await replayUnprocessedStripeWebhooks(now);

    expect(summary.processed).toBe(1);
    expect(mockHandleMerchCheckoutCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cs_1' })
    );
    expect(mockProcessStripeWebhookEvent).not.toHaveBeenCalled();
  });

  it('leaves a cancelable refund unprocessed and records the dashboard action', async () => {
    const candidate = storedEvent({
      id: 'evt_refund',
      type: 'charge.refunded',
      object: { id: 'ch_1' },
    });
    mockSelect.mockReturnValueOnce(selectChain([candidate]));
    mockUpdate
      .mockReturnValueOnce(updateChain([{ id: 'row_1' }]))
      .mockReturnValueOnce(updateChain([]));
    mockProcessStripeWebhookEvent.mockRejectedValue(
      new StripeWriteBlockedError(
        'Stripe Dashboard: open subscription sub_1 (status active) and cancel it.'
      )
    );

    const summary = await replayUnprocessedStripeWebhooks(now);

    expect(summary.processed).toBe(0);
    expect(summary.failed).toEqual([]);
    expect(summary.blocked).toEqual([
      {
        stripeEventId: 'evt_refund',
        type: 'charge.refunded',
        action: expect.stringContaining('subscription sub_1'),
      },
    ]);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  it('does not mark an event processed when the handler throws', async () => {
    const candidate = storedEvent({
      id: 'evt_fail',
      type: 'invoice.payment_failed',
      object: { id: 'in_1' },
    });
    mockSelect.mockReturnValueOnce(selectChain([candidate]));
    mockUpdate
      .mockReturnValueOnce(updateChain([{ id: 'row_1' }]))
      .mockReturnValueOnce(updateChain([]));
    mockProcessStripeWebhookEvent.mockRejectedValue(
      new Error('db write failed')
    );

    const summary = await replayUnprocessedStripeWebhooks(now);

    expect(summary.processed).toBe(0);
    expect(summary.failed).toEqual([
      {
        stripeEventId: 'evt_fail',
        type: 'invoice.payment_failed',
        error: 'db write failed',
      },
    ]);
  });
});
