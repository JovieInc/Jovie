import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  transaction: vi.fn(),
  suppressed: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: { transaction: hoisted.transaction } }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: vi.fn(),
  captureError: vi.fn(),
}));
vi.mock('@/lib/notifications/sms-suppression', async importOriginal => ({
  ...(await importOriginal<
    typeof import('@/lib/notifications/sms-suppression')
  >()),
  isPhoneSmsSuppressed: hoisted.suppressed,
}));

import { handleVerifiedInbound } from '@/lib/notifications/sms-webhook';

const verified = {
  message: {
    provider: 'twilio',
    messageId: 'evt-join',
    fromPhone: '+15551234567',
    toPhone: '+15559998888',
    body: 'JOIN ABCD2345',
  },
  rawBody: 'x',
  providerEventId: 'evt-join',
  keyUsed: 'primary',
} as never;

describe('JOIN from a blocked number', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.transaction.mockRejectedValue(new Error('should not confirm'));
  });

  it('does not consume the code or confirm a subscription', async () => {
    hoisted.suppressed.mockResolvedValue({
      suppressed: true,
      reason: 'blocked',
    });

    const result = await handleVerifiedInbound({
      verified,
      webhookEventId: 'wh-1',
      nativeSmsEnabled: true,
    });

    expect(result).toEqual({ status: 200, kind: 'join_blocked' });
    expect(hoisted.transaction).not.toHaveBeenCalled();
  });

  it('still lets a merely STOP-ed number opt back in with a fresh code', async () => {
    hoisted.suppressed.mockResolvedValue({
      suppressed: true,
      reason: 'stopped',
    });

    await handleVerifiedInbound({
      verified,
      webhookEventId: 'wh-1',
      nativeSmsEnabled: true,
    });

    expect(hoisted.transaction).toHaveBeenCalled();
  });
});
