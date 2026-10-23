/**
 * Property-based tests for plan-change proration decisions.
 *
 * Locks the pure classification laws behind upgrade/downgrade handling:
 * - the plan hierarchy is a strict total order (irreflexive, asymmetric,
 *   transitive) so upgrades/downgrades are never ambiguous
 * - interval changes are symmetric and never fire for the same interval
 * - previewPlanChange charges immediately only for upgrades (downgrades are
 *   scheduled at period end with immediateAmount 0) and mirrors the preview
 *   invoice's currency and both plans' price details
 */

import fc from 'fast-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  mockStripe,
  mockCaptureError,
  mockGetActivePriceIds,
  mockGetPriceMappingDetails,
  mockPriceMappings,
} = vi.hoisted(() => ({
  mockStripe: {
    prices: { retrieve: vi.fn() },
    subscriptions: { list: vi.fn(), retrieve: vi.fn(), update: vi.fn() },
    invoices: { createPreview: vi.fn() },
    subscriptionSchedules: {
      create: vi.fn(),
      retrieve: vi.fn(),
      release: vi.fn(),
      update: vi.fn(),
    },
  },
  mockCaptureError: vi.fn(),
  mockGetActivePriceIds: vi.fn(),
  mockGetPriceMappingDetails: vi.fn(),
  mockPriceMappings: {} as Record<string, unknown>,
}));

vi.mock('@/lib/stripe/client', () => ({ stripe: mockStripe }));
vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
  captureWarning: vi.fn(),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/stripe/config', () => ({
  getActivePriceIds: mockGetActivePriceIds,
  getPriceMappingDetails: mockGetPriceMappingDetails,
  get ACTIVE_PRICE_MAPPINGS() {
    return mockPriceMappings;
  },
}));

import type { PlanType, PriceMapping } from '@/lib/stripe/config';
import {
  isIntervalChange,
  isPlanUpgrade,
  previewPlanChange,
} from '@/lib/stripe/plan-change';

const planArb = fc.constantFrom<PlanType>('free', 'pro', 'max');
const intervalArb = fc.constantFrom<'month' | 'year'>('month', 'year');

const paidMappingArb: fc.Arbitrary<GeneratedMapping> = fc.record({
  priceId: fc.stringMatching(/^price_prop_[a-z0-9_]{1,20}$/),
  plan: fc.constantFrom<PlanType>('pro', 'max'),
  amount: fc.nat({ max: 100_000 }),
  currency: fc.constantFrom('usd', 'eur'),
  interval: intervalArb,
  description: fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{0,15}$/),
});

interface GeneratedMapping {
  priceId: string;
  plan: PlanType;
  amount: number;
  currency: string;
  interval: 'month' | 'year';
  description: string;
}

const distinctPairArb = fc
  .tuple(paidMappingArb, paidMappingArb)
  .filter(([current, target]) => current.priceId !== target.priceId);

const periodEnd = 4_102_444_800;
const periodStart = periodEnd - 2_592_000;

function stubPreviewRun(
  current: GeneratedMapping,
  target: GeneratedMapping,
  previewAmountDue: number
) {
  const table: Record<string, PriceMapping> = {
    [current.priceId]: { ...current },
    [target.priceId]: { ...target },
  };
  mockPriceMappings[target.priceId] = table[target.priceId];
  mockGetActivePriceIds.mockReturnValue([current.priceId, target.priceId]);
  mockGetPriceMappingDetails.mockImplementation(
    (priceId: string) => table[priceId] ?? null
  );
  mockStripe.prices.retrieve.mockImplementation(async (priceId: string) => ({
    id: priceId,
    active: true,
    currency: table[priceId].currency,
    unit_amount: table[priceId].amount,
    type: 'recurring',
    billing_scheme: 'per_unit',
    recurring: {
      interval: table[priceId].interval,
      interval_count: 1,
      usage_type: 'licensed',
    },
    transform_quantity: null,
  }));
  mockStripe.subscriptions.list.mockResolvedValue({
    data: [
      {
        id: 'sub_prop',
        status: 'active',
        items: {
          data: [{ id: 'si_prop', price: { id: current.priceId } }],
        },
        current_period_end: periodEnd,
        current_period_start: periodStart,
      },
    ],
  });
  mockStripe.invoices.createPreview.mockResolvedValue({
    amount_due: previewAmountDue,
    currency: target.currency,
    lines: { data: [] },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCaptureError.mockReset();
});

describe('isPlanUpgrade (property)', () => {
  it('is irreflexive: no plan upgrades to itself', () => {
    fc.assert(
      fc.property(planArb, plan => {
        expect(isPlanUpgrade(plan, plan)).toBe(false);
      })
    );
  });

  it('is asymmetric: an upgrade never reverses to another upgrade', () => {
    fc.assert(
      fc.property(planArb, planArb, (a, b) => {
        expect(isPlanUpgrade(a, b) && isPlanUpgrade(b, a)).toBe(false);
      })
    );
  });

  it('is transitive', () => {
    fc.assert(
      fc.property(planArb, planArb, planArb, (a, b, c) => {
        expect(
          !(isPlanUpgrade(a, b) && isPlanUpgrade(b, c)) || isPlanUpgrade(a, c)
        ).toBe(true);
      })
    );
  });

  it('totally orders every distinct pair: exactly one direction upgrades', () => {
    fc.assert(
      fc.property(planArb, planArb, (a, b) => {
        if (a === b) return;
        expect(isPlanUpgrade(a, b) !== isPlanUpgrade(b, a)).toBe(true);
      })
    );
  });
});

describe('isIntervalChange (property)', () => {
  it('never fires for the same interval and is symmetric', () => {
    fc.assert(
      fc.property(intervalArb, intervalArb, (a, b) => {
        expect(isIntervalChange(a, a)).toBe(false);
        expect(isIntervalChange(a, b)).toBe(isIntervalChange(b, a));
      })
    );
  });
});

describe('previewPlanChange proration decision (property)', () => {
  it('charges immediately only for upgrades; downgrades schedule at period end', async () => {
    await fc.assert(
      fc.asyncProperty(
        distinctPairArb,
        fc.integer({ min: -5_000, max: 50_000 }),
        async ([current, target], previewAmountDue) => {
          stubPreviewRun(current, target, previewAmountDue);
          const preview = await previewPlanChange({
            customerId: 'cus_prop',
            newPriceId: target.priceId,
          });
          expect(preview).not.toBeNull();
          if (!preview) return;

          const expectedUpgrade = isPlanUpgrade(current.plan, target.plan);
          expect(preview.isUpgrade).toBe(expectedUpgrade);
          expect(preview.immediateAmount).toBe(
            expectedUpgrade ? previewAmountDue : 0
          );
          expect(preview.currency).toBe(target.currency);
          expect(preview.currentPlan.priceId).toBe(current.priceId);
          expect(preview.currentPlan.interval).toBe(current.interval);
          expect(preview.newPlan.priceId).toBe(target.priceId);
          expect(preview.newPlan.interval).toBe(target.interval);
          if (!expectedUpgrade) {
            expect(preview.effectiveDate.getTime()).toBe(periodEnd * 1000);
          }
        }
      ),
      { numRuns: 60 }
    );
  });
});
