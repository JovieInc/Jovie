import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockResendSend = vi.hoisted(() => vi.fn());
const mockResend = vi.hoisted(() =>
  vi.fn().mockImplementation(function (this: {
    emails?: { send: typeof mockResendSend };
  }) {
    this.emails = {
      send: mockResendSend,
    };
  })
);

vi.mock('resend', () => ({
  Resend: mockResend,
}));

vi.mock('@/lib/env-server', () => ({
  env: {
    RESEND_API_KEY: 'test-resend-key',
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/notifications/config', () => ({
  EMAIL_REPLY_TO: 'reply@jov.ie',
  RESEND_ENABLED: true,
}));

vi.mock('@/lib/notifications/sender-policy', () => ({
  formatSystemSender: vi.fn(() => 'Jovie <notifications@send.jov.ie>'),
}));

import { ResendEmailProvider } from '@/lib/notifications/providers/resend';

describe('ResendEmailProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResendSend.mockResolvedValue({
      data: { id: 'msg_123' },
      error: null,
    });
  });

  it('skips reserved test domains without calling Resend', async () => {
    const provider = new ResendEmailProvider();

    const result = await provider.sendEmail({
      to: 'qa-user@example.com',
      subject: 'Welcome',
      text: 'Hello',
      html: '<p>Hello</p>',
    });

    expect(result).toMatchObject({
      channel: 'email',
      status: 'skipped',
      provider: 'resend',
    });
    expect(result.detail).toContain('reserved for testing');
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it('sends deliverable domains through Resend', async () => {
    const provider = new ResendEmailProvider();

    const result = await provider.sendEmail({
      to: 'artist@jov.ie',
      subject: 'Welcome',
      text: 'Hello',
      html: '<p>Hello</p>',
    });

    expect(result).toMatchObject({
      channel: 'email',
      status: 'sent',
      provider: 'resend',
      detail: 'msg_123',
    });
    expect(mockResendSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['artist@jov.ie'],
      })
    );
  });
});
