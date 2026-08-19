import { describe, expect, it } from 'vitest';
import {
  alreadyRecorded,
  decideRecurrence,
  parseSentryIssueId,
  recurrenceComment,
} from '../../sentry-autofix-recurrence.mjs';

describe('sentry autofix recurrence', () => {
  it('parses the Issue ID from the autofix PR body', () => {
    expect(
      parseSentryIssueId('- **Issue ID:** 1234567890\n- **Route:** /api/chat')
    ).toBe('1234567890');
    expect(parseSentryIssueId('no id here')).toBeNull();
  });

  it('waits for soak then resolves quiet issues and reopens firing ones', () => {
    const mergedAt = '2026-08-19T00:00:00.000Z';
    const now = new Date('2026-08-19T01:00:00.000Z');
    expect(
      decideRecurrence({
        mergedAt,
        lastSeen: '2026-08-18T23:00:00.000Z',
        now,
      })
    ).toEqual({ action: 'resolve', reason: 'quiet_after_deploy' });
    expect(
      decideRecurrence({
        mergedAt,
        lastSeen: '2026-08-19T00:30:00.000Z',
        now,
      })
    ).toEqual({ action: 'reopen', reason: 'still_firing' });
    expect(
      decideRecurrence({
        mergedAt,
        lastSeen: '2026-08-19T00:30:00.000Z',
        now: new Date('2026-08-19T00:10:00.000Z'),
      })
    ).toEqual({ action: 'skip', reason: 'soak_pending' });
  });

  it('does not double-comment the same lastSeen decision', () => {
    const comment = recurrenceComment({
      action: 'resolve',
      lastSeen: '2026-08-18T23:00:00.000Z',
      issueId: '1',
      sentryUrl: 'https://sentry.io/issues/1/',
    });
    expect(comment).toContain(
      '<!-- sentry-recurrence:resolved:2026-08-18T23:00:00.000Z -->'
    );
    expect(
      alreadyRecorded([comment], 'resolved', '2026-08-18T23:00:00.000Z')
    ).toBe(true);
    expect(
      alreadyRecorded([comment], 'reopened', '2026-08-18T23:00:00.000Z')
    ).toBe(false);
  });
});
