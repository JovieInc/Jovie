import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockConstructEvent = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockHandleCheckout = vi.hoisted(() => vi.fn());
vi.mock('@/lib/env-server', () => ({
  env: { STRIPE_WEBHOOK_SECRET_MERCH: 'whsec_test' },
}));
vi.mock('@/lib/stripe/client', () => ({
  stripe: { webhooks: { constructEvent: mockConstructEvent } },
}));
vi.mock('@/lib/db', () => ({
  db: { insert: mockInsert, select: mockSelect, update: mockUpdate },
}));
vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: vi.fn(
    (operation: (tx: Record<string, unknown>) => unknown) =>
      operation({
        insert: mockInsert,
        select: mockSelect,
        update: mockUpdate,
      })
  ),
}));
vi.mock('@/lib/merch/orders', () => ({
  handleMerchCheckoutCompleted: mockHandleCheckout,
  handleMerchChargeRefunded: vi.fn(),
}));
vi.mock('@/lib/error-tracking', () => ({ captureCriticalError: vi.fn() }));

import { StripeReconciliationRequiredError } from '@/lib/stripe/webhooks/reconciliation';

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
describe('POST /api/webhooks/stripe-merch claim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConstructEvent.mockReturnValue({
      id: 'evt_merch',
      type: 'checkout.session.completed',
      created: 1_700_000_000,
      data: { object: { id: 'cs_merch' } },
    });
    mockInsert.mockReturnValue({
      values: () => ({
        onConflictDoNothing: () => ({ returning: () => Promise.resolve([]) }),
      }),
    });
    mockSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ id: 'row_1', processedAt: null }]),
        }),
      }),
    });
    mockUpdate.mockReturnValue({
      set: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }),
    });
  });
  it('returns 503 when another worker already holds the lease', async () => {
    const { POST } = await import('@/app/api/webhooks/stripe-merch/route');
    const response = await POST(
      new NextRequest('http://localhost/api/webhooks/stripe-merch', {
        method: 'POST',
        body: '{}',
        headers: { 'stripe-signature': 'sig_test' },
      })
    );
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('5');
    expect(await response.json()).toEqual({
      error: 'Webhook processing in progress',
    });
    expect(mockHandleCheckout).not.toHaveBeenCalled();
  });

  function reconciliationScenario(markerWritten: boolean) {
    const sets: Record<string, unknown>[] = [];
    mockUpdate.mockReturnValue({
      set: (values: Record<string, unknown>) => {
        sets.push(values);
        const isMarker = values.reconciliationStatus === 'needs_reconciliation';
        const rows = isMarker && !markerWritten ? [] : [{ id: 'row_1' }];
        const result = Promise.resolve(rows);
        return {
          where: () => ({
            returning: () => result,
            then: result.then.bind(result),
          }),
        };
      },
    });
    mockHandleCheckout.mockRejectedValue(
      new StripeReconciliationRequiredError(
        'merch_order_not_found',
        'Paid merch checkout for unknown order order_1',
        { merchOrderId: 'order_1', amountTotal: 3500 }
      )
    );
    return sets;
  }

  async function post() {
    const { POST } = await import('@/app/api/webhooks/stripe-merch/route');
    return POST(
      new NextRequest('http://localhost/api/webhooks/stripe-merch', {
        method: 'POST',
        body: '{}',
        headers: { 'stripe-signature': 'sig_test' },
      })
    );
  }

  it('acknowledges a paid unknown-order checkout only after queuing it for reconciliation', async () => {
    const sets = reconciliationScenario(true);
    const response = await post();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      received: true,
      reconciliation: 'needs_reconciliation',
    });
    expect(sets).toContainEqual(
      expect.objectContaining({
        reconciliationStatus: 'needs_reconciliation',
        reconciliationReason: 'merch_order_not_found',
      })
    );
    expect(sets).not.toContainEqual(
      expect.objectContaining({ processedAt: expect.any(Date) })
    );
  });

  it('returns 500 so Stripe retries when the reconciliation marker cannot be written', async () => {
    const sets = reconciliationScenario(false);
    const response = await post();

    expect(response.status).toBe(500);
    expect(sets).not.toContainEqual(
      expect.objectContaining({ processedAt: expect.any(Date) })
    );
    expect(sets).toContainEqual({ processingStartedAt: null });
  });
});
