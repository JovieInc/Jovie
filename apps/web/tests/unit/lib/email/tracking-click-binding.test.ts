import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env-server', () => ({
  env: {
    RESEND_API_KEY: 'test-resend-api-key-for-unit-tests',
  },
}));

vi.mock('@/constants/domains', () => ({
  BASE_URL: 'https://test.jov.ie',
}));

vi.mock('@/lib/db', () => ({
  db: {},
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

describe('email click tracking URL binding (SEC-18)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('binds the destination URL into the tracking HMAC', async () => {
    const { buildClickTrackingUrl, verifyTrackingToken } = await import(
      '@/lib/email/tracking'
    );

    const destination = 'https://jov.ie/claim/invite-123';
    const trackingUrl = buildClickTrackingUrl(
      {
        emailType: 'claim_invite',
        referenceId: 'invite-123',
        email: 'Fan@Example.com',
      },
      destination,
      'primary-cta'
    );

    expect(trackingUrl).toBeTruthy();
    const parsed = new URL(trackingUrl!);
    expect(parsed.pathname).toBe('/api/email/track/click');
    expect(parsed.searchParams.get('u')).toBe(destination);

    const payload = verifyTrackingToken(parsed.searchParams.get('t')!);
    expect(payload).toEqual({
      emailType: 'claim_invite',
      referenceId: 'invite-123',
      email: 'fan@example.com',
      messageId: undefined,
      clickUrl: destination,
    });
  });

  it('rejects a swapped destination against a bound token', async () => {
    const { generateTrackingToken, verifyTrackingToken, safeEqualString } =
      await import('@/lib/email/tracking');

    const token = generateTrackingToken({
      emailType: 'claim_invite',
      referenceId: 'invite-123',
      email: 'fan@example.com',
      clickUrl: 'https://jov.ie/safe',
    });
    expect(token).toBeTruthy();

    const payload = verifyTrackingToken(token!);
    expect(payload?.clickUrl).toBe('https://jov.ie/safe');
    expect(
      safeEqualString(payload!.clickUrl!, 'https://evil.example/phish')
    ).toBe(false);
  });

  it('does not treat an unbound open-tracking token as click-bound', async () => {
    const { generateTrackingToken, verifyTrackingToken } = await import(
      '@/lib/email/tracking'
    );

    const token = generateTrackingToken({
      emailType: 'claim_invite',
      referenceId: 'invite-123',
      email: 'fan@example.com',
    });
    const payload = verifyTrackingToken(token!);
    expect(payload?.clickUrl).toBeUndefined();
  });
});
