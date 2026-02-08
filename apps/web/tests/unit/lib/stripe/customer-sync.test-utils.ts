/**
 * Shared test utilities for customer-sync tests
 *
 * IMPORTANT: vi.mock calls must be in each test file for proper hoisting.
 * This file only provides hoisted mock values and helper functions.
 */
import { vi } from 'vitest';

// Hoisted mocks — available inside vi.mock() factory functions in test files
export const {
  mockDbSelect,
  mockCaptureCriticalError,
  mockUsersTable,
  mockBillingAuditLog,
  mockDb,
} = vi.hoisted(() => {
  const _mockDbSelect = vi.fn();
  return {
    mockDbSelect: _mockDbSelect,
    mockCaptureCriticalError: vi.fn(),
    mockUsersTable: {
      id: Symbol('users.id'),
      clerkId: Symbol('users.clerkId'),
      email: Symbol('users.email'),
      isAdmin: Symbol('users.isAdmin'),
      isPro: Symbol('users.isPro'),
      plan: Symbol('users.plan'),
      stripeCustomerId: Symbol('users.stripeCustomerId'),
      stripeSubscriptionId: Symbol('users.stripeSubscriptionId'),
      billingVersion: Symbol('users.billingVersion'),
      lastBillingEventAt: Symbol('users.lastBillingEventAt'),
    },
    mockBillingAuditLog: {
      id: Symbol('billingAuditLog.id'),
    },
    mockDb: { select: _mockDbSelect },
  };
});

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
