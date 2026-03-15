import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadSenderPolicy(overrides?: {
  resendFromEmail?: string;
  resendReplyToEmail?: string;
}) {
  vi.resetModules();
  vi.doMock('@/lib/env-server', () => ({
    env: {
      RESEND_FROM_EMAIL: overrides?.resendFromEmail,
      RESEND_REPLY_TO_EMAIL: overrides?.resendReplyToEmail,
    },
  }));

  return import('@/lib/notifications/sender-policy');
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('@/lib/env-server');
});

describe('sender policy', () => {
  it('resolves founder sender to notify.jov.ie with reply-to at jov.ie', async () => {
    const policy = await loadSenderPolicy();
    expect(policy.getSenderPolicy('founder')).toEqual({
      fromEmail: 'tim@notify.jov.ie',
      replyToEmail: 'tim@jov.ie',
    });
  });

  it('resolves system sender to notifications@notify.jov.ie by default', async () => {
    const policy = await loadSenderPolicy();
    expect(policy.getSenderPolicy('system')).toEqual({
      fromEmail: 'notifications@notify.jov.ie',
      replyToEmail: 'notifications@notify.jov.ie',
    });
  });

  it('formats dynamic "via Jovie" senders with system mailbox', async () => {
    const policy = await loadSenderPolicy();
    expect(policy.formatSystemSender('Artist Name')).toBe(
      'Artist Name via Jovie <notifications@notify.jov.ie>'
    );
  });

  it('honors system env overrides for from/reply-to', async () => {
    const policy = await loadSenderPolicy({
      resendFromEmail: 'custom@example.com',
      resendReplyToEmail: 'support@jov.ie',
    });
    expect(policy.getSenderPolicy('system')).toEqual({
      fromEmail: 'custom@example.com',
      replyToEmail: 'support@jov.ie',
    });
  });
});
