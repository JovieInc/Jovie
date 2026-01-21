/**
 * Shared test utilities for customer-sync tests
 */
import { vi } from 'vitest';

// Hoisted mocks - must be defined before vi.mock calls
export const { mockDbSelect, mockCaptureCriticalError } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockCaptureCriticalError: vi.fn(),
}));

// Mock database
vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

// Mock database schema - provide the users table columns
vi.mock('@/lib/db/schema', () => ({
  users: {
    id: Symbol('users.id'),
    clerkId: Symbol('users.clerkId'),
    email: Symbol('users.email'),
    isAdmin: Symbol('users.isAdmin'),
    isPro: Symbol('users.isPro'),
    stripeCustomerId: Symbol('users.stripeCustomerId'),
    stripeSubscriptionId: Symbol('users.stripeSubscriptionId'),
    billingVersion: Symbol('users.billingVersion'),
    lastBillingEventAt: Symbol('users.lastBillingEventAt'),
  },
  billingAuditLog: {
    id: Symbol('billingAuditLog.id'),
  },
}));

// Mock error tracking
vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mockCaptureCriticalError,
  captureWarning: vi.fn(),
}));

// Mock server-only (no-op in tests)
vi.mock('server-only', () => ({}));

// Mock Clerk auth
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

// Mock auth session
vi.mock('@/lib/auth/session', () => ({
  withDbSession: vi.fn(),
}));

// Mock Stripe client
vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    customers: {
      retrieve: vi.fn(),
      update: vi.fn(),
    },
  },
  getOrCreateCustomer: vi.fn(),
}));

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ type: 'eq', left: a, right: b })),
  and: vi.fn((...args) => ({ type: 'and', conditions: args })),
  sql: vi.fn((strings, ...values) => ({ type: 'sql', strings, values })),
}));

// Helper to create mock DB query chain
export function createMockDbQuery(resolvedValue: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(resolvedValue),
      }),
    }),
  };
}

// Helper to create mock DB query chain that rejects
export function createMockDbQueryRejecting(error: Error) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockRejectedValue(error),
      }),
    }),
  };
}
