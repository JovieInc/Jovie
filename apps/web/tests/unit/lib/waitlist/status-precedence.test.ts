import { describe, expect, it } from 'vitest';
import {
  isStatusUpgrade,
  STATUS_PRECEDENCE,
  type UserLifecycleStatus,
} from '@/lib/waitlist/status-precedence';

describe('status-precedence', () => {
  describe('isStatusUpgrade', () => {
    it('accepts any status when current is null (new user)', () => {
      expect(isStatusUpgrade(null, 'waitlist_pending')).toBe(true);
      expect(isStatusUpgrade(null, 'active')).toBe(true);
      expect(isStatusUpgrade(undefined, 'waitlist_approved')).toBe(true);
    });

    it('accepts forward transitions', () => {
      expect(isStatusUpgrade('waitlist_pending', 'waitlist_approved')).toBe(
        true
      );
      expect(isStatusUpgrade('waitlist_approved', 'profile_claimed')).toBe(
        true
      );
      expect(isStatusUpgrade('profile_claimed', 'active')).toBe(true);
    });

    it('accepts equal-rank transitions (idempotent)', () => {
      expect(isStatusUpgrade('active', 'active')).toBe(true);
      expect(isStatusUpgrade('waitlist_approved', 'waitlist_approved')).toBe(
        true
      );
    });

    it('rejects backward transitions (downgrades)', () => {
      // The canonical regression case: existing active user, intake re-runs
      // and tries to set waitlist_approved or waitlist_pending.
      expect(isStatusUpgrade('active', 'waitlist_approved')).toBe(false);
      expect(isStatusUpgrade('active', 'waitlist_pending')).toBe(false);
      // Existing waitlist_approved user, intake re-runs and tries to set
      // waitlist_pending.
      expect(isStatusUpgrade('waitlist_approved', 'waitlist_pending')).toBe(
        false
      );
      // Profile-claimed should not be downgraded to waitlist_approved.
      expect(isStatusUpgrade('profile_claimed', 'waitlist_approved')).toBe(
        false
      );
    });

    it('treats suspended/banned as terminal — rejects downgrades', () => {
      expect(isStatusUpgrade('suspended', 'active')).toBe(false);
      expect(isStatusUpgrade('banned', 'active')).toBe(false);
      expect(isStatusUpgrade('banned', 'waitlist_approved')).toBe(false);
    });
  });

  describe('STATUS_PRECEDENCE', () => {
    it('covers every enum value with a unique-or-tiered numeric rank', () => {
      const ranks = Object.values(STATUS_PRECEDENCE);
      expect(ranks.length).toBeGreaterThan(0);
      for (const rank of ranks) {
        expect(typeof rank).toBe('number');
        expect(rank).toBeGreaterThan(0);
      }
    });

    it('orders waitlist_pending < waitlist_approved < active', () => {
      const pending: UserLifecycleStatus = 'waitlist_pending';
      const approved: UserLifecycleStatus = 'waitlist_approved';
      const active: UserLifecycleStatus = 'active';
      expect(STATUS_PRECEDENCE[pending]).toBeLessThan(
        STATUS_PRECEDENCE[approved]
      );
      expect(STATUS_PRECEDENCE[approved]).toBeLessThan(
        STATUS_PRECEDENCE[active]
      );
    });
  });
});
