import { describe, expect, it } from 'vitest';

import {
  type AttentionMessageClass,
  type AttentionPolicyInput,
  evaluateAttentionPolicy,
} from './attention-policy';
import {
  defaultRecipientPreferences,
  type RecipientPreferences,
} from './recipient-preferences';

const MONDAY_0300_PT = new Date('2026-10-05T10:00:00.000Z');
const MONDAY_0659_PT = new Date('2026-10-05T13:59:00.000Z');
const MONDAY_0700_PT = new Date('2026-10-05T14:00:00.000Z');
const MONDAY_1200_PT = new Date('2026-10-05T19:00:00.000Z');
const SATURDAY_0300_PT = new Date('2026-10-03T10:00:00.000Z');
const SATURDAY_1200_PT = new Date('2026-10-03T19:00:00.000Z');

function recipientPreferences(
  overrides: Partial<RecipientPreferences> = {}
): RecipientPreferences {
  return {
    ...defaultRecipientPreferences({
      betterAuthUserId: 'ba_user_recipient',
      recipientKind: 'tim',
    }),
    weekendBehavior: 'suppress_weekends',
    channels: { email: true, sms: true, push: true },
    marketingOptIn: true,
    marketingConsent: {
      version: 'recipient-marketing-v1',
      recordedAt: '2026-09-25T15:00:00.000Z',
    },
    ...overrides,
  };
}

function evaluate(
  overrides: Partial<AttentionPolicyInput> = {}
): ReturnType<typeof evaluateAttentionPolicy> {
  return evaluateAttentionPolicy({
    preferences: recipientPreferences(),
    messageClass: 'transactional',
    urgency: 'routine',
    channel: 'sms',
    now: MONDAY_1200_PT,
    expiresAt: null,
    dedupeIdentity: 'notification:123',
    criticalBypass: null,
    ...overrides,
  });
}

const MESSAGE_CLASSES: readonly AttentionMessageClass[] = [
  'transactional',
  'operational',
  'marketing',
];

const WINDOWS = [
  {
    quiet: false,
    weekend: false,
    now: MONDAY_1200_PT,
    until: null,
    reason: null,
  },
  {
    quiet: true,
    weekend: false,
    now: MONDAY_0300_PT,
    until: MONDAY_0700_PT,
    reason: 'quiet-window',
  },
  {
    quiet: false,
    weekend: true,
    now: SATURDAY_1200_PT,
    until: MONDAY_0700_PT,
    reason: 'weekend',
  },
  {
    quiet: true,
    weekend: true,
    now: SATURDAY_0300_PT,
    until: MONDAY_0700_PT,
    reason: 'weekend',
  },
] as const;

const MATRIX = MESSAGE_CLASSES.flatMap(messageClass =>
  WINDOWS.flatMap(window =>
    [false, true].map(bypass => ({ messageClass, bypass, ...window }))
  )
);

describe('evaluateAttentionPolicy class × quiet-window × weekend × bypass', () => {
  it.each(MATRIX)(
    '$messageClass quiet=$quiet weekend=$weekend bypass=$bypass',
    ({ messageClass, bypass, now, until, reason }) => {
      const decision = evaluate({
        messageClass,
        urgency: bypass ? 'critical' : 'routine',
        criticalBypass: bypass
          ? { justification: 'Waiting would break the active transaction.' }
          : null,
        now,
        dedupeIdentity: `${messageClass}:matrix`,
      });

      if (!reason) {
        expect(decision).toEqual({
          action: 'deliver-now',
          reason: 'allowed-window',
          dedupeIdentity: `${messageClass}:matrix`,
          bypassed: false,
        });
        return;
      }

      if (messageClass === 'transactional' && bypass) {
        expect(decision).toEqual({
          action: 'deliver-now',
          reason: 'critical-bypass',
          dedupeIdentity: 'transactional:matrix',
          bypassed: true,
        });
        return;
      }

      if (messageClass === 'operational') {
        expect(decision).toEqual({
          action: 'aggregate',
          reason,
          aggregationKey: 'operational:matrix',
          until,
        });
        return;
      }

      expect(decision).toEqual({
        action: 'defer-until',
        reason,
        dedupeIdentity: `${messageClass}:matrix`,
        until,
      });
    }
  );
});

describe('evaluateAttentionPolicy safeguards', () => {
  it('uses the documented Tim fallback when no stored preference exists', () => {
    expect(recipientPreferences()).toMatchObject({
      timezone: 'America/Los_Angeles',
      quietHours: { start: '22:00', end: '07:00' },
    });
  });

  it('requires critical urgency and a non-empty request for bypass', () => {
    for (const input of [
      { urgency: 'critical' as const, criticalBypass: null },
      {
        urgency: 'urgent' as const,
        criticalBypass: { justification: 'Urgent is not critical.' },
      },
      {
        urgency: 'critical' as const,
        criticalBypass: { justification: '   ' },
      },
    ]) {
      expect(evaluate({ ...input, now: MONDAY_0300_PT }).action).toBe(
        'defer-until'
      );
    }
  });

  it('suppresses a disabled channel before considering a bypass', () => {
    expect(
      evaluate({
        preferences: recipientPreferences({
          channels: { email: true, sms: false, push: true },
        }),
        urgency: 'critical',
        now: MONDAY_0300_PT,
        criticalBypass: { justification: 'Critical transaction.' },
      })
    ).toEqual({ action: 'suppress', reason: 'channel-disabled' });
  });

  it('suppresses marketing without explicit opt-in', () => {
    expect(
      evaluate({
        messageClass: 'marketing',
        channel: 'email',
        preferences: recipientPreferences({
          marketingOptIn: false,
          marketingConsent: null,
        }),
      })
    ).toEqual({
      action: 'suppress',
      reason: 'marketing-opt-in-required',
    });
  });

  it('suppresses expired work even when a critical bypass is requested', () => {
    expect(
      evaluate({
        urgency: 'critical',
        now: MONDAY_0300_PT,
        expiresAt: MONDAY_0300_PT,
        criticalBypass: { justification: 'Critical transaction.' },
      })
    ).toEqual({ action: 'suppress', reason: 'expired' });
  });

  it('suppresses work that expires before the next allowed window', () => {
    expect(
      evaluate({
        now: MONDAY_0659_PT,
        expiresAt: new Date('2026-10-05T13:59:30.000Z'),
      })
    ).toEqual({
      action: 'suppress',
      reason: 'expires-before-next-window',
    });
  });

  it('defers work that remains valid beyond the next allowed window', () => {
    expect(
      evaluate({
        now: MONDAY_0659_PT,
        expiresAt: new Date('2026-10-05T14:01:00.000Z'),
      })
    ).toEqual({
      action: 'defer-until',
      reason: 'quiet-window',
      dedupeIdentity: 'notification:123',
      until: MONDAY_0700_PT,
    });
  });

  it('uses the recipient timezone instead of the server timezone', () => {
    const decision = evaluate({
      messageClass: 'operational',
      channel: 'email',
      preferences: recipientPreferences({
        timezone: 'Australia/Sydney',
        weekendBehavior: 'observe_quiet_hours',
      }),
      // 19:00 UTC is 06:00 the next day in Sydney and 12:00 in Los Angeles.
      now: MONDAY_1200_PT,
    });

    expect(decision.action).toBe('aggregate');
    if (decision.action === 'aggregate') {
      expect(decision.reason).toBe('quiet-window');
      expect(decision.until).toEqual(new Date('2026-10-05T20:00:00.000Z'));
    }
  });

  it('observes only quiet hours for weekend-eligible recipients', () => {
    expect(
      evaluate({
        preferences: recipientPreferences({
          weekendBehavior: 'weekend_briefing_eligible',
        }),
        now: SATURDAY_1200_PT,
      })
    ).toEqual({
      action: 'deliver-now',
      reason: 'allowed-window',
      dedupeIdentity: 'notification:123',
      bypassed: false,
    });
  });

  it('handles a same-day quiet window', () => {
    expect(
      evaluate({
        preferences: recipientPreferences({
          quietHours: { start: '12:00', end: '13:00' },
          weekendBehavior: 'observe_quiet_hours',
        }),
        now: MONDAY_1200_PT,
      })
    ).toEqual({
      action: 'defer-until',
      reason: 'quiet-window',
      dedupeIdentity: 'notification:123',
      until: new Date('2026-10-05T20:00:00.000Z'),
    });
  });

  it('normalizes the dedupe identity used for delivery and aggregation', () => {
    expect(evaluate({ dedupeIdentity: '  stable:event:1  ' })).toMatchObject({
      action: 'deliver-now',
      dedupeIdentity: 'stable:event:1',
    });
    expect(
      evaluate({
        messageClass: 'operational',
        now: MONDAY_0300_PT,
        dedupeIdentity: '  stable:event:1  ',
      })
    ).toMatchObject({
      action: 'aggregate',
      aggregationKey: 'stable:event:1',
    });
  });

  it.each([
    { dedupeIdentity: '   ' },
    { now: new Date('invalid') },
    { expiresAt: new Date('invalid') },
    { messageClass: 'other' as AttentionMessageClass },
    { urgency: 'other' as AttentionPolicyInput['urgency'] },
    {
      preferences: recipientPreferences({
        quietHours: { start: '22:00', end: '22:00' },
      }),
    },
    { preferences: recipientPreferences({ timezone: 'PST' }) },
    {
      preferences: recipientPreferences({
        weekendBehavior: 'other' as RecipientPreferences['weekendBehavior'],
      }),
    },
  ])('fails closed for invalid policy input %#', invalidInput => {
    expect(evaluate(invalidInput)).toEqual({
      action: 'suppress',
      reason: 'invalid-policy-input',
    });
  });
});
