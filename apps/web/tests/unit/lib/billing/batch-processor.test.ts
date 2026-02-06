import { describe, expect, it } from 'vitest';
import {
  BATCH_SIZE,
  type ProcessUserResult,
  type ReconciliationStats,
  updateStatsFromResult,
} from '@/lib/billing/reconciliation/batch-processor';

describe('batch-processor', () => {
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
