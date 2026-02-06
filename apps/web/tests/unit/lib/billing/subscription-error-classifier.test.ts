import { describe, expect, it, vi } from 'vitest';
import {
  classifySubscriptionError,
  retrieveSubscriptionSafely,
} from '@/lib/billing/reconciliation/subscription-error-classifier';

describe('subscription-error-classifier', () => {
  describe('classifySubscriptionError', () => {
    it('should classify "No such subscription" as not_found and recoverable', () => {
      const error = new Error(
        'No such subscription: sub_123 on account acct_456'
      );
      const result = classifySubscriptionError(error);

      expect(result.type).toBe('not_found');
      expect(result.isRecoverable).toBe(true);
      expect(result.message).toBe(
        'Subscription not found in Stripe (likely deleted)'
      );
      expect(result.originalError).toBe(error);
    });

    it('should classify StripeError as stripe_error and not recoverable', () => {
      const error = new Error('Rate limit exceeded');
      error.name = 'StripeError';
      const result = classifySubscriptionError(error);

      expect(result.type).toBe('stripe_error');
      expect(result.isRecoverable).toBe(false);
      expect(result.message).toBe('Rate limit exceeded');
      expect(result.originalError).toBe(error);
    });

    it('should classify unknown errors as unknown and not recoverable', () => {
      const error = new Error('Something unexpected happened');
      const result = classifySubscriptionError(error);

      expect(result.type).toBe('unknown');
      expect(result.isRecoverable).toBe(false);
      expect(result.message).toBe('Something unexpected happened');
      expect(result.originalError).toBe(error);
    });

    it('should handle non-Error objects', () => {
      const result = classifySubscriptionError('string error');

      expect(result.type).toBe('unknown');
      expect(result.isRecoverable).toBe(false);
      expect(result.message).toBe('string error');
    });

    it('should handle null/undefined errors', () => {
      const result = classifySubscriptionError(null);
      expect(result.type).toBe('unknown');
      expect(result.message).toBe('null');
    });
  });

  describe('retrieveSubscriptionSafely', () => {
    it('should return subscription on success', async () => {
      const mockSubscription = { id: 'sub_123', status: 'active' };
      const mockStripe = {
        subscriptions: {
          retrieve: vi.fn().mockResolvedValue(mockSubscription),
        },
      };

      const result = await retrieveSubscriptionSafely(
        mockStripe as any,
        'sub_123'
      );

      expect(result.subscription).toBe(mockSubscription);
      expect(result.error).toBeNull();
      expect(mockStripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_123');
    });

    it('should return error classification on not_found', async () => {
      const mockStripe = {
        subscriptions: {
          retrieve: vi
            .fn()
            .mockRejectedValue(new Error('No such subscription: sub_123')),
        },
      };

      const result = await retrieveSubscriptionSafely(
        mockStripe as any,
        'sub_123'
      );

      expect(result.subscription).toBeNull();
      expect(result.error).not.toBeNull();
      expect(result.error!.type).toBe('not_found');
      expect(result.error!.isRecoverable).toBe(true);
    });

    it('should return error classification on Stripe API errors', async () => {
      const stripeError = new Error('Rate limit exceeded');
      stripeError.name = 'StripeError';
      const mockStripe = {
        subscriptions: {
          retrieve: vi.fn().mockRejectedValue(stripeError),
        },
      };

      const result = await retrieveSubscriptionSafely(
        mockStripe as any,
        'sub_123'
      );

      expect(result.subscription).toBeNull();
      expect(result.error).not.toBeNull();
      expect(result.error!.type).toBe('stripe_error');
      expect(result.error!.isRecoverable).toBe(false);
    });
  });
});
