import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamSendResult } from '@/lib/email/gateway';

const sendStreamEmail = vi.hoisted(() => vi.fn());
vi.mock('@/lib/email/gateway', () => ({ sendStreamEmail }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/error-tracking', () => ({ captureCriticalError: vi.fn() }));

import { resendMailPort } from '@/lib/billing/price-changes/adapters';

const message = {
  to: 'subscriber@example.test',
  subject: 'Upcoming price change',
  text: 'Your price changes in 30 days.',
  html: '<p>Your price changes in 30 days.</p>',
  idempotencyKey: 'price-change:change-1:sub-1',
};

describe('price-change mail gateway adapter', () => {
  beforeEach(() => sendStreamEmail.mockReset());

  it('uses the transactional gateway with stable provider idempotency', async () => {
    sendStreamEmail.mockResolvedValue({
      status: 'sent',
      stream: 'transactional',
      messageId: 'email_123',
      from: 'Jovie',
    } satisfies StreamSendResult);

    expect(await resendMailPort.send(message)).toEqual({
      status: 'sent',
      messageId: 'email_123',
    });
    expect(sendStreamEmail).toHaveBeenCalledExactlyOnceWith({
      ...message,
      stream: 'transactional',
      purpose: 'price-change-notice',
      consent: { basis: 'account-transaction' },
    });
  });

  it('does not count a provider success without a message ID as notice', async () => {
    sendStreamEmail.mockResolvedValue({
      status: 'sent',
      stream: 'transactional',
      messageId: null,
      from: 'Jovie',
    } satisfies StreamSendResult);

    expect(await resendMailPort.send(message)).toEqual({
      status: 'error',
      detail: 'missing_provider_message_id',
    });
  });

  it.each([
    {
      result: {
        status: 'skipped',
        stream: 'transactional',
        code: 'suppressed',
        detail: 'hard bounce',
      },
      expected: { status: 'skipped', detail: 'suppressed: hard bounce' },
    },
    {
      result: {
        status: 'rejected',
        stream: 'transactional',
        code: 'stream-closed',
        detail: 'closed by policy',
      },
      expected: { status: 'error', detail: 'stream-closed: closed by policy' },
    },
    {
      result: {
        status: 'error',
        stream: 'transactional',
        error: 'provider unavailable',
      },
      expected: { status: 'error', detail: 'provider unavailable' },
    },
  ] satisfies Array<{
    result: StreamSendResult;
    expected: { status: string; detail: string };
  }>)('preserves the $result.status result for retry/gating', async row => {
    sendStreamEmail.mockResolvedValue(row.result);
    expect(await resendMailPort.send(message)).toEqual(row.expected);
  });
});
