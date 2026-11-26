import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockConstructEvent = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockHandleCheckout = vi.hoisted(() => vi.fn());
const mockHandlePaymentFailed = vi.hoisted(() => vi.fn());
const mockHandleRefund = vi.hoisted(() => vi.fn());
const mockEnv = vi.hoisted(() => ({
  STRIPE_WEBHOOK_SECRET_MERCH: 'whsec_test' as string | undefined,
}));
vi.mock('@/lib/env-server', () => ({
  env: mockEnv,
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
  handleMerchCheckoutPaymentFailed: mockHandlePaymentFailed,
  handleMerchChargeRefunded: mockHandleRefund,
}));
vi.mock('@/lib/error-tracking', () => ({ captureCriticalError: vi.fn() }));

import { StripeReconciliationRequiredError } from '@/lib/stripe/webhooks/reconciliation';

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
describe('POST /api/webhooks/stripe-merch claim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.STRIPE_WEBHOOK_SECRET_MERCH = 'whsec_test';
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

  it('returns 500 when the merch webhook secret is not configured', async () => {
    mockEnv.STRIPE_WEBHOOK_SECRET_MERCH = undefined;
    const { POST } = await import('@/app/api/webhooks/stripe-merch/route');
    const response = await POST(
      new NextRequest('http://localhost/api/webhooks/stripe-merch', {
        method: 'POST',
        body: '{}',
      })
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Webhook not configured' });
    expect(mockConstructEvent).not.toHaveBeenCalled();
  });

  it('returns 400 when stripe-signature is missing', async () => {
    const { POST } = await import('@/app/api/webhooks/stripe-merch/route');
    const response = await POST(
      new NextRequest('http://localhost/api/webhooks/stripe-merch', {
        method: 'POST',
        body: '{}',
      })
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'No signature' });
    expect(mockConstructEvent).not.toHaveBeenCalled();
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

  it('acknowledges already-processed events without re-running handlers', async () => {
    mockSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              { id: 'row_1', processedAt: new Date('2026-01-01T00:00:00Z') },
            ]),
        }),
      }),
    });
    const { POST } = await import('@/app/api/webhooks/stripe-merch/route');
    const response = await POST(makeMerchPostRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(mockHandleCheckout).not.toHaveBeenCalled();
    expect(mockHandleRefund).not.toHaveBeenCalled();
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

function makeMerchPostRequest() {
  return new NextRequest('http://localhost/api/webhooks/stripe-merch', {
    method: 'POST',
    body: '{}',
    headers: { 'stripe-signature': 'sig_test' },
  });
}

describe('POST /api/webhooks/stripe-merch async payment routing (JOV-12769)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockReturnValue({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: () => Promise.resolve([{ id: 'row_1' }]),
        }),
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
      set: () => ({
        where: () => ({ returning: () => Promise.resolve([{ id: 'row_1' }]) }),
      }),
    });
  });

  it('routes checkout.session.async_payment_succeeded to the merch checkout handler', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_async_paid',
      type: 'checkout.session.async_payment_succeeded',
      created: 1_700_000_000,
      data: {
        object: { id: 'cs_async', metadata: { merch_order_id: 'order_1' } },
      },
    });

    const { POST } = await import('@/app/api/webhooks/stripe-merch/route');
    const response = await POST(makeMerchPostRequest());

    expect(response.status).toBe(200);
    expect(mockHandleCheckout).toHaveBeenCalledTimes(1);
    expect(mockHandlePaymentFailed).not.toHaveBeenCalled();
  });

  it('routes checkout.session.async_payment_failed to the payment-failed handler', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_async_failed',
      type: 'checkout.session.async_payment_failed',
      created: 1_700_000_000,
      data: {
        object: { id: 'cs_async', metadata: { merch_order_id: 'order_1' } },
      },
    });

    const { POST } = await import('@/app/api/webhooks/stripe-merch/route');
    const response = await POST(makeMerchPostRequest());

    expect(response.status).toBe(200);
    expect(mockHandlePaymentFailed).toHaveBeenCalledTimes(1);
    expect(mockHandleCheckout).not.toHaveBeenCalled();
  });

  it('routes charge.refunded to the refund handler and marks processed', async () => {
    const sets: Record<string, unknown>[] = [];
    mockUpdate.mockReturnValue({
      set: (values: Record<string, unknown>) => {
        sets.push(values);
        return {
          where: () => ({
            returning: () => Promise.resolve([{ id: 'row_1' }]),
          }),
        };
      },
    });
    mockConstructEvent.mockReturnValue({
      id: 'evt_refund',
      type: 'charge.refunded',
      created: 1_700_000_000,
      data: { object: { id: 'ch_1', refunded: true } },
    });

    const { POST } = await import('@/app/api/webhooks/stripe-merch/route');
    const response = await POST(makeMerchPostRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(mockHandleRefund).toHaveBeenCalledTimes(1);
    expect(mockHandleCheckout).not.toHaveBeenCalled();
    expect(sets).toContainEqual(
      expect.objectContaining({
        processedAt: expect.any(Date),
        processingStartedAt: null,
      })
    );
  });

  it('acks unhandled event types without calling merch handlers', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_other',
      type: 'customer.created',
      created: 1_700_000_000,
      data: { object: { id: 'cus_1' } },
    });

    const { POST } = await import('@/app/api/webhooks/stripe-merch/route');
    const response = await POST(makeMerchPostRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(mockHandleCheckout).not.toHaveBeenCalled();
    expect(mockHandlePaymentFailed).not.toHaveBeenCalled();
    expect(mockHandleRefund).not.toHaveBeenCalled();
  });
});
