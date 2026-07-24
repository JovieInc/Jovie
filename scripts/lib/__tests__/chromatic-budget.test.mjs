import { describe, expect, it } from 'vitest';
import {
  decideBudget,
  monthKey,
  recordSnapshots,
  sumMonthUsage,
  validateState,
} from '../../chromatic-budget.mjs';

describe('chromatic-budget', () => {
  it('allows under 80%', () => {
    const d = decideBudget({ usage: 1000, limit: 5000 });
    expect(d.action).toBe('allow');
    expect(d.throttleAt).toBe(4000);
  });

  it('throttles at 80%', () => {
    const d = decideBudget({ usage: 4000, limit: 5000 });
    expect(d.action).toBe('throttle');
  });

  it('falls back at 100%', () => {
    const d = decideBudget({ usage: 5000, limit: 5000 });
    expect(d.action).toBe('fallback');
    expect(d.message).toMatch(/Do NOT auto-upgrade/);
  });

  it('refuses paid plan in state validation', () => {
    const v = validateState({
      schemaVersion: 1,
      plan: 'pro',
      monthlyLimit: 35000,
      months: {},
    });
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toMatch(/free/);
  });

  it('refuses monthlyLimit above free tier', () => {
    const v = validateState({
      schemaVersion: 1,
      plan: 'free',
      monthlyLimit: 35000,
      months: {},
    });
    expect(v.ok).toBe(false);
  });

  it('records snapshots into the current UTC month', () => {
    const now = new Date('2026-03-15T00:00:00.000Z');
    const state = recordSnapshots(
      { schemaVersion: 1, plan: 'free', monthlyLimit: 5000, months: {} },
      { snapshots: 12, pr: '99', now }
    );
    expect(sumMonthUsage(state, monthKey(now))).toBe(12);
    expect(state.months['2026-03'].records[0].pr).toBe('99');
  });
});
