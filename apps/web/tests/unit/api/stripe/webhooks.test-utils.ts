/**
 * Stripe Webhooks Test Utilities
 * Shared mocks and helpers for webhook tests
 */
import { vi } from 'vitest';

// Track if event should be skipped (already processed)
export let skipProcessing = false;

export function setSkipProcessing(value: boolean) {
  skipProcessing = value;
}

// Additional simulation modes for rare idempotency branches in route
// (data race disappear after conflict, unprocessed-retry path for prior failure)
export let simulateRaceDisappear = false;
export let simulateUnprocessedRetry = false;
export let simulateActiveLease = false;
export let simulateLeaseClaimFailure = false;

export function setSimulateRaceDisappear(value: boolean) {
  simulateRaceDisappear = value;
}

export function setSimulateUnprocessedRetry(value: boolean) {
  simulateUnprocessedRetry = value;
}

export function setSimulateActiveLease(value: boolean) {
  simulateActiveLease = value;
}

export function setSimulateLeaseClaimFailure(value: boolean) {
  simulateLeaseClaimFailure = value;
}

export async function getPost() {
  const mod = await import('@/app/api/stripe/webhooks/route');
  return mod.POST;
}

const hoisted = vi.hoisted(() => {
  const mockGetPlan = vi.fn<(priceId: string) => string | null>(
    () => 'standard'
  );

  // Mock db.insert().values().onConflictDoNothing().returning()
  const dbInsert = vi.fn(() => ({
    values: vi.fn(() => ({
      onConflictDoNothing: vi.fn(() => ({
        returning: vi.fn(async () => {
          // Import dynamically to get current control values (supports multiple modes)
          const {
            skipProcessing: skip,
            simulateRaceDisappear: disappear,
            simulateUnprocessedRetry: unproc,
          } = await import('./webhooks.test-utils');
          // Conflict modes return empty (row "exists" per unique)
          return skip || disappear || unproc ? [] : [{ id: 'webhook-1' }];
        }),
      })),
    })),
  }));

  // Mock db.select().from().where().limit()
  const dbSelect = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => {
          const {
            skipProcessing: skip,
            simulateRaceDisappear: disappear,
            simulateUnprocessedRetry: unproc,
          } = await import('./webhooks.test-utils');
          if (disappear) return [];
          if (unproc) return [{ id: 'existing-id', processedAt: null }];
          return skip ? [{ id: 'existing-id', processedAt: new Date() }] : [];
        }),
      })),
    })),
  }));

  // Mock db.update().set().where()
  const dbUpdate = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(async () => {
          const {
            simulateActiveLease: activeLease,
            simulateLeaseClaimFailure: claimFailure,
          } = await import('./webhooks.test-utils');
          if (claimFailure && dbUpdate.mock.calls.length === 1) {
            throw new Error('lease claim failed');
          }
          return activeLease && dbUpdate.mock.calls.length === 1
            ? []
            : [{ id: 'webhook-1' }];
        }),
      })),
    })),
  }));

  // Mock handler handle method
  const mockHandle = vi.fn();

  return {
    mockConstructEvent: vi.fn(),
    mockRetrieve: vi.fn(),
    mockUpdateBilling: vi.fn(),
    mockGetPlanFromPriceId: mockGetPlan,
    mockDbInsert: dbInsert,
    mockDbSelect: dbSelect,
    mockDbUpdate: dbUpdate,
    mockGetHandler: vi.fn(),
    mockGetStripeObjectId: vi.fn(() => 'obj_123'),
    mockStripeTimestampToDate: vi.fn(
      (timestamp: number) => new Date(timestamp * 1000)
    ),
    mockHandlerHandle: mockHandle,
    mockCaptureCriticalError: vi.fn(),
  };
});

export const mockConstructEvent = hoisted.mockConstructEvent;
export const mockRetrieve = hoisted.mockRetrieve;
export const mockUpdateBilling = hoisted.mockUpdateBilling;
export const mockGetPlanFromPriceId = hoisted.mockGetPlanFromPriceId;
export const mockDbInsert = hoisted.mockDbInsert;
export const mockDbSelect = hoisted.mockDbSelect;
export const mockDbUpdate = hoisted.mockDbUpdate;
export const mockGetHandler = hoisted.mockGetHandler;
export const mockGetStripeObjectId = hoisted.mockGetStripeObjectId;
export const mockStripeTimestampToDate = hoisted.mockStripeTimestampToDate;
export const mockHandlerHandle = hoisted.mockHandlerHandle;
export const mockCaptureCriticalError = hoisted.mockCaptureCriticalError;

// Set up all mocks
vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    webhooks: {
      constructEvent: mockConstructEvent,
    },
    subscriptions: {
      retrieve: mockRetrieve,
    },
  },
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockDbInsert,
    select: mockDbSelect,
    update: mockDbUpdate,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  users: {
    clerkId: 'clerk_id_column',
    stripeCustomerId: 'stripe_customer_id_column',
  },
  stripeWebhookEvents: {
    id: 'id',
    stripeEventId: 'stripe_event_id',
    processedAt: 'processed_at',
    processingStartedAt: 'processing_started_at',
  },
}));

vi.mock('@/lib/stripe/customer-sync', () => ({
  updateUserBillingStatus: mockUpdateBilling,
}));

vi.mock('@/lib/stripe/config', () => ({
  getPlanFromPriceId: mockGetPlanFromPriceId,
}));

vi.mock('@/lib/env-server', () => ({
  env: {
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mockCaptureCriticalError,
  captureWarning: vi.fn(),
  logFallback: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

// Mock the modular webhook handler architecture
vi.mock('@/lib/stripe/webhooks', () => ({
  getHandler: mockGetHandler,
  getStripeObjectId: mockGetStripeObjectId,
  stripeTimestampToDate: mockStripeTimestampToDate,
}));
