import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import {
  BATCH_SIZE,
  type ProcessUserResult,
  processSingleUser,
  type ReconciliationStats,
  updateStatsFromResult,
} from '@/lib/billing/reconciliation/batch-processor';
import type { DbOrTransaction } from '@/lib/db';

describe('batch-processor', () => {
  describe('observed subscription reuse', () => {
    const user = {
      id: 'user_1',
      clerkId: null,
      isPro: true,
      stripeSubscriptionId: 'sub_1',
      stripeCustomerId: 'cus_1',
    };
    const db = {} as DbOrTransaction;
    it('passes the exact successfully retrieved subscription to the observer', async () => {
      const subscription = {
        id: 'sub_1',
        status: 'active',
      } as Stripe.Subscription;
      const retrieve = vi.fn().mockResolvedValue(subscription);
      const stripe = { subscriptions: { retrieve } } as unknown as Stripe;
      const observed = vi.fn();
      expect(await processSingleUser(db, stripe, user, observed)).toEqual({
        action: 'no_mismatch',
      });
      expect(retrieve).toHaveBeenCalledExactlyOnceWith('sub_1');
      expect(observed).toHaveBeenCalledExactlyOnceWith(subscription);
    });
    it('observes before status handling and never observes failed or missing retrievals', async () => {
      const failure = new Error(
        'fixture observer stopped before status handling'
      );
      const retrieve = vi
        .fn()
        .mockResolvedValue({ id: 'sub_1', status: 'canceled' });
      const stripe = { subscriptions: { retrieve } } as unknown as Stripe;
      const observed = vi.fn(() => {
        throw failure;
      });
      await expect(processSingleUser(db, stripe, user, observed)).rejects.toBe(
        failure
      );
      expect(observed).toHaveBeenCalledTimes(1);
      observed.mockClear();
      retrieve
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('fixture unavailable'));
      expect(await processSingleUser(db, stripe, user, observed)).toEqual({
        action: 'skipped',
      });
      expect(await processSingleUser(db, stripe, user, observed)).toEqual({
        action: 'error',
        error: 'fixture unavailable',
      });
      expect(
        await processSingleUser(
          db,
          stripe,
          { ...user, stripeSubscriptionId: null },
          observed
        )
      ).toEqual({ action: 'skipped' });
      expect(observed).not.toHaveBeenCalled();
    });
  });
  describe('BATCH_SIZE', () => {
    it('should be 100', () => {
      expect(BATCH_SIZE).toBe(100);
    });
  });

  describe('updateStatsFromResult', () => {
    function createEmptyStats(): ReconciliationStats {
      return {
        usersChecked: 0,
        mismatches: 0,
        fixed: 0,
        errors: 0,
        orphanedSubscriptions: 0,
        staleCustomers: 0,
      };
    }

    it('should not change stats for skipped result', () => {
      const stats = createEmptyStats();
      const errors: string[] = [];
      const result: ProcessUserResult = { action: 'skipped' };

      updateStatsFromResult(stats, errors, 'user_1', result);

      expect(stats.mismatches).toBe(0);
      expect(stats.fixed).toBe(0);
      expect(stats.errors).toBe(0);
      expect(errors).toHaveLength(0);
    });

    it('should not change stats for no_mismatch result', () => {
      const stats = createEmptyStats();
      const errors: string[] = [];
      const result: ProcessUserResult = { action: 'no_mismatch' };

      updateStatsFromResult(stats, errors, 'user_1', result);

      expect(stats.mismatches).toBe(0);
      expect(stats.fixed).toBe(0);
      expect(stats.errors).toBe(0);
      expect(errors).toHaveLength(0);
    });

    it('should increment mismatches and fixed for fixed result', () => {
      const stats = createEmptyStats();
      const errors: string[] = [];
      const result: ProcessUserResult = { action: 'fixed' };

      updateStatsFromResult(stats, errors, 'user_1', result);

      expect(stats.mismatches).toBe(1);
      expect(stats.fixed).toBe(1);
      expect(stats.errors).toBe(0);
      expect(errors).toHaveLength(0);
    });

    it('should increment orphaned, mismatches, and fixed for orphaned_fixed', () => {
      const stats = createEmptyStats();
      const errors: string[] = [];
      const result: ProcessUserResult = { action: 'orphaned_fixed' };

      updateStatsFromResult(stats, errors, 'user_1', result);

      expect(stats.orphanedSubscriptions).toBe(1);
      expect(stats.mismatches).toBe(1);
      expect(stats.fixed).toBe(1);
      expect(stats.errors).toBe(0);
    });

    it('should increment orphaned, mismatches, errors and add error message for orphaned_error', () => {
      const stats = createEmptyStats();
      const errors: string[] = [];
      const result: ProcessUserResult = {
        action: 'orphaned_error',
        error: 'DB write failed',
      };

      updateStatsFromResult(stats, errors, 'user_42', result);

      expect(stats.orphanedSubscriptions).toBe(1);
      expect(stats.mismatches).toBe(1);
      expect(stats.errors).toBe(1);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('user_42');
      expect(errors[0]).toContain('DB write failed');
    });

    it('should increment errors and add error message for error result', () => {
      const stats = createEmptyStats();
      const errors: string[] = [];
      const result: ProcessUserResult = {
        action: 'error',
        error: 'Stripe timeout',
      };

      updateStatsFromResult(stats, errors, 'user_99', result);

      expect(stats.errors).toBe(1);
      expect(stats.mismatches).toBe(0);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('user_99');
      expect(errors[0]).toContain('Stripe timeout');
    });

    it('should accumulate stats across multiple calls', () => {
      const stats = createEmptyStats();
      const errors: string[] = [];

      updateStatsFromResult(stats, errors, 'u1', { action: 'fixed' });
      updateStatsFromResult(stats, errors, 'u2', { action: 'fixed' });
      updateStatsFromResult(stats, errors, 'u3', { action: 'orphaned_fixed' });
      updateStatsFromResult(stats, errors, 'u4', {
        action: 'error',
        error: 'fail',
      });
      updateStatsFromResult(stats, errors, 'u5', { action: 'no_mismatch' });

      expect(stats.mismatches).toBe(3);
      expect(stats.fixed).toBe(3);
      expect(stats.errors).toBe(1);
      expect(stats.orphanedSubscriptions).toBe(1);
      expect(errors).toHaveLength(1);
    });
  });
});
