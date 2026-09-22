import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StripeConnectReadiness } from '@/lib/stripe/connect-readiness';

const hoisted = vi.hoisted(() => ({
  dbSelect: vi.fn(),
  dbInsert: vi.fn(),
  dbUpdate: vi.fn(),
  stripeSessionCreate: vi.fn(),
  getStripeConnectReadiness: vi.fn(),
  resolveReleaseWorkflowRunIdForMerchCard: vi.fn().mockResolvedValue(null),
  refreshMerchRank: vi.fn(),
  resolveVariantId: vi.fn().mockReturnValue(501),
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  asc: vi.fn(),
  sql: vi.fn(),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  inArray: vi.fn(),
  ne: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.dbSelect,
    insert: hoisted.dbInsert,
    update: hoisted.dbUpdate,
  },
}));

vi.mock('@/lib/db/schema/merch', () => ({
  merchCards: { __table: 'merch_cards' },
  merchFulfillmentJobs: { __table: 'merch_fulfillment_jobs' },
  merchOrders: { __table: 'merch_orders' },
  merchPayoutLedgerEntries: { __table: 'merch_payout_ledger_entries' },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: { __table: 'creator_profiles' },
}));

vi.mock('@/lib/env-public', () => ({
  publicEnv: { NEXT_PUBLIC_PROFILE_URL: 'https://jov.ie' },
}));

vi.mock('@/lib/printful/client', () => ({
  confirmOrder: vi.fn(),
  createDraftOrder: vi.fn(),
  isPrintfulConfigured: vi.fn().mockReturnValue(true),
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

vi.mock('@/lib/stripe/connect-readiness', () => ({
  getStripeConnectReadiness: hoisted.getStripeConnectReadiness,
  // Mirrors the real fail-closed predicate; the predicate itself is covered
  // by lib/stripe/connect-readiness.test.ts.
  isStripeConnectChargesReady: (readiness: StripeConnectReadiness | null) =>
    readiness !== null &&
    readiness.source !== 'cache-stale-stripe-failed' &&
    readiness.chargesEnabled === true &&
    readiness.payoutsEnabled === true &&
    readiness.detailsSubmitted === true,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('./first-sale-text', () => ({
  isPriorMerchSaleStatus: vi.fn().mockReturnValue(false),
  notifyFirstMerchSaleBestEffort: vi.fn(),
}));

vi.mock('./pricing', () => ({
  estimateStripeFeeCents: vi.fn().mockReturnValue(100),
  MERCH_DEFAULT_REFUND_RESERVE_CENTS: 200,
}));

vi.mock('./safety', () => ({
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

import { createMerchCheckoutSession } from './orders';

const READY: StripeConnectReadiness = {
  stripeAccountId: 'acct_ready',
  chargesEnabled: true,
  payoutsEnabled: true,
  detailsSubmitted: true,
  onboardingComplete: true,
  payoutEmail: null,
  lastSyncedAt: new Date(),
  source: 'stripe',
};

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

const PROFILE: {
  readonly id: string;
  readonly usernameNormalized: string;
  readonly stripeAccountId: string | null;
} = {
  id: 'profile-1',
  usernameNormalized: 'timwhite',
  stripeAccountId: 'acct_ready',
};

function mockCardAndProfileRow(
  row: { card: typeof CARD; profile: typeof PROFILE } | null
) {
  hoisted.dbSelect.mockReturnValue({
    from: () => ({
      innerJoin: () => ({
        where: () => ({
          limit: () => Promise.resolve(row ? [row] : []),
        }),
      }),
    }),
  });
}

const INPUT = {
  merchCardId: 'card-1',
  variantKey: 'tee-black-m',
  quantity: 1,
  handle: 'timwhite',
};

describe('createMerchCheckoutSession Stripe Connect gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.dbInsert.mockReturnValue({
      values: () => ({
        returning: () => Promise.resolve([{ id: 'order-1' }]),
      }),
    });
    hoisted.dbUpdate.mockReturnValue({
      set: () => ({ where: () => Promise.resolve(undefined) }),
    });
    hoisted.stripeSessionCreate.mockResolvedValue({
      id: 'cs_test_1',
      url: 'https://checkout.stripe.com/c/pay/cs_test_1',
    });
    hoisted.getStripeConnectReadiness.mockResolvedValue(READY);
  });

  it('creates a checkout session when charges are enabled', async () => {
    mockCardAndProfileRow({ card: CARD, profile: PROFILE });

    const result = await createMerchCheckoutSession(INPUT);

    expect(hoisted.getStripeConnectReadiness).toHaveBeenCalledWith(
      'acct_ready'
    );
    expect(hoisted.stripeSessionCreate).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      url: 'https://checkout.stripe.com/c/pay/cs_test_1',
      sessionId: 'cs_test_1',
      orderId: 'order-1',
    });
  });

  it.each([
    {
      name: 'profile has no Stripe account',
      stripeAccountId: null,
      readiness: READY,
      expectReadinessCall: false,
    },
    {
      name: 'readiness is unresolvable',
      stripeAccountId: 'acct_x',
      readiness: null,
      expectReadinessCall: true,
    },
    {
      name: 'charges are not enabled',
      stripeAccountId: 'acct_x',
      readiness: { ...READY, chargesEnabled: false },
      expectReadinessCall: true,
    },
    {
      name: 'payouts are not enabled',
      stripeAccountId: 'acct_x',
      readiness: { ...READY, payoutsEnabled: false },
      expectReadinessCall: true,
    },
    {
      name: 'details were never submitted',
      stripeAccountId: 'acct_x',
      readiness: { ...READY, detailsSubmitted: false },
      expectReadinessCall: true,
    },
    {
      name: 'readiness came back from a stale cache that failed refresh',
      stripeAccountId: 'acct_x',
      readiness: { ...READY, source: 'cache-stale-stripe-failed' as const },
      expectReadinessCall: true,
    },
  ])(
    'throws connect-not-ready before touching Stripe when $name',
    async ({ stripeAccountId, readiness, expectReadinessCall }) => {
      mockCardAndProfileRow({
        card: CARD,
        profile: { ...PROFILE, stripeAccountId },
      });
      hoisted.getStripeConnectReadiness.mockResolvedValue(readiness);

      await expect(createMerchCheckoutSession(INPUT)).rejects.toThrow(
        'connect-not-ready'
      );
      if (expectReadinessCall) {
        expect(hoisted.getStripeConnectReadiness).toHaveBeenCalledWith(
          'acct_x'
        );
      } else {
        expect(hoisted.getStripeConnectReadiness).not.toHaveBeenCalled();
      }
      expect(hoisted.dbInsert).not.toHaveBeenCalled();
      expect(hoisted.stripeSessionCreate).not.toHaveBeenCalled();
    }
  );
});
