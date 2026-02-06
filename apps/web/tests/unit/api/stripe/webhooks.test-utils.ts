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

export async function getPost() {
  const mod = await import('@/app/api/stripe/webhooks/route');
  return mod.POST;
}

export const {
  mockConstructEvent,
  mockRetrieve,
  mockUpdateBilling,
  mockGetPlanFromPriceId,
  mockDbInsert,
  mockDbSelect,
  mockDbUpdate,
  mockGetHandler,
  mockGetStripeObjectId,
  mockStripeTimestampToDate,
  mockHandlerHandle,
  mockCaptureCriticalError,
} = vi.hoisted(() => {
  const mockGetPlan = vi.fn<(priceId: string) => string | null>(
    () => 'standard'
  );

  // Mock db.insert().values().onConflictDoNothing().returning()
  const dbInsert = vi.fn(() => ({
    values: vi.fn(() => ({
      onConflictDoNothing: vi.fn(() => ({
        returning: vi.fn(async () => {
          // Import skipProcessing dynamically to get current value
          const { skipProcessing: skip } = await import(
            './webhooks.test-utils'
          );
          // If skip mode, simulate conflict (return empty = row already exists)
          return skip ? [] : [{ id: 'webhook-1' }];
        }),
      })),
    })),
  }));

  // Mock db.select().from().where().limit()
  const dbSelect = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => {
          const { skipProcessing: skip } = await import(
            './webhooks.test-utils'
          );
          return skip ? [{ id: 'existing-id', processedAt: new Date() }] : [];
        }),
      })),
    })),
  }));

  // Mock db.update().set().where()
  const dbUpdate = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
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
