import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockResendSend = vi.hoisted(() => vi.fn());
const mockResend = vi.hoisted(() =>
  vi.fn().mockImplementation(function (this: {
    emails?: { send: typeof mockResendSend };
  }) {
    this.emails = { send: mockResendSend };
  })
);

vi.mock('resend', () => ({ Resend: mockResend }));
vi.mock('@/lib/env-server', () => ({
  env: { RESEND_API_KEY: 'test-resend-key' },
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/notifications/suppression', () => ({
  isEmailSuppressed: vi.fn(async () => ({ suppressed: false })),
}));
vi.mock('@/lib/ovie/summer-cards.server', () => ({
  getSummerCard: vi.fn(async () => null),
}));
vi.mock('@/lib/email/gateway/pause.server', () => ({
  readStreamPause: vi.fn(async () => null),
}));
vi.mock('@/lib/rate-limit', () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
}));

import { GatewayEmailProvider } from '@/lib/notifications/providers/gateway';

const message = {
  stream: 'transactional' as const,
  purpose: 'welcome',
  consent: 'account-transaction' as const,
  subject: 'Welcome',
  text: 'Hello',
  html: '<p>Hello</p>',
};

describe('GatewayEmailProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResendSend.mockResolvedValue({ data: { id: 'msg_123' }, error: null });
  });

  it('skips reserved test domains without calling Resend', async () => {
    const result = await new GatewayEmailProvider().sendEmail({
      ...message,
      to: 'qa-user@example.com',
    });
    expect(result).toMatchObject({ status: 'skipped', provider: 'gateway' });
    expect(result.detail).toContain('reserved for testing');
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it('sends from the registry sender with stream tags and the idempotency key', async () => {
    const result = await new GatewayEmailProvider().sendEmail({
      ...message,
      to: 'artist@jov.ie',
      idempotencyKey: 'waitlist_invite:entry:token-hash',
    });
    expect(result).toMatchObject({ status: 'sent', detail: 'msg_123' });
    expect(mockResendSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Jovie <notifications@send.jov.ie>',
        to: ['artist@jov.ie'],
        replyTo: 'tim@jov.ie',
        tags: [
          { name: 'stream', value: 'transactional' },
          { name: 'purpose', value: 'welcome' },
        ],
      }),
      { idempotencyKey: 'waitlist_invite:entry:token-hash' }
    );
  });

  it('returns an error and never calls Resend for a cold send', async () => {
    const result = await new GatewayEmailProvider().sendEmail({
      ...message,
      stream: 'cold',
      consent: 'legitimate-interest',
      to: 'lead@example.org',
    });
    expect(result.status).toBe('error');
    expect(result.error).toMatch(/^stream-closed/);
    expect(mockResendSend).not.toHaveBeenCalled();
  });
});
