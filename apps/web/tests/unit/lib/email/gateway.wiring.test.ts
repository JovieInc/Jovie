/**
 * Production wiring of the send gateway: Resend transport, pause state in the
 * Ovie KV, Ovie card status, suppression and the hourly limiter. External
 * services are mocked at their module boundary.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  send: vi.fn(),
  captureError: vi.fn(),
  suppressed: vi.fn(),
  getCard: vi.fn(),
  limit: vi.fn(),
  pauseRows: vi.fn(),
  insertReturning: vi.fn(),
  deleteWhere: vi.fn(),
  env: { RESEND_API_KEY: 'test-key' } as Record<string, string | undefined>,
}));

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function (this: {
    emails?: { send: typeof h.send };
  }) {
    this.emails = { send: h.send };
  }),
}));
vi.mock('@/lib/env-server', () => ({ env: h.env }));
vi.mock('@/lib/error-tracking', () => ({ captureError: h.captureError }));
vi.mock('@/lib/notifications/suppression', () => ({
  isEmailSuppressed: h.suppressed,
}));
vi.mock('@/lib/ovie/summer-cards.server', () => ({ getSummerCard: h.getCard }));
vi.mock('@/lib/rate-limit', () => ({
  createRateLimiter: () => ({ limit: h.limit }),
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: h.pauseRows }) }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({ returning: h.insertReturning }),
      }),
    }),
    delete: () => ({ where: h.deleteWhere }),
  },
}));

const { sendStreamEmail } = await import('@/lib/email/gateway');
const { clearStreamPause, pauseStream, readStreamPause } = await import(
  '@/lib/email/gateway/pause.server'
);

const otp = {
  stream: 'transactional' as const,
  purpose: 'auth-otp',
  consent: { basis: 'auth-request' as const },
  to: 'person@jovie-customer.co',
  subject: 'Your code',
  text: '123456',
};

const UNSUB = {
  'List-Unsubscribe': '<https://jov.ie/u>',
  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
};

describe('send gateway production wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.env.RESEND_API_KEY = 'test-key';
    delete process.env.LEGAL_MAILING_ADDRESS;
    h.send.mockResolvedValue({ data: { id: 'msg_1' }, error: null });
    h.suppressed.mockResolvedValue({ suppressed: false });
    h.limit.mockResolvedValue({ success: true });
    h.pauseRows.mockResolvedValue([]);
    h.getCard.mockResolvedValue({ kind: 'outbound', status: 'approved' });
  });

  it('sends through Resend with the registry sender, reply-to and stream tags', async () => {
    const result = await sendStreamEmail({ ...otp, idempotencyKey: 'otp-1' });
    expect(result).toMatchObject({ status: 'sent', messageId: 'msg_1' });
    expect(h.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Jovie <notifications@send.jov.ie>',
        to: [otp.to],
        replyTo: 'tim@jov.ie',
        tags: [
          { name: 'stream', value: 'transactional' },
          { name: 'purpose', value: 'auth-otp' },
        ],
      }),
      { idempotencyKey: 'otp-1' }
    );
  });

  it('maps a Resend error and a thrown transport to error results', async () => {
    h.send.mockResolvedValueOnce({
      data: null,
      error: { message: 'bad from' },
    });
    expect(await sendStreamEmail(otp)).toMatchObject({
      status: 'error',
      error: 'bad from',
    });
    h.send.mockRejectedValueOnce(new Error('socket'));
    expect(await sendStreamEmail(otp)).toMatchObject({
      status: 'error',
      error: 'socket',
    });
  });

  it('skips when Resend is not configured, the address is suppressed or the limit is hit', async () => {
    h.env.RESEND_API_KEY = undefined;
    expect(await sendStreamEmail(otp)).toMatchObject({
      status: 'skipped',
      code: 'provider-not-configured',
    });
    h.env.RESEND_API_KEY = 'test-key';
    h.suppressed.mockResolvedValueOnce({
      suppressed: true,
      reason: 'hard_bounce',
    });
    expect(await sendStreamEmail(otp)).toMatchObject({ code: 'suppressed' });
    h.limit.mockResolvedValueOnce({ success: false });
    expect(await sendStreamEmail(otp)).toMatchObject({ code: 'rate-limited' });
    expect(h.send).not.toHaveBeenCalled();
  });

  it('reports a rejected cold send as a violation', async () => {
    const result = await sendStreamEmail({
      ...otp,
      stream: 'cold',
      consent: { basis: 'legitimate-interest' },
    });
    expect(result).toMatchObject({ status: 'rejected', code: 'stream-closed' });
    expect(h.captureError).toHaveBeenCalledWith(
      '[email-gateway] policy violation',
      expect.any(Error),
      expect.objectContaining({ stream: 'cold', code: 'stream-closed' })
    );
  });

  it('checks the Ovie card and fails closed when pause state is unreadable', async () => {
    process.env.LEGAL_MAILING_ADDRESS = '1 Example St, Los Angeles, CA';
    const broadcast = {
      ...otp,
      stream: 'broadcast' as const,
      purpose: 'changelog',
      consent: { basis: 'opt-in' as const },
      headers: UNSUB,
      approval: { cardId: 'sc_0123456789abcdef0123456789abcdef' },
    };
    h.getCard.mockResolvedValueOnce({ kind: 'taste', status: 'approved' });
    expect(await sendStreamEmail(broadcast)).toMatchObject({
      code: 'approval-not-approved',
    });
    h.pauseRows.mockRejectedValueOnce(new Error('db down'));
    expect(await sendStreamEmail(broadcast)).toMatchObject({
      status: 'skipped',
      code: 'stream-paused',
    });
    h.getCard.mockResolvedValueOnce(null);
    expect(await sendStreamEmail(broadcast)).toMatchObject({
      code: 'approval-not-approved',
    });
    expect(await sendStreamEmail(broadcast)).toMatchObject({ status: 'sent' });
  });
});

describe('stream pause state', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads no pause, an active pause, and resumes on an approved card', async () => {
    h.pauseRows.mockResolvedValueOnce([]);
    expect(await readStreamPause('broadcast')).toBeNull();

    const pause = {
      stream: 'broadcast',
      pausedAt: '2026-10-29T00:00:00Z',
      reason: 'complaints 0.2%',
      resumeCardId: 'sc_card',
    };
    h.pauseRows.mockResolvedValueOnce([{ value: pause }]);
    h.getCard.mockResolvedValueOnce({ status: 'pending' });
    expect(await readStreamPause('broadcast')).toEqual(pause);

    h.pauseRows.mockResolvedValueOnce([{ value: pause }]);
    h.getCard.mockResolvedValueOnce({ status: 'approved' });
    expect(await readStreamPause('broadcast')).toBeNull();
    expect(h.deleteWhere).toHaveBeenCalledTimes(1);
  });

  it('writes a pause once and clears it', async () => {
    h.insertReturning.mockResolvedValueOnce([{ key: 'k' }]);
    expect(
      await pauseStream({
        stream: 'lifecycle',
        pausedAt: 'now',
        reason: 'r',
        resumeCardId: null,
      })
    ).toBe(true);
    h.insertReturning.mockResolvedValueOnce([]);
    expect(
      await pauseStream({
        stream: 'lifecycle',
        pausedAt: 'now',
        reason: 'r',
        resumeCardId: null,
      })
    ).toBe(false);
    await clearStreamPause('lifecycle');
    expect(h.deleteWhere).toHaveBeenCalled();
  });
});
