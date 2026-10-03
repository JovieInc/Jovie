import { describe, expect, it } from 'vitest';

import { attentionBlockAt, evaluateAttention } from './attention-policy';
import {
  defaultRecipientPreferences,
  type RecipientPreferences,
} from './recipient-preferences';

function timPrefs(
  overrides: Partial<RecipientPreferences> = {}
): RecipientPreferences {
  const base = defaultRecipientPreferences({
    betterAuthUserId: 'ba_user_tim',
    recipientKind: 'tim',
  });
  return {
    ...base,
    quietHours: { start: '22:00', end: '07:00' },
    channels: { email: true, sms: true, push: true, in_app: true },
    ...overrides,
  };
}

// 2026-10-03 is a Saturday. 2026-10-05 is a Monday.
const MON_0300_PT = new Date('2026-10-05T10:00:00Z'); // 03:00 America/Los_Angeles
const MON_1200_PT = new Date('2026-10-05T19:00:00Z'); // 12:00
const MON_0659_PT = new Date('2026-10-05T13:59:00Z'); // 06:59
const MON_0700_PT = new Date('2026-10-05T14:00:00Z'); // 07:00
const SAT_1200_PT = new Date('2026-10-03T19:00:00Z'); // Saturday 12:00

describe('evaluateAttention', () => {
  it('delivers transactional notifications inside the allowed window', () => {
    const decision = evaluateAttention({
      notificationClass: 'transactional',
      channel: 'sms',
      preferences: timPrefs(),
      now: MON_1200_PT,
    });
    expect(decision).toEqual({ action: 'deliver', bypassed: false });
  });

  it('defers transactional notifications during quiet hours without justification', () => {
    const decision = evaluateAttention({
      notificationClass: 'transactional',
      channel: 'sms',
      preferences: timPrefs(),
      now: MON_0300_PT,
    });
    expect(decision).toEqual({
      action: 'defer',
      reason: 'quiet_hours',
      deliverAt: MON_0700_PT,
    });
  });

  it('delivers a transactional bypass when delay would break the transaction', () => {
    const decision = evaluateAttention({
      notificationClass: 'transactional',
      channel: 'sms',
      preferences: timPrefs(),
      now: MON_0300_PT,
      bypass: {
        justification: 'Sign-in OTP; delaying until 07:00 breaks the login.',
      },
    });
    expect(decision).toEqual({ action: 'deliver', bypassed: true });
  });

  it('rejects a transactional bypass with an empty justification', () => {
    const decision = evaluateAttention({
      notificationClass: 'transactional',
      channel: 'sms',
      preferences: timPrefs(),
      now: MON_0300_PT,
      bypass: { justification: '   ' },
    });
    expect(decision.action).toBe('defer');
  });

  it('defers operational notifications during quiet hours and ignores bypass', () => {
    const decision = evaluateAttention({
      notificationClass: 'operational',
      channel: 'push',
      preferences: timPrefs(),
      now: MON_0300_PT,
      bypass: { justification: 'feels urgent' },
    });
    expect(decision).toEqual({
      action: 'defer',
      reason: 'quiet_hours',
      deliverAt: MON_0700_PT,
    });
  });

  it('suppresses marketing without an explicit opt-in', () => {
    const decision = evaluateAttention({
      notificationClass: 'marketing',
      channel: 'email',
      preferences: timPrefs(),
      now: MON_1200_PT,
    });
    expect(decision).toEqual({
      action: 'suppress',
      reason: 'marketing_opt_in_required',
    });
  });

  it('defers opted-in marketing during quiet hours and never bypasses', () => {
    const preferences = timPrefs({
      marketingOptIn: true,
      marketingConsent: {
        version: 'recipient-marketing-v1',
        recordedAt: '2026-09-25T15:00:00.000Z',
      },
    });
    const decision = evaluateAttention({
      notificationClass: 'marketing',
      channel: 'email',
      preferences,
      now: MON_0300_PT,
      bypass: { justification: 'campaign launch' },
    });
    expect(decision).toEqual({
      action: 'defer',
      reason: 'quiet_hours',
      deliverAt: MON_0700_PT,
    });
  });

  it('suppresses notifications on a disabled channel', () => {
    const decision = evaluateAttention({
      notificationClass: 'transactional',
      channel: 'push',
      preferences: timPrefs({
        channels: { email: true, sms: true, push: false, in_app: true },
      }),
      now: MON_1200_PT,
      bypass: { justification: 'otp' },
    });
    expect(decision).toEqual({
      action: 'suppress',
      reason: 'channel_disabled',
    });
  });

  it('suppresses weekend delivery for suppress_weekends recipients until Monday', () => {
    const preferences = timPrefs({
      weekendBehavior: 'suppress_weekends',
      quietHours: { start: '02:00', end: '04:00' },
    });
    const decision = evaluateAttention({
      notificationClass: 'operational',
      channel: 'email',
      preferences,
      now: SAT_1200_PT,
    });
    expect(decision.action).toBe('defer');
    if (decision.action !== 'defer') return;
    expect(decision.reason).toBe('weekend_suppression');
    // First allowed minute: Monday 00:00 PT = 07:00Z, which is outside the
    // 02:00–04:00 quiet window.
    expect(decision.deliverAt).toEqual(new Date('2026-10-05T07:00:00Z'));
  });

  it('still delivers transactional notifications on suppressed weekends', () => {
    const decision = evaluateAttention({
      notificationClass: 'transactional',
      channel: 'sms',
      preferences: timPrefs({ weekendBehavior: 'suppress_weekends' }),
      now: SAT_1200_PT,
    });
    expect(decision).toEqual({ action: 'deliver', bypassed: false });
  });

  it('uses the recipient timezone, not the server clock', () => {
    // 12:00 PT is 19:00 UTC — the same instant is inside quiet hours for a
    // recipient in Pacific/Kiritimati (UTC+14, where it is 09:00 Tuesday? no:
    // 19:00Z + 14h = 09:00 next day). Use Sydney (UTC+11): 19:00Z = 06:00
    // Tuesday local, inside 22:00–07:00 quiet hours.
    const preferences = timPrefs({ timezone: 'Australia/Sydney' });
    const decision = evaluateAttention({
      notificationClass: 'operational',
      channel: 'email',
      preferences,
      now: MON_1200_PT,
    });
    expect(decision.action).toBe('defer');
  });

  it('handles quiet windows that do not wrap midnight', () => {
    const preferences = timPrefs({
      quietHours: { start: '12:00', end: '13:00' },
    });
    expect(attentionBlockAt(preferences, 'operational', MON_1200_PT)).toBe(
      'quiet_hours'
    );
    expect(
      attentionBlockAt(preferences, 'operational', MON_0300_PT)
    ).toBeNull();
  });

  it('defers until the exact quiet-hours boundary', () => {
    const decision = evaluateAttention({
      notificationClass: 'operational',
      channel: 'email',
      preferences: timPrefs(),
      now: MON_0659_PT,
    });
    expect(decision).toEqual({
      action: 'defer',
      reason: 'quiet_hours',
      deliverAt: MON_0700_PT,
    });
  });
});
