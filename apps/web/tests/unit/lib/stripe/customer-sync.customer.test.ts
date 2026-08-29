import { beforeEach, describe, expect, it, vi } from 'vitest';

const APP_USER_ID = '7b4b948f-9720-4c5f-98da-8a7335015da9';

const mocks = vi.hoisted(() => ({
  billingAuditLog: {
    id: Symbol('billingAuditLog.id'),
  },
  captureCriticalError: vi.fn(),
  captureWarning: vi.fn(),
  dbInsert: vi.fn(),
  dbSelect: vi.fn(),
  dbUpdate: vi.fn(),
  fetchUserBillingData: vi.fn(),
  fetchUserBillingDataByAppId: vi.fn(),
  getCachedAuth: vi.fn(),
  getOrCreateCustomer: vi.fn(),
  stripeCustomerRetrieve: vi.fn(),
  stripeCustomerUpdate: vi.fn(),
  usersTable: {
    id: Symbol('users.id'),
    billingUpdatedAt: Symbol('users.billingUpdatedAt'),
    billingVersion: Symbol('users.billingVersion'),
    stripeCustomerId: Symbol('users.stripeCustomerId'),
  },
  withDbSession: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mocks.getCachedAuth,
}));
vi.mock('@/lib/auth/session', () => ({
  withDbSession: mocks.withDbSession,
}));
vi.mock('@/lib/db', () => ({
  db: {
    insert: mocks.dbInsert,
    select: mocks.dbSelect,
    update: mocks.dbUpdate,
  },
}));
vi.mock('@/lib/db/schema/auth', () => ({ users: mocks.usersTable }));
vi.mock('@/lib/db/schema/billing', () => ({
  billingAuditLog: mocks.billingAuditLog,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mocks.captureCriticalError,
  captureWarning: mocks.captureWarning,
}));
vi.mock('@/lib/stripe/client', () => ({
  getOrCreateCustomer: mocks.getOrCreateCustomer,
  stripe: {
    customers: {
      retrieve: mocks.stripeCustomerRetrieve,
      update: mocks.stripeCustomerUpdate,
    },
  },
}));
vi.mock('@/lib/stripe/customer-sync/queries', () => ({
  fetchUserBillingData: mocks.fetchUserBillingData,
  fetchUserBillingDataByAppId: mocks.fetchUserBillingDataByAppId,
}));
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions, type: 'and' })),
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right, type: 'eq' })),
  sql: vi.fn((strings: unknown, ...values: unknown[]) => ({ strings, values })),
}));

import { ensureStripeCustomer } from '@/lib/stripe/customer-sync/customer';

describe('ensureStripeCustomer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getCachedAuth.mockResolvedValue({ userId: APP_USER_ID });
    mocks.withDbSession.mockImplementation(
      async (operation: (appUserId: string) => Promise<unknown>) =>
        operation(APP_USER_ID)
    );
  });

  it('loads the current Better Auth user by app UUID', async () => {
    mocks.fetchUserBillingData.mockResolvedValue({
      error: 'User not found',
      success: false,
    });
    mocks.fetchUserBillingDataByAppId.mockResolvedValue({
      data: {
        billingVersion: 2,
        email: 'creator@example.com',
        id: APP_USER_ID,
        stripeCustomerId: 'cus_existing',
      },
      success: true,
    });
    mocks.stripeCustomerRetrieve.mockResolvedValue({
      id: 'cus_existing',
      metadata: { clerk_user_id: APP_USER_ID },
    });

    const result = await ensureStripeCustomer();

    expect(result).toEqual({ customerId: 'cus_existing', success: true });
    expect(mocks.fetchUserBillingDataByAppId).toHaveBeenCalledWith({
      appUserId: APP_USER_ID,
      fields: expect.any(Array),
    });
    expect(mocks.fetchUserBillingData).not.toHaveBeenCalled();
  });

  it('persists a new Stripe customer against users.id', async () => {
    const updateWhere = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: APP_USER_ID }]),
    });
    mocks.dbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: updateWhere }),
    });
    mocks.dbInsert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    mocks.fetchUserBillingDataByAppId.mockResolvedValue({
      data: {
        billingVersion: 1,
        email: 'creator@example.com',
        id: APP_USER_ID,
        stripeCustomerId: null,
      },
      success: true,
    });
    mocks.getOrCreateCustomer.mockResolvedValue({ id: 'cus_new' });

    const result = await ensureStripeCustomer();

    expect(result).toEqual({ customerId: 'cus_new', success: true });
    expect(updateWhere).toHaveBeenCalledWith({
      conditions: [
        { left: mocks.usersTable.id, right: APP_USER_ID, type: 'eq' },
        { left: mocks.usersTable.billingVersion, right: 1, type: 'eq' },
      ],
      type: 'and',
    });
  });

  it('accepts and upgrades a matching legacy Clerk customer identity', async () => {
    const legacyClerkId = 'user_legacy';
    mocks.fetchUserBillingDataByAppId.mockResolvedValue({
      data: {
        billingVersion: 2,
        email: 'creator@example.com',
        id: APP_USER_ID,
        stripeCustomerId: 'cus_legacy',
      },
      success: true,
    });
    mocks.stripeCustomerRetrieve.mockResolvedValue({
      id: 'cus_legacy',
      metadata: { clerk_user_id: legacyClerkId },
    });
    mocks.dbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ clerkId: legacyClerkId }]),
        }),
      }),
    });

    const result = await ensureStripeCustomer();

    expect(result).toEqual({ customerId: 'cus_legacy', success: true });
    expect(mocks.stripeCustomerUpdate).toHaveBeenCalledWith('cus_legacy', {
      metadata: {
        clerk_user_id: APP_USER_ID,
        created_via: 'jovie_app',
      },
    });
  });

  it('fails closed when legacy ownership lookup is unavailable', async () => {
    mocks.fetchUserBillingDataByAppId.mockResolvedValue({
      data: {
        billingVersion: 2,
        email: 'creator@example.com',
        id: APP_USER_ID,
        stripeCustomerId: 'cus_legacy',
      },
      success: true,
    });
    mocks.stripeCustomerRetrieve.mockResolvedValue({
      id: 'cus_legacy',
      metadata: { clerk_user_id: 'user_legacy' },
    });
    mocks.dbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockRejectedValue(new Error('database unavailable')),
        }),
      }),
    });

    const result = await ensureStripeCustomer();

    expect(result).toEqual({
      error: 'Failed to create or retrieve customer',
      success: false,
    });
    expect(mocks.getOrCreateCustomer).not.toHaveBeenCalled();
  });

  it('keeps a proven customer when identity metadata upgrade fails', async () => {
    const legacyClerkId = 'user_legacy';
    mocks.fetchUserBillingDataByAppId.mockResolvedValue({
      data: {
        billingVersion: 2,
        email: 'creator@example.com',
        id: APP_USER_ID,
        stripeCustomerId: 'cus_legacy',
      },
      success: true,
    });
    mocks.stripeCustomerRetrieve.mockResolvedValue({
      id: 'cus_legacy',
      metadata: { clerk_user_id: legacyClerkId },
    });
    mocks.dbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ clerkId: legacyClerkId }]),
        }),
      }),
    });
    mocks.stripeCustomerUpdate.mockRejectedValue(
      new Error('Stripe unavailable')
    );

    const result = await ensureStripeCustomer();

    expect(result).toEqual({ customerId: 'cus_legacy', success: true });
    expect(mocks.captureWarning).toHaveBeenCalledWith(
      'Failed to upgrade Stripe customer identity metadata',
      expect.any(Error),
      { appUserId: APP_USER_ID, customerId: 'cus_legacy' }
    );
    expect(mocks.getOrCreateCustomer).not.toHaveBeenCalled();
  });

  it('does not create a duplicate customer after transient Stripe lookup failure', async () => {
    mocks.fetchUserBillingDataByAppId.mockResolvedValue({
      data: {
        billingVersion: 2,
        email: 'creator@example.com',
        id: APP_USER_ID,
        stripeCustomerId: 'cus_existing',
      },
      success: true,
    });
    mocks.stripeCustomerRetrieve.mockRejectedValue(
      new Error('Stripe unavailable')
    );

    const result = await ensureStripeCustomer();

    expect(result).toEqual({
      error: 'Failed to create or retrieve customer',
      success: false,
    });
    expect(mocks.getOrCreateCustomer).not.toHaveBeenCalled();
  });

  it('fails closed on an untrusted Stripe customer payload', async () => {
    mocks.fetchUserBillingDataByAppId.mockResolvedValue({
      data: {
        billingVersion: 2,
        email: 'creator@example.com',
        id: APP_USER_ID,
        stripeCustomerId: 'cus_existing',
      },
      success: true,
    });
    mocks.stripeCustomerRetrieve.mockResolvedValue({});

    const result = await ensureStripeCustomer();

    expect(result).toEqual({
      error: 'Failed to create or retrieve customer',
      success: false,
    });
    expect(mocks.getOrCreateCustomer).not.toHaveBeenCalled();
  });

  it('does not reuse a Stripe customer owned by another identity', async () => {
    const updateWhere = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: APP_USER_ID }]),
    });
    mocks.dbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: updateWhere }),
    });
    mocks.dbInsert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    mocks.fetchUserBillingDataByAppId.mockResolvedValue({
      data: {
        billingVersion: 3,
        email: 'creator@example.com',
        id: APP_USER_ID,
        stripeCustomerId: 'cus_wrong_owner',
      },
      success: true,
    });
    mocks.stripeCustomerRetrieve.mockResolvedValue({
      id: 'cus_wrong_owner',
      metadata: { clerk_user_id: 'user_someone_else' },
    });
    mocks.dbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ clerkId: 'user_current' }]),
        }),
      }),
    });
    mocks.getOrCreateCustomer.mockResolvedValue({ id: 'cus_replacement' });

    const result = await ensureStripeCustomer();

    expect(result).toEqual({ customerId: 'cus_replacement', success: true });
    expect(mocks.captureWarning).toHaveBeenCalledWith(
      'Stored Stripe customer ID is invalid; repairing',
      expect.any(Error),
      { appUserId: APP_USER_ID, function: 'ensureStripeCustomer' }
    );
  });
});
