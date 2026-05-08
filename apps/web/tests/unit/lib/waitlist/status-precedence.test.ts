import { describe, expect, it } from 'vitest';
import {
  isStatusUpgrade,
  type LifecycleUserStatus,
  STATUS_RANK,
} from '@/lib/waitlist/status-precedence';

const ALL_STATUSES: LifecycleUserStatus[] = [
  'waitlist_pending',
  'waitlist_approved',
  'profile_claimed',
  'onboarding_incomplete',
  'active',
  'suspended',
  'banned',
];

describe('isStatusUpgrade', () => {
  it('treats null/undefined current as upgradable to any status', () => {
    for (const next of ALL_STATUSES) {
      expect(isStatusUpgrade(null, next)).toBe(true);
      expect(isStatusUpgrade(undefined, next)).toBe(true);
    }
  });

  it('allows same-rank writes (no-op idempotent)', () => {
    for (const status of ALL_STATUSES) {
      expect(isStatusUpgrade(status, status)).toBe(true);
    }
  });

  it('blocks every downgrade pair', () => {
    for (const current of ALL_STATUSES) {
      for (const next of ALL_STATUSES) {
        const expected = STATUS_RANK[next] >= STATUS_RANK[current];
        expect(
          isStatusUpgrade(current, next),
          `${current} -> ${next} expected ${expected}`
        ).toBe(expected);
      }
    }
  });

  it('never lets active be downgraded by waitlist_approved', () => {
    expect(isStatusUpgrade('active', 'waitlist_approved')).toBe(false);
    expect(isStatusUpgrade('active', 'waitlist_pending')).toBe(false);
  });

  it('never lets profile_claimed be downgraded by waitlist_pending', () => {
    expect(isStatusUpgrade('profile_claimed', 'waitlist_pending')).toBe(false);
  });

  it('never lets onboarding_incomplete be downgraded by waitlist_approved', () => {
    expect(isStatusUpgrade('onboarding_incomplete', 'waitlist_approved')).toBe(
      false
    );
  });

  it('refuses to overwrite an unknown status (fail closed)', () => {
    expect(isStatusUpgrade('mystery_state', 'waitlist_approved')).toBe(false);
    expect(isStatusUpgrade('legacy_value', 'active')).toBe(false);
  });

  it('allows waitlist_pending -> waitlist_approved upgrade', () => {
    expect(isStatusUpgrade('waitlist_pending', 'waitlist_approved')).toBe(true);
  });
});
