/**
 * verifyEmailOtpDomain under concurrency (security triage 2026-10-25).
 *
 * The fake db below models Postgres row semantics for the one subscription
 * row: a plain `emailOtpAttempts: n` write overwrites, a SQL increment is
 * applied atomically and only while the guard (current code, unexpired,
 * attempts below the cap) holds, and consuming the code succeeds once.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashEmailOtp } from '@/lib/notifications/email-otp';

const ARTIST_ID = '11111111-2222-4333-8444-555555555555';
const EMAIL = 'fan@example.com';
const CODE = '424242';

const row = vi.hoisted(() => ({
  id: 'sub-1',
  emailOtpHash: null as string | null,
  emailOtpExpiresAt: null as Date | null,
  emailOtpAttempts: 0,
  confirmedAt: null as Date | null,
}));

const isSql = (value: unknown) =>
  typeof (value as { getSQL?: unknown } | null)?.getSQL === 'function';

vi.mock('@/lib/db', () => {
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  const select = vi.fn((fields: Record<string, unknown>) => {
    // Snapshot at query time, like a READ COMMITTED read.
    const snapshot = 'emailOtpHash' in fields ? [{ ...row }] : [];
    const chain = {
      from: () => chain,
      leftJoin: () => chain,
      where: () => chain,
      limit: async () => {
        await tick();
        return snapshot;
      },
    };
    return chain;
  });
  const update = vi.fn(() => ({
    set: (args: Record<string, unknown>) => {
      const apply = async (): Promise<Array<{ id: string }>> => {
        await tick();
        if (isSql(args.emailOtpAttempts)) {
          const live =
            row.emailOtpHash !== null &&
            row.emailOtpExpiresAt !== null &&
            row.emailOtpExpiresAt > new Date() &&
            row.emailOtpAttempts < 5;
          if (!live) return [];
          row.emailOtpAttempts += 1;
          return [{ id: row.id }];
        }
        if ('confirmedAt' in args) {
          if (row.emailOtpHash === null) return [];
          Object.assign(row, args);
          return [{ id: row.id }];
        }
        Object.assign(row, args);
        return [{ id: row.id }];
      };
      return {
        where: () => {
          const result = apply();
          return Object.assign(
            result.then(() => undefined),
            {
              returning: () => result,
            }
          );
        },
      };
    },
  }));
  return { db: { select, update } };
});

vi.mock('@/lib/notifications/audience-alert-state', () => ({
  syncAudienceAlertState: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/analytics/signup-funnel.server', () => ({
  recordFunnelStep: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/tracking/fire-subscribe-event', () => ({
  fireSubscribeCAPIEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/notifications/analytics', () => ({
  extractPayloadProps: vi.fn().mockReturnValue({}),
  inferChannel: vi.fn().mockReturnValue('email'),
  trackServerError: vi.fn(),
  trackSubscribeAttempt: vi.fn(),
  trackSubscribeError: vi.fn(),
  trackSubscribeSuccess: vi.fn(),
  trackUnsubscribeAttempt: vi.fn(),
  trackUnsubscribeError: vi.fn(),
  trackUnsubscribeSuccess: vi.fn(),
}));
vi.mock('@/lib/notifications/service', () => ({
  sendNotification: vi.fn().mockResolvedValue({ delivered: [] }),
}));
vi.mock('@/lib/notifications/suppression', () => ({
  isEmailSuppressed: vi.fn().mockResolvedValue({ suppressed: false }),
}));
vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: vi.fn(fn => fn({ insert: vi.fn() })),
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

import { syncAudienceAlertState } from '@/lib/notifications/audience-alert-state';
import { verifyEmailOtpDomain } from '@/lib/notifications/domain';
import { verifyEmailOtp } from '@/lib/notifications/otp-service';

function attempt(otp: string) {
  return verifyEmailOtpDomain({
    artist_id: ARTIST_ID,
    email: EMAIL,
    otp_code: otp,
  });
}

describe('verifyEmailOtpDomain attempt accounting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(row, {
      emailOtpHash: hashEmailOtp(CODE),
      emailOtpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      emailOtpAttempts: 0,
      confirmedAt: null,
    });
  });

  it('caps concurrent wrong guesses at five attempts', async () => {
    const guesses = Array.from({ length: 20 }, (_, index) =>
      String(100000 + index)
    );
    const results = await Promise.all(guesses.map(attempt));

    expect(row.emailOtpAttempts).toBe(5);
    const tooMany = results.filter(result =>
      String((result.body as { error?: string }).error).startsWith(
        'Too many attempts'
      )
    );
    expect(tooMany).toHaveLength(15);
  });

  it('rejects the right code once the cap is spent concurrently', async () => {
    await Promise.all(
      ['100001', '100002', '100003', '100004', '100005'].map(attempt)
    );
    const result = await attempt(CODE);
    expect(result.status).toBe(400);
    expect(row.confirmedAt).toBeNull();
  });

  it('confirms a code once even when submitted twice at the same time', async () => {
    const results = await Promise.all([attempt(CODE), attempt(CODE)]);
    const successes = results.filter(result => result.status === 200);
    expect(successes).toHaveLength(1);
    expect(row.confirmedAt).toBeInstanceOf(Date);
    expect(row.emailOtpHash).toBeNull();
    expect(vi.mocked(syncAudienceAlertState)).toHaveBeenCalledTimes(1);
  });

  it('still confirms a single correct code', async () => {
    const result = await attempt(CODE);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ success: true });
    expect(row.emailOtpAttempts).toBe(0);
  });
});

describe('verifyEmailOtp (promo downloads) attempt accounting', () => {
  beforeEach(() => {
    Object.assign(row, {
      emailOtpHash: hashEmailOtp(CODE),
      emailOtpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      emailOtpAttempts: 0,
      confirmedAt: null,
    });
  });

  it('caps concurrent wrong guesses at five attempts', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        verifyEmailOtp({
          email: EMAIL,
          creatorProfileId: ARTIST_ID,
          code: String(200000 + index),
        })
      )
    );
    expect(row.emailOtpAttempts).toBe(5);
    expect(
      results.filter(result => !result.success && result.status === 429)
    ).toHaveLength(15);
    const late = await verifyEmailOtp({
      email: EMAIL,
      creatorProfileId: ARTIST_ID,
      code: CODE,
    });
    expect(late.success).toBe(false);
  });
});
