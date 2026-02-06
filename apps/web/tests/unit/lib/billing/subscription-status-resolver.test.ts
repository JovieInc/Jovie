import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import {
  detectStatusMismatch,
  extractCustomerId,
  shouldGrantProAccess,
} from '@/lib/billing/reconciliation/subscription-status-resolver';

describe('subscription-status-resolver', () => {
  describe('shouldGrantProAccess', () => {
    it('should grant access for active subscriptions', () => {
      expect(shouldGrantProAccess('active')).toBe(true);
    });

    it('should grant access for trialing subscriptions', () => {
      expect(shouldGrantProAccess('trialing')).toBe(true);
    });

    it('should deny access for past_due subscriptions', () => {
      expect(shouldGrantProAccess('past_due')).toBe(false);
    });

    it('should deny access for canceled subscriptions', () => {
      expect(shouldGrantProAccess('canceled')).toBe(false);
    });

    it('should deny access for unpaid subscriptions', () => {
      expect(shouldGrantProAccess('unpaid')).toBe(false);
    });

    it('should deny access for incomplete subscriptions', () => {
      expect(shouldGrantProAccess('incomplete')).toBe(false);
    });

    it('should deny access for incomplete_expired subscriptions', () => {
      expect(shouldGrantProAccess('incomplete_expired')).toBe(false);
    });

    it('should deny access for paused subscriptions', () => {
      expect(shouldGrantProAccess('paused')).toBe(false);
    });
  });

  describe('detectStatusMismatch', () => {
    const makeSubscription = (status: Stripe.Subscription.Status) =>
      ({ status }) as Stripe.Subscription;

    it('should detect no mismatch when DB is pro and subscription is active', () => {
      const result = detectStatusMismatch(true, makeSubscription('active'));
      expect(result.hasMismatch).toBe(false);
      expect(result.expectedIsPro).toBe(true);
      expect(result.reason).toBe('status_matches');
    });

    it('should detect no mismatch when DB is not pro and subscription is canceled', () => {
      const result = detectStatusMismatch(false, makeSubscription('canceled'));
      expect(result.hasMismatch).toBe(false);
      expect(result.expectedIsPro).toBe(false);
      expect(result.reason).toBe('status_matches');
    });

    it('should detect mismatch when DB is pro but subscription is canceled', () => {
      const result = detectStatusMismatch(true, makeSubscription('canceled'));
      expect(result.hasMismatch).toBe(true);
      expect(result.expectedIsPro).toBe(false);
      expect(result.reason).toBe('db_is_pro_true_but_stripe_status_canceled');
    });

    it('should detect mismatch when DB is not pro but subscription is active', () => {
      const result = detectStatusMismatch(false, makeSubscription('active'));
      expect(result.hasMismatch).toBe(true);
      expect(result.expectedIsPro).toBe(true);
      expect(result.reason).toBe('db_is_pro_false_but_stripe_status_active');
    });

    it('should detect mismatch when DB is pro but subscription is past_due', () => {
      const result = detectStatusMismatch(true, makeSubscription('past_due'));
      expect(result.hasMismatch).toBe(true);
      expect(result.expectedIsPro).toBe(false);
      expect(result.reason).toBe('db_is_pro_true_but_stripe_status_past_due');
    });

    it('should detect mismatch when DB is not pro but subscription is trialing', () => {
      const result = detectStatusMismatch(false, makeSubscription('trialing'));
      expect(result.hasMismatch).toBe(true);
      expect(result.expectedIsPro).toBe(true);
    });
  });

  describe('extractCustomerId', () => {
    it('should return null for null input', () => {
      expect(extractCustomerId(null)).toBeNull();
    });

    it('should return the string ID directly', () => {
      expect(extractCustomerId('cus_123')).toBe('cus_123');
    });

    it('should extract ID from Customer object', () => {
      const customer = { id: 'cus_456' } as Stripe.Customer;
      expect(extractCustomerId(customer)).toBe('cus_456');
    });

    it('should extract ID from DeletedCustomer object', () => {
      const customer = {
        id: 'cus_789',
        deleted: true,
      } as Stripe.DeletedCustomer;
      expect(extractCustomerId(customer)).toBe('cus_789');
    });

    it('should return null for empty string', () => {
      // Empty string is falsy, so extractCustomerId returns null
      expect(extractCustomerId('')).toBeNull();
    });
  });
});
