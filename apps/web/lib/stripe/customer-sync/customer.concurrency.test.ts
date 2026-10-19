import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const APP_USER_ID = '7b4b948f-9720-4c5f-98da-8a7335015da9';
const EMAIL = 'creator@example.com';

type CustomerFixture = Pick<Stripe.Customer, 'id' | 'metadata'>;

interface BillingRow {
  id: string;
  email: string;
  billingVersion: number;
  stripeCustomerId: string | null;
  isPro: boolean;
}
interface Predicate {
  column: keyof BillingRow;
  value: unknown;
}

const mocks = vi.hoisted(() => ({
  captureCriticalError: vi.fn(),
  captureWarning: vi.fn(),
  fetchBilling: vi.fn(),
  auditInsert: vi.fn(),
  withDbSessionTx: vi.fn(),
  search: vi.fn(),
  create:
    vi.fn<
      (
        params: Stripe.CustomerCreateParams,
        options?: Stripe.RequestOptions
      ) => Promise<CustomerFixture>
    >(),
  retrieve: vi.fn(),
  update: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: async () => ({ userId: 'user_legacy_auth_identity' }),
}));
vi.mock('@/lib/auth/session', () => ({
  withDbSession: async (operation: (id: string) => Promise<unknown>) =>
    operation('7b4b948f-9720-4c5f-98da-8a7335015da9'),
  withDbSessionTx: mocks.withDbSessionTx,
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [{ clerkId: null }] }),
      }),
    }),
  },
}));
vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    id: 'id',
    billingVersion: 'billingVersion',
    stripeCustomerId: 'stripeCustomerId',
  },
}));
vi.mock('@/lib/db/schema/billing', () => ({ billingAuditLog: {} }));
vi.mock('drizzle-orm', () => ({
  and: (...conditions: Predicate[]) => conditions,
  eq: (column: keyof BillingRow, value: unknown) => ({ column, value }),
  isNull: (column: keyof BillingRow) => ({ column, value: null }),
  sql: vi.fn(),
}));
vi.mock('@/lib/stripe/customer-sync/queries', () => ({
  fetchUserBillingDataByAppId: mocks.fetchBilling,
}));
// Every call is a cold cache miss, as with separate server instances.
vi.mock('@/lib/db/cache', () => ({
  cacheQuery: async (_key: string, query: () => Promise<unknown>) => query(),
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
  captureCriticalError: mocks.captureCriticalError,
  captureWarning: mocks.captureWarning,
}));
vi.mock('@/lib/env-server', () => ({
  env: { STRIPE_SECRET_KEY: 'sk_test_mock' },
}));
vi.mock('@/lib/env-public', () => ({
  publicEnv: { NEXT_PUBLIC_PROFILE_URL: 'https://example.com' },
}));
vi.mock('stripe', () => ({
  default: class {
    customers = {
      search: mocks.search,
      create: mocks.create,
      retrieve: mocks.retrieve,
      update: mocks.update,
    };
  },
}));

import { getOrCreateCustomer } from '@/lib/stripe/client';
import { ensureStripeCustomer } from './customer';

describe('Stripe customer ownership under concurrent checkout starts', () => {
  let row: BillingRow;
  let customers: Map<string, CustomerFixture>;
  let idempotencyResults: Map<
    string,
    { params: string; customer: CustomerFixture }
  >;
  let audits: unknown[];

  beforeEach(() => {
    vi.resetAllMocks();
    row = {
      id: APP_USER_ID,
      email: EMAIL,
      billingVersion: 1,
      stripeCustomerId: null,
      isPro: false,
    };
    customers = new Map();
    idempotencyResults = new Map();
    audits = [];
    mocks.fetchBilling.mockImplementation(async () => ({
      success: true,
      data: { ...row },
    }));
    // Stripe search deliberately never sees new writes (index propagation lag).
    mocks.search.mockResolvedValue({ data: [] });
    mocks.create.mockImplementation(async (params, options) => {
      const key = options?.idempotencyKey;
      const previous = key && idempotencyResults.get(key);
      if (previous) {
        if (previous.params !== JSON.stringify(params)) {
          throw new Error(
            'Stripe idempotency key reused with different parameters'
          );
        }
        return previous.customer;
      }
      const customer = {
        id: `cus_${customers.size + 1}`,
        metadata: {
          clerk_user_id: String(
            params.metadata && params.metadata.clerk_user_id
          ),
        },
      };
      customers.set(customer.id, customer);
      if (key)
        idempotencyResults.set(key, {
          params: JSON.stringify(params),
          customer,
        });
      return customer;
    });
    mocks.retrieve.mockImplementation(async (id: string) => customers.get(id));

    // Model row-lock serialization and commit/rollback of the ownership +
    // audit transaction. Only a matching version and prior customer can write.
    let queue = Promise.resolve();
    mocks.withDbSessionTx.mockImplementation(
      (operation: (tx: unknown) => Promise<unknown>) => {
        const result = queue.then(async () => {
          const draft = { ...row };
          const pendingAudits: unknown[] = [];
          const value = await operation({
            update: () => ({
              set: (values: Partial<BillingRow>) => ({
                where: (conditions: Predicate[]) => ({
                  returning: async () => {
                    if (
                      !conditions.every(
                        ({ column, value }) => draft[column] === value
                      )
                    )
                      return [];
                    Object.assign(draft, values, {
                      billingVersion: draft.billingVersion + 1,
                    });
                    return [{ id: draft.id }];
                  },
                }),
              }),
            }),
            insert: () => ({
              values: async (audit: unknown) => {
                await mocks.auditInsert(audit);
                pendingAudits.push(audit);
              },
            }),
          });
          row = draft;
          audits.push(...pendingAudits);
          return value;
        });
        queue = result.then(
          () => undefined,
          () => undefined
        );
        return result;
      }
    );
  });

  function expectOrphanDiagnostic(customerId?: string) {
    expect(mocks.captureCriticalError).toHaveBeenCalledWith(
      'Error ensuring Stripe customer',
      expect.any(Error),
      expect.objectContaining({
        diagnostic: 'stripe_customer_ownership_unresolved',
        appUserId: APP_USER_ID,
        orphanCustomerId: customerId,
        recovery: 'retry_with_same_app_user_id',
      })
    );
    expect(row.isPro).toBe(false);
  }

  it('persists and returns one customer for six simultaneous cold attempts', async () => {
    const create = mocks.create.getMockImplementation()!;
    let release!: () => void;
    const allCreating = new Promise<void>(resolve => {
      release = resolve;
    });
    let arrivals = 0;
    mocks.create.mockImplementation(async (params, options) => {
      const customer = await create(params, options);
      if (++arrivals === 6) release();
      await allCreating;
      return customer;
    });

    const results = await Promise.all(
      Array.from({ length: 6 }, () => ensureStripeCustomer())
    );

    expect(results).toEqual(
      Array.from({ length: 6 }, () => ({
        success: true,
        customerId: row.stripeCustomerId,
      }))
    );
    expect(row.stripeCustomerId).toBe('cus_1');
    expect(row.billingVersion).toBe(2);
    expect(customers.size).toBe(1);
    expect(audits).toHaveLength(1);
    expect(mocks.fetchBilling).toHaveBeenCalledTimes(11);
    expect(mocks.create).toHaveBeenCalledTimes(6);
    for (const [params, options] of mocks.create.mock.calls) {
      expect(params.metadata).toMatchObject({ clerk_user_id: APP_USER_ID });
      expect(options).toEqual({
        idempotencyKey: `customer:create:${APP_USER_ID}`,
      });
    }
  });

  it('returns a validated persisted winner instead of a different candidate', async () => {
    customers.set('cus_winner', {
      id: 'cus_winner',
      metadata: { clerk_user_id: APP_USER_ID },
    });
    mocks.withDbSessionTx.mockImplementationOnce(async () => {
      row.stripeCustomerId = 'cus_winner';
      row.billingVersion += 1;
      return [];
    });

    expect(await ensureStripeCustomer()).toEqual({
      success: true,
      customerId: 'cus_winner',
    });
    expect(mocks.retrieve).toHaveBeenCalledWith('cus_winner');
    expect(mocks.captureWarning).toHaveBeenCalledWith(
      'Stripe customer orphan recovered by persisted winner',
      undefined,
      {
        appUserId: APP_USER_ID,
        customerId: 'cus_2',
        persistedCustomerId: 'cus_winner',
      }
    );
    expect(audits).toHaveLength(0);
  });

  it('preserves an owner written without a billing version increment', async () => {
    customers.set('cus_winner', {
      id: 'cus_winner',
      metadata: { clerk_user_id: APP_USER_ID },
    });
    mocks.fetchBilling.mockImplementationOnce(async () => {
      const snapshot = { ...row };
      row.stripeCustomerId = 'cus_winner';
      return { success: true, data: snapshot };
    });

    expect(await ensureStripeCustomer()).toEqual({
      success: true,
      customerId: 'cus_winner',
    });
    expect(row.stripeCustomerId).toBe('cus_winner');
    expect(row.billingVersion).toBe(1);
    expect(audits).toHaveLength(0);
  });

  it.each([
    'missing',
    'unreadable',
    'wrong_owner',
    'deleted',
    'stripe_unavailable',
  ])('fails closed when the race winner is %s', async failure => {
    mocks.withDbSessionTx.mockImplementationOnce(async () => {
      row.billingVersion += 1;
      if (failure !== 'missing') row.stripeCustomerId = 'cus_winner';
      if (failure === 'unreadable')
        mocks.fetchBilling.mockResolvedValueOnce({
          success: false,
          error: 'database unavailable',
        });
      if (failure === 'wrong_owner')
        customers.set('cus_winner', {
          id: 'cus_winner',
          metadata: { clerk_user_id: 'another_user' },
        });
      if (failure === 'deleted')
        mocks.retrieve.mockResolvedValueOnce({
          id: 'cus_winner',
          deleted: true,
        });
      if (failure === 'stripe_unavailable')
        mocks.retrieve.mockRejectedValueOnce(new Error('Stripe unavailable'));
      return [];
    });

    expect(await ensureStripeCustomer()).toEqual({
      success: false,
      error: 'Failed to create or retrieve customer',
    });
    expectOrphanDiagnostic('cus_1');
    expect(audits).toHaveLength(0);
  });

  it.each(['persistence', 'audit'])(
    'recovers after %s failure without creating another Stripe customer',
    async failure => {
      if (failure === 'persistence')
        mocks.withDbSessionTx.mockRejectedValueOnce(
          new Error('database unavailable')
        );
      else
        mocks.auditInsert.mockRejectedValueOnce(new Error('audit unavailable'));

      expect((await ensureStripeCustomer()).success).toBe(false);
      expect(row.stripeCustomerId).toBeNull();
      expect(audits).toHaveLength(0);
      expectOrphanDiagnostic('cus_1');

      expect(await ensureStripeCustomer()).toEqual({
        success: true,
        customerId: 'cus_1',
      });
      expect(row.stripeCustomerId).toBe('cus_1');
      expect(customers.size).toBe(1);
      expect(mocks.create).toHaveBeenCalledTimes(2);
      expect(audits).toHaveLength(1);
      // A later retry uses the committed owner without any create request.
      expect(await ensureStripeCustomer()).toEqual({
        success: true,
        customerId: 'cus_1',
      });
      expect(mocks.create).toHaveBeenCalledTimes(2);
    }
  );

  it('recovers an ambiguous Stripe create timeout with the same key', async () => {
    const create = mocks.create.getMockImplementation()!;
    mocks.create.mockImplementationOnce(async (params, options) => {
      await create(params, options);
      throw new Error('connection lost after Stripe created customer');
    });

    expect((await ensureStripeCustomer()).success).toBe(false);
    expectOrphanDiagnostic();
    expect(mocks.withDbSessionTx).not.toHaveBeenCalled();
    expect(row.stripeCustomerId).toBeNull();
    expect(await ensureStripeCustomer()).toEqual({
      success: true,
      customerId: 'cus_1',
    });
    expect(customers.size).toBe(1);
    expect(audits).toHaveLength(1);
  });

  it('keys creation by app user even when email changes or two users share email', async () => {
    const first = await getOrCreateCustomer(APP_USER_ID, EMAIL);
    await expect(
      getOrCreateCustomer(APP_USER_ID, 'changed@example.com')
    ).rejects.toThrow('Failed to create or retrieve customer');
    const retry = await getOrCreateCustomer(APP_USER_ID, EMAIL);
    const other = await getOrCreateCustomer('another_app_user', EMAIL);

    expect(retry.id).toBe(first.id);
    expect(other.id).not.toBe(first.id);
    expect(
      mocks.create.mock.calls.map(([, options]) => options?.idempotencyKey)
    ).toEqual([
      `customer:create:${APP_USER_ID}`,
      `customer:create:${APP_USER_ID}`,
      `customer:create:${APP_USER_ID}`,
      'customer:create:another_app_user',
    ]);
  });
});
