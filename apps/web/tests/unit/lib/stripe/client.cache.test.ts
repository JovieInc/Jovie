/**
 * Stripe Client Cache Tests - Cache Behavior & Performance
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';

// Mock Stripe customer data
const createMockCustomer = (
  id: string,
  userId: string,
  email: string
): Stripe.Customer => ({
  id,
  object: 'customer',
  email,
  metadata: {
    clerk_user_id: userId,
    created_via: 'jovie_app',
  },
  created: Math.floor(Date.now() / 1000),
  livemode: false,
  // Required Stripe.Customer fields with defaults
  address: null,
  balance: 0,
  currency: null,
  default_source: null,
  delinquent: false,
  description: null,
  discount: null,
  invoice_prefix: null,
  invoice_settings: {
    custom_fields: null,
    default_payment_method: null,
    footer: null,
    rendering_options: null,
  },
  name: null,
  next_invoice_sequence: 1,
  phone: null,
  preferred_locales: [],
  shipping: null,
  tax_exempt: 'none',
  test_clock: null,
});

// vi.mock calls are hoisted — these must be in the test file itself
vi.mock('@/lib/db/cache', () => ({
  cacheQuery: vi.fn(),
  invalidateCache: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({
  getRedis: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
  captureWarning: vi.fn(),
}));

vi.mock('@/lib/env-public', () => ({
  publicEnv: {
    NEXT_PUBLIC_PROFILE_URL: 'https://test.jovie.ai',
  },
}));

vi.mock('@/lib/env-server', () => ({
  env: {
    STRIPE_SECRET_KEY: 'sk_test_123',
  },
}));

vi.mock('server-only', () => ({}));

// Mock the Stripe module
vi.mock('stripe', () => {
  return {
    default: class MockStripe {
      customers = {
        search: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      };
    },
  };
});

import {
  getOrCreateCustomer,
  invalidateStripeCustomerCache,
  stripe,
} from '@/lib/stripe/client';
import { cacheQuery, invalidateCache } from '@/lib/db/cache';
import { captureError } from '@/lib/error-tracking';

// Get mocked functions
const mockedCacheQuery = vi.mocked(cacheQuery);
const mockedInvalidateCache = vi.mocked(invalidateCache);
const mockedCaptureError = vi.mocked(captureError);

// Get reference to mocked Stripe customers
let mockStripeCustomers: any;

describe('Stripe Client - Cache Behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Get reference to the mocked stripe.customers methods
    mockStripeCustomers = stripe.customers as any;
  });

  describe('getOrCreateCustomer - Cache Integration', () => {
    it('wraps customer lookup in cacheQuery with correct cache key', async () => {
      const mockCustomer = createMockCustomer(
        'cus_test123',
        'clerk_user_123',
        'test@example.com'
      );

      // Mock cacheQuery to execute the query function immediately
      mockedCacheQuery.mockImplementation(async (key, queryFn) => {
        return queryFn();
      });

      mockStripeCustomers.search.mockResolvedValueOnce({
        data: [mockCustomer],
        has_more: false,
        object: 'search_result',
        url: '/v1/customers/search',
      });

      await getOrCreateCustomer('clerk_user_123', 'test@example.com');

      // Verify cacheQuery was called with correct parameters
      expect(mockedCacheQuery).toHaveBeenCalledTimes(1);
      expect(mockedCacheQuery).toHaveBeenCalledWith(
        'stripe:customer:clerk_user_123',
        expect.any(Function),
        { ttlSeconds: 3600 }
      );
    });

    it('uses 1 hour TTL for cached customer data', async () => {
      const mockCustomer = createMockCustomer(
        'cus_test456',
        'clerk_user_456',
        'cached@example.com'
      );

      mockedCacheQuery.mockImplementation(async (key, queryFn) => {
        return queryFn();
      });

      mockStripeCustomers.search.mockResolvedValueOnce({
        data: [mockCustomer],
        has_more: false,
        object: 'search_result',
        url: '/v1/customers/search',
      });

      await getOrCreateCustomer('clerk_user_456', 'cached@example.com');

      // Verify TTL is 3600 seconds (1 hour)
      const cacheOptions = mockedCacheQuery.mock.calls[0][2];
      expect(cacheOptions).toEqual({ ttlSeconds: 3600 });
    });

    it('caches customer found by user ID metadata', async () => {
      const mockCustomer = createMockCustomer(
        'cus_metadata',
        'clerk_user_789',
        'metadata@example.com'
      );

      mockedCacheQuery.mockImplementation(async (key, queryFn) => {
        return queryFn();
      });

      // First search by user ID succeeds
      mockStripeCustomers.search.mockResolvedValueOnce({
        data: [mockCustomer],
        has_more: false,
        object: 'search_result',
        url: '/v1/customers/search',
      });

      const result = await getOrCreateCustomer(
        'clerk_user_789',
        'metadata@example.com'
      );

      expect(result).toEqual(mockCustomer);
      expect(mockedCacheQuery).toHaveBeenCalledWith(
        'stripe:customer:clerk_user_789',
        expect.any(Function),
        { ttlSeconds: 3600 }
      );
    });

    it('caches newly created customer', async () => {
      const mockCustomer = createMockCustomer(
        'cus_new123',
        'clerk_user_new',
        'new@example.com'
      );

      mockedCacheQuery.mockImplementation(async (key, queryFn) => {
        return queryFn();
      });

      // No existing customer found
      mockStripeCustomers.search.mockResolvedValueOnce({
        data: [],
        has_more: false,
        object: 'search_result',
        url: '/v1/customers/search',
      });

      // Email search also returns empty
      mockStripeCustomers.search.mockResolvedValueOnce({
        data: [],
        has_more: false,
        object: 'search_result',
        url: '/v1/customers/search',
      });

      // Create new customer
      mockStripeCustomers.create.mockResolvedValueOnce(mockCustomer);

      const result = await getOrCreateCustomer(
        'clerk_user_new',
        'new@example.com',
        'New User'
      );

      expect(result).toEqual(mockCustomer);
      expect(mockedCacheQuery).toHaveBeenCalledWith(
        'stripe:customer:clerk_user_new',
        expect.any(Function),
        { ttlSeconds: 3600 }
      );
    });

    it('caches claimed legacy customer', async () => {
      const legacyCustomer = createMockCustomer(
        'cus_legacy',
        '', // No clerk_user_id initially
        'legacy@example.com'
      );
      legacyCustomer.metadata = {
        created_via: 'jovie_app',
      };

      const updatedCustomer = createMockCustomer(
        'cus_legacy',
        'clerk_user_legacy',
        'legacy@example.com'
      );

      mockedCacheQuery.mockImplementation(async (key, queryFn) => {
        return queryFn();
      });

      // No customer by user ID
      mockStripeCustomers.search.mockResolvedValueOnce({
        data: [],
        has_more: false,
        object: 'search_result',
        url: '/v1/customers/search',
      });

      // Find unclaimed customer by email
      mockStripeCustomers.search.mockResolvedValueOnce({
        data: [legacyCustomer],
        has_more: false,
        object: 'search_result',
        url: '/v1/customers/search',
      });

      // Update customer with user ID
      mockStripeCustomers.update.mockResolvedValueOnce(updatedCustomer);

      const result = await getOrCreateCustomer(
        'clerk_user_legacy',
        'legacy@example.com'
      );

      expect(result).toEqual(updatedCustomer);
      expect(mockedCacheQuery).toHaveBeenCalledWith(
        'stripe:customer:clerk_user_legacy',
        expect.any(Function),
        { ttlSeconds: 3600 }
      );
    });

    it('cache query function executes full customer lookup logic', async () => {
      mockedCacheQuery.mockImplementation(async (key, queryFn) => {
        return queryFn();
      });

      const mockCustomer = createMockCustomer(
        'cus_lookup',
        'clerk_user_lookup',
        'lookup@example.com'
      );

      mockStripeCustomers.search.mockResolvedValueOnce({
        data: [mockCustomer],
        has_more: false,
        object: 'search_result',
        url: '/v1/customers/search',
      });

      await getOrCreateCustomer('clerk_user_lookup', 'lookup@example.com');

      // Verify the query function was passed to cacheQuery
      expect(mockedCacheQuery).toHaveBeenCalledTimes(1);

      // Extract and verify the query function
      const queryFn = mockedCacheQuery.mock.calls[0][1];
      expect(typeof queryFn).toBe('function');
    });
  });

  describe('getOrCreateCustomer - Error Handling with Cache', () => {
    it('throws error and captures when Stripe API fails', async () => {
      const stripeError = new Error('Stripe API unavailable');

      mockedCacheQuery.mockImplementation(async (key, queryFn) => {
        return queryFn();
      });

      mockStripeCustomers.search.mockRejectedValueOnce(stripeError);

      await expect(
        getOrCreateCustomer('clerk_user_error', 'error@example.com')
      ).rejects.toThrow('Failed to create or retrieve customer');

      expect(mockedCaptureError).toHaveBeenCalledWith(
        'Error creating/retrieving Stripe customer',
        stripeError,
        {
          userId: 'clerk_user_error',
          email: 'error@example.com',
        }
      );
    });

    it('propagates errors through cache layer', async () => {
      mockedCacheQuery.mockImplementation(async (key, queryFn) => {
        return queryFn();
      });

      mockStripeCustomers.search.mockRejectedValueOnce(
        new Error('Network timeout')
      );

      await expect(
        getOrCreateCustomer('clerk_user_timeout', 'timeout@example.com')
      ).rejects.toThrow('Failed to create or retrieve customer');

      // Verify error was captured
      expect(mockedCaptureError).toHaveBeenCalledTimes(1);
    });
  });

  describe('invalidateStripeCustomerCache', () => {
    it('calls invalidateCache with correct cache key', async () => {
      await invalidateStripeCustomerCache('clerk_user_invalidate');

      expect(mockedInvalidateCache).toHaveBeenCalledTimes(1);
      expect(mockedInvalidateCache).toHaveBeenCalledWith(
        'stripe:customer:clerk_user_invalidate'
      );
    });

    it('invalidates cache for different user IDs', async () => {
      await invalidateStripeCustomerCache('user_1');
      await invalidateStripeCustomerCache('user_2');
      await invalidateStripeCustomerCache('user_3');

      expect(mockedInvalidateCache).toHaveBeenCalledTimes(3);
      expect(mockedInvalidateCache).toHaveBeenNthCalledWith(
        1,
        'stripe:customer:user_1'
      );
      expect(mockedInvalidateCache).toHaveBeenNthCalledWith(
        2,
        'stripe:customer:user_2'
      );
      expect(mockedInvalidateCache).toHaveBeenNthCalledWith(
        3,
        'stripe:customer:user_3'
      );
    });

    it('handles invalidation errors gracefully', async () => {
      mockedInvalidateCache.mockRejectedValueOnce(
        new Error('Redis connection failed')
      );

      // Should not throw, but let error propagate
      await expect(
        invalidateStripeCustomerCache('clerk_user_error')
      ).rejects.toThrow('Redis connection failed');
    });
  });

  describe('Cache Key Format', () => {
    it('uses consistent cache key format across operations', async () => {
      const userId = 'clerk_consistent_user';
      const expectedKey = `stripe:customer:${userId}`;

      mockedCacheQuery.mockImplementation(async (key, queryFn) => {
        return queryFn();
      });

      mockStripeCustomers.search.mockResolvedValueOnce({
        data: [
          createMockCustomer('cus_consistent', userId, 'consistent@example.com'),
        ],
        has_more: false,
        object: 'search_result',
        url: '/v1/customers/search',
      });

      // Get customer (stores in cache)
      await getOrCreateCustomer(userId, 'consistent@example.com');
      expect(mockedCacheQuery).toHaveBeenCalledWith(
        expectedKey,
        expect.any(Function),
        expect.any(Object)
      );

      // Invalidate cache
      await invalidateStripeCustomerCache(userId);
      expect(mockedInvalidateCache).toHaveBeenCalledWith(expectedKey);
    });

    it('generates unique cache keys for different users', async () => {
      mockedCacheQuery.mockImplementation(async (key, queryFn) => {
        return queryFn();
      });

      mockStripeCustomers.search.mockResolvedValue({
        data: [createMockCustomer('cus_test', 'user1', 'user@example.com')],
        has_more: false,
        object: 'search_result',
        url: '/v1/customers/search',
      });

      await getOrCreateCustomer('user_alpha', 'alpha@example.com');
      await getOrCreateCustomer('user_beta', 'beta@example.com');

      expect(mockedCacheQuery).toHaveBeenNthCalledWith(
        1,
        'stripe:customer:user_alpha',
        expect.any(Function),
        expect.any(Object)
      );
      expect(mockedCacheQuery).toHaveBeenNthCalledWith(
        2,
        'stripe:customer:user_beta',
        expect.any(Function),
        expect.any(Object)
      );
    });
  });

  describe('Cache Performance', () => {
    it('returns cached result without executing query function on cache hit', async () => {
      const mockCustomer = createMockCustomer(
        'cus_cached',
        'clerk_user_cached',
        'cached@example.com'
      );

      // Mock cache hit - return cached value without calling query function
      mockedCacheQuery.mockResolvedValueOnce(mockCustomer);

      const result = await getOrCreateCustomer(
        'clerk_user_cached',
        'cached@example.com'
      );

      expect(result).toEqual(mockCustomer);
      expect(mockedCacheQuery).toHaveBeenCalledTimes(1);
      // Stripe API should not be called on cache hit
      expect(mockStripeCustomers.search).not.toHaveBeenCalled();
      expect(mockStripeCustomers.create).not.toHaveBeenCalled();
    });

    it('executes query function only on cache miss', async () => {
      const mockCustomer = createMockCustomer(
        'cus_miss',
        'clerk_user_miss',
        'miss@example.com'
      );

      // Mock cache miss - execute query function
      mockedCacheQuery.mockImplementation(async (key, queryFn) => {
        return queryFn();
      });

      mockStripeCustomers.search.mockResolvedValueOnce({
        data: [mockCustomer],
        has_more: false,
        object: 'search_result',
        url: '/v1/customers/search',
      });

      const result = await getOrCreateCustomer(
        'clerk_user_miss',
        'miss@example.com'
      );

      expect(result).toEqual(mockCustomer);
      expect(mockedCacheQuery).toHaveBeenCalledTimes(1);
      // Stripe API should be called on cache miss
      expect(mockStripeCustomers.search).toHaveBeenCalledTimes(1);
    });
  });

  describe('Multi-layer Cache Behavior', () => {
    it('cache options enable Redis by default', async () => {
      mockedCacheQuery.mockImplementation(async (key, queryFn) => {
        return queryFn();
      });

      mockStripeCustomers.search.mockResolvedValueOnce({
        data: [
          createMockCustomer('cus_redis', 'clerk_user_redis', 'redis@example.com'),
        ],
        has_more: false,
        object: 'search_result',
        url: '/v1/customers/search',
      });

      await getOrCreateCustomer('clerk_user_redis', 'redis@example.com');

      // Verify cache options don't disable Redis
      const cacheOptions = mockedCacheQuery.mock.calls[0][2];
      expect(cacheOptions.useRedis).not.toBe(false);
    });

    it('caches full Stripe.Customer object', async () => {
      const mockCustomer = createMockCustomer(
        'cus_full',
        'clerk_user_full',
        'full@example.com'
      );
      mockCustomer.name = 'Test User';
      mockCustomer.phone = '+1234567890';

      mockedCacheQuery.mockResolvedValueOnce(mockCustomer);

      const result = await getOrCreateCustomer(
        'clerk_user_full',
        'full@example.com'
      );

      // Verify full object is returned (not just ID)
      expect(result).toEqual(mockCustomer);
      expect(result.name).toBe('Test User');
      expect(result.phone).toBe('+1234567890');
      expect(result.metadata).toEqual({
        clerk_user_id: 'clerk_user_full',
        created_via: 'jovie_app',
      });
    });
  });

  describe('Cache Invalidation Scenarios', () => {
    it('supports invalidation after customer creation', async () => {
      const userId = 'clerk_user_create';

      // Simulate customer creation flow
      mockedCacheQuery.mockImplementation(async (key, queryFn) => {
        return queryFn();
      });

      mockStripeCustomers.search.mockResolvedValueOnce({
        data: [],
        has_more: false,
        object: 'search_result',
        url: '/v1/customers/search',
      });

      mockStripeCustomers.search.mockResolvedValueOnce({
        data: [],
        has_more: false,
        object: 'search_result',
        url: '/v1/customers/search',
      });

      mockStripeCustomers.create.mockResolvedValueOnce(
        createMockCustomer('cus_created', userId, 'created@example.com')
      );

      await getOrCreateCustomer(userId, 'created@example.com');

      // Clear cache after creation
      await invalidateStripeCustomerCache(userId);

      expect(mockedInvalidateCache).toHaveBeenCalledWith(
        `stripe:customer:${userId}`
      );
    });

    it('supports invalidation after metadata update', async () => {
      const userId = 'clerk_user_update';
      const legacyCustomer = createMockCustomer(
        'cus_legacy_update',
        '',
        'update@example.com'
      );
      legacyCustomer.metadata = { created_via: 'jovie_app' };

      const updatedCustomer = createMockCustomer(
        'cus_legacy_update',
        userId,
        'update@example.com'
      );

      mockedCacheQuery.mockImplementation(async (key, queryFn) => {
        return queryFn();
      });

      mockStripeCustomers.search.mockResolvedValueOnce({
        data: [],
        has_more: false,
        object: 'search_result',
        url: '/v1/customers/search',
      });

      mockStripeCustomers.search.mockResolvedValueOnce({
        data: [legacyCustomer],
        has_more: false,
        object: 'search_result',
        url: '/v1/customers/search',
      });

      mockStripeCustomers.update.mockResolvedValueOnce(updatedCustomer);

      await getOrCreateCustomer(userId, 'update@example.com');

      // Invalidate after metadata update
      await invalidateStripeCustomerCache(userId);

      expect(mockedInvalidateCache).toHaveBeenCalledWith(
        `stripe:customer:${userId}`
      );
    });
  });
});
