import { describe, expect, it } from 'vitest';
import { deriveNudgeState } from '@/lib/queries/usePlanGate';

const NOW = new Date('2026-04-28T12:00:00Z').getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

function isoDaysFromNow(days: number): string {
  return new Date(NOW + days * DAY_MS).toISOString();
}

describe('deriveNudgeState', () => {
  describe('paid plans', () => {
    it('returns max_paid for plan=max', () => {
      expect(
        deriveNudgeState({ plan: 'max', trialEndsAt: null, now: NOW })
      ).toBe('max_paid');
    });

    it('returns max_paid for plan=growth (alias)', () => {
      expect(
        deriveNudgeState({ plan: 'growth', trialEndsAt: null, now: NOW })
      ).toBe('max_paid');
    });

    it('returns pro_paid for plan=pro', () => {
      expect(
        deriveNudgeState({ plan: 'pro', trialEndsAt: null, now: NOW })
      ).toBe('pro_paid');
    });

    it('returns pro_paid for plan=founding (alias)', () => {
      expect(
        deriveNudgeState({ plan: 'founding', trialEndsAt: null, now: NOW })
      ).toBe('pro_paid');
    });

    it('paid plans dominate trial fields (mid-trial upgrade case)', () => {
      // A user who upgrades during trial: plan flips to pro, but trialEndsAt
      // may still be set. nudgeState should reflect the new paid status.
      expect(
        deriveNudgeState({
          plan: 'pro',
          trialEndsAt: isoDaysFromNow(5),
          now: NOW,
        })
      ).toBe('pro_paid');
    });
  });

  describe('trial states', () => {
    it('returns trial_honeymoon for >3 days remaining', () => {
      expect(
        deriveNudgeState({
          plan: 'trial',
          trialEndsAt: isoDaysFromNow(7),
          now: NOW,
        })
      ).toBe('trial_honeymoon');
    });

    it('returns trial_late for exactly 3 days remaining', () => {
      expect(
        deriveNudgeState({
          plan: 'trial',
          trialEndsAt: isoDaysFromNow(3),
          now: NOW,
        })
      ).toBe('trial_late');
    });

    it('returns trial_late for 1 day remaining', () => {
      expect(
        deriveNudgeState({
          plan: 'trial',
          // 1.5 days, floors to 1 — well within trial_late threshold
          trialEndsAt: new Date(NOW + 1.5 * DAY_MS).toISOString(),
          now: NOW,
        })
      ).toBe('trial_late');
    });

    it('returns trial_last_day for 0 days remaining (less than 24h)', () => {
      expect(
        deriveNudgeState({
          plan: 'trial',
          trialEndsAt: new Date(NOW + 12 * 60 * 60 * 1000).toISOString(),
          now: NOW,
        })
      ).toBe('trial_last_day');
    });

    it('returns recently_lapsed when trial expired but plan still says trial', () => {
      // Cron hasn't flipped plan yet, but the time-based check should win.
      expect(
        deriveNudgeState({
          plan: 'trial',
          trialEndsAt: isoDaysFromNow(-1),
          now: NOW,
        })
      ).toBe('recently_lapsed');
    });
  });

  describe('lapsed states', () => {
    it('returns recently_lapsed for free with trial that ended 3 days ago', () => {
      expect(
        deriveNudgeState({
          plan: 'free',
          trialEndsAt: isoDaysFromNow(-3),
          now: NOW,
        })
      ).toBe('recently_lapsed');
    });

    it('returns recently_lapsed at the 30-day boundary (inclusive)', () => {
      expect(
        deriveNudgeState({
          plan: 'free',
          trialEndsAt: isoDaysFromNow(-30),
          now: NOW,
        })
      ).toBe('recently_lapsed');
    });

    it('returns stale_lapsed for trial that ended >30 days ago', () => {
      expect(
        deriveNudgeState({
          plan: 'free',
          trialEndsAt: isoDaysFromNow(-45),
          now: NOW,
        })
      ).toBe('stale_lapsed');
    });
  });

  describe('never trialed', () => {
    it('returns never_trialed for free with no trialEndsAt', () => {
      expect(
        deriveNudgeState({
          plan: 'free',
          trialEndsAt: null,
          now: NOW,
        })
      ).toBe('never_trialed');
    });

    it('returns never_trialed for null plan', () => {
      expect(
        deriveNudgeState({
          plan: null,
          trialEndsAt: null,
          now: NOW,
        })
      ).toBe('never_trialed');
    });

    it('returns never_trialed for unknown plan string', () => {
      expect(
        deriveNudgeState({
          plan: 'something_unexpected',
          trialEndsAt: null,
          now: NOW,
        })
      ).toBe('never_trialed');
    });
  });

  describe('edge cases', () => {
    it('handles NaN trialEndsAt by returning never_trialed (free plan)', () => {
      expect(
        deriveNudgeState({
          plan: 'free',
          trialEndsAt: 'not-a-date',
          now: NOW,
        })
      ).toBe('never_trialed');
    });

    it('handles NaN trialEndsAt during trial plan by returning never_trialed', () => {
      expect(
        deriveNudgeState({
          plan: 'trial',
          trialEndsAt: 'not-a-date',
          now: NOW,
        })
      ).toBe('never_trialed');
    });

    it('handles trial plan with null trialEndsAt by falling through to never_trialed', () => {
      // Defensive — shouldn't happen, but the function shouldn't crash.
      expect(
        deriveNudgeState({
          plan: 'trial',
          trialEndsAt: null,
          now: NOW,
        })
      ).toBe('never_trialed');
    });
  });
});
