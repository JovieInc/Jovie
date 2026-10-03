import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSelect = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockProcess = vi.hoisted(() => vi.fn());
const mockMerchCheckout = vi.hoisted(() => vi.fn());
const mockMerchRefund = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db', () => ({ db: { select: mockSelect, update: mockUpdate } }));
vi.mock('@/app/api/stripe/webhooks/route', () => ({
  processWebhookEvent: mockProcess,
}));
vi.mock('@/lib/merch/orders', () => ({
  handleMerchCheckoutCompleted: mockMerchCheckout,
  handleMerchChargeRefunded: mockMerchRefund,
}));
vi.mock('@/lib/stripe/webhooks/handlers/charge-handler', () => {
  class StripeWriteBlockedError extends Error {
    constructor(input: { subscriptionId: string; subscriptionStatus: string }) {
      super(
        `Stripe Dashboard: open subscription ${input.subscriptionId} (status ${input.subscriptionStatus})`
      );
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
function selectRows(rows: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        orderBy: () => ({ limit: () => Promise.resolve(rows) }),
        limit: () => Promise.resolve(rows),
      }),
    }),
  };
}
function claim(returned: { id: string }[]) {
  const query = Promise.resolve(returned) as Promise<{ id: string }[]> & {
    returning: () => Promise<{ id: string }[]>;
  };
  query.returning = () => Promise.resolve(returned);
  return { set: () => ({ where: () => query }) };
}
function candidate(id: string, type: string, object: Record<string, unknown>) {
  return {
    id: 'row_1',
    stripeEventId: id,
    type,
    stripeCreatedAt: new Date('2026-10-01T00:00:00.000Z'),
    payload: { id, type, created: 1_759_276_800, data: { object } },
  };
}
async function replay(row: ReturnType<typeof candidate>, marked: boolean) {
  mockSelect.mockReturnValueOnce(selectRows([row]));
  mockUpdate
    .mockReturnValueOnce(claim([{ id: 'row_1' }]))
    .mockReturnValueOnce(claim(marked ? [{ id: 'row_1' }] : []));
  return replayUnprocessedStripeWebhooks(now);
}
describe('parseStoredEvent', () => {
  it('rejects a payload whose id does not match the row', () => {
    expect(
      parseStoredEvent({
        stripeEventId: 'evt_1',
        type: 'customer.subscription.updated',
        stripeCreatedAt: now,
        payload: { id: 'evt_other', type: 'customer.subscription.updated' },
      })
    ).toBeNull();
  });
});
describe('replayUnprocessedStripeWebhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReset();
    mockUpdate.mockReset();
    mockProcess.mockReset();
    mockProcess.mockResolvedValue(undefined);
    mockMerchCheckout.mockResolvedValue(undefined);
    mockMerchRefund.mockResolvedValue(undefined);
  });
  it('replays a stored event with Stripe writes disabled and marks it', async () => {
    const summary = await replay(
      candidate('evt_sub', 'customer.subscription.updated', { id: 'sub_1' }),
      true
    );
    expect(summary).toEqual({ processed: 1, blocked: [], failed: [] });
    expect(mockProcess).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'evt_sub' }),
      expect.any(Date),
      { stripeWritesAllowed: false }
    );
  });
  it('routes merch checkout away from the subscription handler', async () => {
    const summary = await replay(
      candidate('evt_merch', 'checkout.session.completed', {
        id: 'cs_1',
        metadata: { merch_order_id: 'order_1' },
      }),
      true
    );
    expect(summary.processed).toBe(1);
    expect(mockMerchCheckout).toHaveBeenCalled();
    expect(mockProcess).not.toHaveBeenCalled();
  });
  it('leaves a blocked Stripe write unprocessed', async () => {
    mockProcess.mockRejectedValue(
      new StripeWriteBlockedError({
        subscriptionId: 'sub_1',
        chargeId: 'ch_1',
        subscriptionStatus: 'active',
        eventType: 'charge.refunded',
      })
    );
    const summary = await replay(
      candidate('evt_refund', 'charge.refunded', { id: 'ch_1' }),
      false
    );
    expect(summary.processed).toBe(0);
    expect(summary.failed).toEqual([]);
    expect(summary.blocked[0]?.action).toContain('subscription sub_1');
  });
  it('does not mark a thrown handler processed', async () => {
    mockProcess.mockRejectedValue(new Error('db write failed'));
    const summary = await replay(
      candidate('evt_fail', 'invoice.payment_failed', { id: 'in_1' }),
      false
    );
    expect(summary).toMatchObject({
      processed: 0,
      failed: [
        {
          stripeEventId: 'evt_fail',
          type: 'invoice.payment_failed',
          error: 'db write failed',
        },
      ],
    });
  });
});
