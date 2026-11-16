import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { merchFulfillmentJobs } from '@/lib/db/schema/merch';

const hoisted = vi.hoisted(() => ({
  dbSelect: vi.fn(),
  dbInsert: vi.fn(),
  dbUpdate: vi.fn(),
  stripeSessionCreate: vi.fn(),
  resolveReleaseWorkflowRunIdForMerchCard: vi.fn().mockResolvedValue(null),
  refreshMerchRank: vi.fn(),
  resolveVariantId: vi.fn().mockReturnValue(501),
  kickQueue: vi.fn(),
  printfulConfirmOrder: vi.fn(),
  printfulCreateDraftOrder: vi.fn(),
  printfulIsConfigured: vi.fn().mockReturnValue(true),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.dbSelect,
    insert: hoisted.dbInsert,
    update: hoisted.dbUpdate,
  },
}));

vi.mock('@/lib/cron/kick-queue', () => ({
  kickQueue: hoisted.kickQueue,
}));

vi.mock('@/lib/printful/client', () => ({
  confirmOrder: hoisted.printfulConfirmOrder,
  createDraftOrder: hoisted.printfulCreateDraftOrder,
  isPrintfulConfigured: hoisted.printfulIsConfigured,
}));

vi.mock('@/lib/release-to-revenue/gmv-attribution', () => ({
  RELEASE_GMV_ATTRIBUTION_METADATA_KEY: 'release_workflow_run_id',
  resolveReleaseWorkflowRunIdForMerchCard:
    hoisted.resolveReleaseWorkflowRunIdForMerchCard,
}));

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    checkout: {
      sessions: { create: hoisted.stripeSessionCreate },
    },
  },
}));

vi.mock('./first-sale-text', () => ({
  isPriorMerchSaleStatus: vi.fn().mockReturnValue(false),
  notifyFirstMerchSaleBestEffort: vi.fn(),
}));

vi.mock('./safety', () => ({
  assertMerchCardCheckoutSellable: vi.fn(),
  assertMerchOrderSellable: vi.fn(),
  getMerchCardSellability: vi
    .fn()
    .mockReturnValue({ sellable: true, reasons: [] }),
  getMerchOrderSellability: vi
    .fn()
    .mockReturnValue({ sellable: true, reasons: [] }),
}));

vi.mock('./service', () => ({
  refreshMerchRank: hoisted.refreshMerchRank,
  resolveVariantId: hoisted.resolveVariantId,
}));

import type Stripe from 'stripe';
import { notifyFirstMerchSaleBestEffort } from './first-sale-text';

import {
  fulfillMerchOrder,
  handleMerchCheckoutCompleted,
  handleMerchCheckoutPaymentFailed,
  processMerchFulfillmentJobs,
} from './orders';

const CARD = {
  id: 'card-1',
  creatorProfileId: 'profile-1',
  title: 'Launch Tee',
  description: 'Tour tee',
  primaryImageUrl: 'https://cdn.example.com/tee.png',
  retailPriceCents: 4000,
  estimatedShippingCostCents: 500,
  estimatedPrintfulProductCostCents: 1200,
  artistRoyaltyRateBps: 7000,
  printful: { variantMap: { 'tee-black-m': 501 } },
};

const ORDER = {
  id: 'order-1',
  creatorProfileId: 'profile-1',
  merchCardId: 'card-1',
  status: 'checkout_created',
  printfulExternalId: 'jovie_merch_test',
  printfulOrderId: null,
  printfulStatus: null,
  stripeCheckoutSessionId: 'cs_test_session',
  stripePaymentIntentId: null,
  selectedVariantId: 501,
  selectedVariantKey: 'tee-black-m',
  quantity: 1,
  currency: 'USD',
  subtotalCents: 4000,
  shippingCents: 500,
  taxCents: 0,
  totalCents: 4500,
  stripeFeeEstimateCents: 100,
  printfulProductCostCents: 1200,
  printfulShippingCostCents: 500,
  refundReserveCents: 200,
  artistPayoutEstimateCents: 1900,
  jovieShareEstimateCents: 100,
  buyerEmail: null,
  buyerName: null,
  shippingAddress: null,
  paidAt: null,
};

const VALID_SHIPPING_ADDRESS = {
  name: 'Buyer',
  line1: '1 Main St',
  line2: null,
  city: 'Los Angeles',
  state: 'CA',
  postalCode: '90001',
  country: 'US',
  phone: null,
};

const FULFILLMENT_CARD = {
  ...CARD,
  printful: {
    variantMap: { 'tee-black-m': 501 },
    printFileUrls: ['https://printful.example.com/tee.png'],
    placements: ['front'],
    techniques: ['dtg'],
  },
};

const updateSets: Record<string, unknown>[] = [];
const jobSets: Record<string, unknown>[] = [];
const FULFILLMENT_JOB = {
  id: 'job-1',
  merchOrderId: 'order-1',
  attempts: 1,
};
const orderWhereQueries: ReturnType<PgDialect['sqlToQuery']>[] = [];
const dialect = new PgDialect();

/** Awaitable that also supports a trailing `.returning()` (drizzle inserts). */
function thenableWithReturning(rows: unknown[]) {
  const result = Promise.resolve(rows);
  return Object.assign(result, { returning: () => result });
}

function mockOrderAndCardRow(order: unknown, card: unknown = FULFILLMENT_CARD) {
  hoisted.dbSelect.mockReturnValue({
    from: () => ({
      innerJoin: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ order, card }]),
        }),
      }),
    }),
  });
}

function checkoutSession(
  overrides: Record<string, unknown> = {}
): Stripe.Checkout.Session {
  return {
    id: 'cs_test_session',
    metadata: {
      merch_order_id: 'order-1',
      merch_card_id: 'card-1',
      profile_id: 'profile-1',
    },
    mode: 'payment',
    status: 'complete',
    currency: 'usd',
    payment_status: 'paid',
    payment_intent: 'pi_test_1',
    customer_details: { email: 'buyer@example.com', name: 'Buyer' },
    customer_email: null,
    amount_total: 4500,
    customer: 'cus_test_1',
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

describe('handleMerchCheckoutCompleted payment gating (JOV-12769)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateSets.length = 0;
    jobSets.length = 0;
    orderWhereQueries.length = 0;
    hoisted.dbInsert.mockImplementation(() => ({
      values: () => ({
        onConflictDoNothing: () => thenableWithReturning([{ id: 'ledger-1' }]),
      }),
    }));
    hoisted.dbUpdate.mockImplementation(() => ({
      set: (values: Record<string, unknown>) => {
        updateSets.push(values);
        return {
          where: (condition: SQL) => {
            orderWhereQueries.push(dialect.sqlToQuery(condition));
            return Promise.resolve(undefined);
          },
        };
      },
    }));
  });

  it('does not fulfill a session that is not paid yet (unpaid waits for async settlement)', async () => {
    mockOrderAndCardRow({ ...ORDER });

    await handleMerchCheckoutCompleted(
      checkoutSession({ payment_status: 'unpaid' })
    );

    expect(hoisted.dbInsert).not.toHaveBeenCalled();
    expect(hoisted.dbUpdate).not.toHaveBeenCalled();
    expect(hoisted.kickQueue).not.toHaveBeenCalled();
  });

  it('still fulfills a paid session', async () => {
    mockOrderAndCardRow({ ...ORDER });

    await handleMerchCheckoutCompleted(checkoutSession());

    expect(hoisted.dbInsert).toHaveBeenCalledTimes(2);
    expect(updateSets.at(-1)).toMatchObject({ status: 'paid' });
    expect(hoisted.kickQueue).toHaveBeenCalledOnce();
  });

  it.each([
    [
      'positive-priced no-payment session',
      { payment_status: 'no_payment_required' },
    ],
    [
      'unrecognized full discount',
      {
        payment_status: 'no_payment_required',
        amount_total: 0,
        payment_intent: null,
      },
    ],
    [
      'missing amount',
      { payment_status: 'no_payment_required', amount_total: null },
    ],
    [
      'setup session',
      { payment_status: 'no_payment_required', mode: 'setup', amount_total: 0 },
    ],
    [
      'shipping still due',
      { payment_status: 'no_payment_required', amount_total: 500 },
    ],
    ['wrong paid amount', { amount_total: 1 }],
    ['wrong currency', { currency: 'eur' }],
    ['wrong session', { id: 'cs_other' }],
    [
      'wrong profile',
      {
        metadata: {
          merch_order_id: 'order-1',
          merch_card_id: 'card-1',
          profile_id: 'profile-other',
        },
      },
    ],
    [
      'wrong card',
      {
        metadata: {
          merch_order_id: 'order-1',
          merch_card_id: 'card-other',
          profile_id: 'profile-1',
        },
      },
    ],
    ['incomplete checkout', { status: 'open' }],
  ])('reconciles %s without paid effects', async (_name, overrides) => {
    mockOrderAndCardRow({ ...ORDER });
    await expect(
      handleMerchCheckoutCompleted(checkoutSession(overrides))
    ).rejects.toMatchObject({ reason: 'merch_checkout_mismatch' });
    expect(hoisted.dbInsert).not.toHaveBeenCalled();
    expect(hoisted.dbUpdate).not.toHaveBeenCalled();
    expect(hoisted.kickQueue).not.toHaveBeenCalled();
    expect(notifyFirstMerchSaleBestEffort).not.toHaveBeenCalled();
  });

  it('rejects a mismatched already-bound payment intent', async () => {
    mockOrderAndCardRow({ ...ORDER, stripePaymentIntentId: 'pi_original' });
    await expect(
      handleMerchCheckoutCompleted(checkoutSession())
    ).rejects.toMatchObject({ reason: 'merch_checkout_mismatch' });
    expect(hoisted.dbInsert).not.toHaveBeenCalled();
    expect(hoisted.dbUpdate).not.toHaveBeenCalled();
  });

  it('does not promote unpaid fulfillment into a paid retry state', async () => {
    const unpaid = { ...ORDER };
    mockOrderAndCardRow(unpaid);
    await expect(fulfillMerchOrder(unpaid.id)).rejects.toThrow(
      'not fulfillment-ready'
    );
    await expect(fulfillMerchOrder(unpaid.id)).rejects.toThrow(
      'not fulfillment-ready'
    );
    expect(hoisted.dbUpdate).not.toHaveBeenCalled();
    expect(hoisted.printfulCreateDraftOrder).not.toHaveBeenCalled();
    expect(hoisted.printfulConfirmOrder).not.toHaveBeenCalled();
  });

  it('fails a matching async payment only while the same checkout remains unpaid', async () => {
    mockOrderAndCardRow({ ...ORDER });
    await handleMerchCheckoutPaymentFailed(
      checkoutSession({ payment_status: 'unpaid' })
    );
    expect(updateSets.at(-1)).toMatchObject({ status: 'failed' });
    expect(orderWhereQueries.at(-1)?.params).toEqual([
      'order-1',
      'cs_test_session',
      'checkout_created',
    ]);
    expect(hoisted.dbInsert).not.toHaveBeenCalled();
    expect(hoisted.kickQueue).not.toHaveBeenCalled();
  });

  it('rejects an async failure for another checkout without changing the order', async () => {
    mockOrderAndCardRow({ ...ORDER });
    await expect(
      handleMerchCheckoutPaymentFailed(
        checkoutSession({ id: 'cs_other', payment_status: 'unpaid' })
      )
    ).rejects.toMatchObject({ reason: 'merch_checkout_mismatch' });
    expect(hoisted.dbUpdate).not.toHaveBeenCalled();
  });
});

describe('fulfillMerchOrder Printful draft resume (JOV-12770)', () => {
  const DRAFT_ORDER = {
    ...ORDER,
    status: 'printful_draft_created',
    printfulOrderId: '901',
    printfulStatus: 'draft',
    shippingAddress: VALID_SHIPPING_ADDRESS,
    buyerEmail: 'buyer@example.com',
    buyerName: 'Buyer',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    updateSets.length = 0;
    jobSets.length = 0;
    orderWhereQueries.length = 0;
    hoisted.dbUpdate.mockImplementation((table: unknown) => {
      if (table === merchFulfillmentJobs) {
        return {
          set: (values: Record<string, unknown>) => {
            jobSets.push(values);
            return { where: () => thenableWithReturning([FULFILLMENT_JOB]) };
          },
        };
      }
      return {
        set: (values: Record<string, unknown>) => {
          updateSets.push(values);
          return {
            where: (condition: SQL) => {
              orderWhereQueries.push(dialect.sqlToQuery(condition));
              return Promise.resolve(undefined);
            },
          };
        },
      };
    });
  });

  it('creates and confirms a Printful draft for a paid order (unchanged path)', async () => {
    hoisted.printfulCreateDraftOrder.mockResolvedValue({
      id: 900,
      status: 'draft',
    });
    hoisted.printfulConfirmOrder.mockResolvedValue({
      id: 900,
      status: 'pending',
    });
    mockOrderAndCardRow({
      ...ORDER,
      status: 'paid',
      shippingAddress: VALID_SHIPPING_ADDRESS,
      buyerEmail: 'buyer@example.com',
      buyerName: 'Buyer',
    });

    await fulfillMerchOrder('order-1');

    expect(hoisted.printfulCreateDraftOrder).toHaveBeenCalledTimes(1);
    expect(hoisted.printfulConfirmOrder).toHaveBeenCalledWith(900);
    expect(updateSets.at(-1)).toMatchObject({
      status: 'submitted_to_printful',
      printfulOrderId: '900',
    });
  });

  it('resumes the existing Printful draft instead of creating a duplicate', async () => {
    hoisted.printfulConfirmOrder.mockResolvedValue({
      id: 901,
      status: 'pending',
    });
    mockOrderAndCardRow(DRAFT_ORDER);

    await fulfillMerchOrder('order-1');

    expect(hoisted.printfulCreateDraftOrder).not.toHaveBeenCalled();
    expect(hoisted.printfulConfirmOrder).toHaveBeenCalledWith('901');
    expect(updateSets.at(-1)).toMatchObject({
      status: 'submitted_to_printful',
      printfulOrderId: '901',
    });
  });

  it('refuses to resume a draft state that is missing the Printful order id', async () => {
    mockOrderAndCardRow({ ...DRAFT_ORDER, printfulOrderId: null });

    await expect(fulfillMerchOrder('order-1')).rejects.toThrow(
      'without a Printful order id'
    );
    expect(hoisted.printfulCreateDraftOrder).not.toHaveBeenCalled();
    expect(hoisted.printfulConfirmOrder).not.toHaveBeenCalled();
  });

  it.each([
    DRAFT_ORDER,
    ORDER,
    { ...ORDER, status: 'refunded' },
    { ...ORDER, status: 'shipped' },
  ])(
    'preserves protected order state on two worker attempts ($status)',
    async order => {
      // Dispatch on chain shape: the claim query uses .where().orderBy(),
      // the order lookup uses .innerJoin().
      hoisted.dbSelect.mockImplementation(() => ({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: () => Promise.resolve([{ order, card: FULFILLMENT_CARD }]),
            }),
          }),
          where: () => ({
            orderBy: () => ({
              limit: () => Promise.resolve([FULFILLMENT_JOB]),
            }),
          }),
        }),
      }));
      hoisted.printfulConfirmOrder
        .mockRejectedValueOnce(new Error('Printful confirm failed'))
        .mockResolvedValue({ id: 901, status: 'pending' });

      await processMerchFulfillmentJobs();

      expect(jobSets.at(-1)).toMatchObject({ status: 'failed' });
      expect(orderWhereQueries.at(-1)?.sql).toContain(
        '"merch_orders"."status" in ('
      );
      expect(orderWhereQueries.at(-1)?.params).toEqual([
        'order-1',
        'paid',
        'paid_fulfillment_hold',
        'paid_fulfillment_failed',
      ]);

      await processMerchFulfillmentJobs();

      expect(hoisted.printfulCreateDraftOrder).not.toHaveBeenCalled();
      expect(hoisted.printfulConfirmOrder).toHaveBeenCalledTimes(
        order === DRAFT_ORDER ? 2 : 0
      );
      if (order === DRAFT_ORDER)
        expect(updateSets.at(-1)).toMatchObject({
          status: 'submitted_to_printful',
        });
    }
  );
});
