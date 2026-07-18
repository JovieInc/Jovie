import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_RATE_LIMIT_RULES,
  isDeterministicTestOtpEmail,
} from '@/lib/auth/rate-limit-rules';

const OTP_SEND_PATH = '/email-otp/send-verification-otp' as const;

function makeOtpSendRequest(body: unknown): Request {
  return new Request(`http://localhost/api/auth${OTP_SEND_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function resolveOtpSendRule(request: Request) {
  const rule = AUTH_RATE_LIMIT_RULES[OTP_SEND_PATH];
  if (typeof rule !== 'function') {
    throw new Error('expected the OTP send rule to be a function');
  }
  return rule(request);
}

describe('Better Auth rate-limit policy', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps read-only session hydration out of the shared IP bucket', () => {
    expect(AUTH_RATE_LIMIT_RULES['/get-session']).toBe(false);
  });

  it('keeps credential and mutation endpoints rate-limited', () => {
    expect(AUTH_RATE_LIMIT_RULES['/sign-in/social']).toEqual({
      window: 60,
      max: 10,
    });
    expect(AUTH_RATE_LIMIT_RULES['/one-time-token/verify']).toEqual({
      window: 60,
      max: 10,
    });
  });
});

describe('isDeterministicTestOtpEmail', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts the canonical +e2e and +clerk_test shapes under the E2E guard', () => {
    vi.stubEnv('E2E_TEST_MODE', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(isDeterministicTestOtpEmail('artist+e2e@example.com')).toBe(true);
    expect(isDeterministicTestOtpEmail('artist+clerk_test@example.com')).toBe(
      true
    );
    expect(isDeterministicTestOtpEmail('artist+e2e+step2@example.com')).toBe(
      true
    );
  });

  it('rejects non-test email shapes even under the E2E guard', () => {
    vi.stubEnv('E2E_TEST_MODE', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(isDeterministicTestOtpEmail('artist@example.com')).toBe(false);
    expect(isDeterministicTestOtpEmail('e2e@example.com')).toBe(false);
    expect(isDeterministicTestOtpEmail('artist+e2efoo@example.com')).toBe(
      false
    );
  });

  it('rejects test emails when E2E_TEST_MODE is not set', () => {
    vi.stubEnv('E2E_TEST_MODE', '');
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(isDeterministicTestOtpEmail('artist+e2e@example.com')).toBe(false);
  });

  it('is hard-blocked on production deploys even with E2E_TEST_MODE=1', () => {
    vi.stubEnv('E2E_TEST_MODE', '1');
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(isDeterministicTestOtpEmail('artist+e2e@example.com')).toBe(false);
  });
});

describe('OTP send rate-limit rule', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('disables limiting for deterministic E2E test emails under the guard', async () => {
    vi.stubEnv('E2E_TEST_MODE', '1');
    vi.stubEnv('VERCEL_ENV', 'development');
    const request = makeOtpSendRequest({ email: 'artist+e2e@example.com' });
    await expect(resolveOtpSendRule(request)).resolves.toBe(false);
    // The rule must leave the body intact for Better Auth's own parser.
    await expect(request.json()).resolves.toEqual({
      email: 'artist+e2e@example.com',
    });
  });

  it('keeps the 3-per-60s window for real emails even under the guard', async () => {
    vi.stubEnv('E2E_TEST_MODE', '1');
    vi.stubEnv('VERCEL_ENV', 'development');
    await expect(
      resolveOtpSendRule(makeOtpSendRequest({ email: 'fan@example.com' }))
    ).resolves.toEqual({ window: 60, max: 3 });
  });

  it('limits deterministic test emails when E2E_TEST_MODE is off', async () => {
    vi.stubEnv('E2E_TEST_MODE', '');
    vi.stubEnv('VERCEL_ENV', 'development');
    await expect(
      resolveOtpSendRule(
        makeOtpSendRequest({ email: 'artist+e2e@example.com' })
      )
    ).resolves.toEqual({ window: 60, max: 3 });
  });

  it('limits deterministic test emails on production even with E2E_TEST_MODE=1', async () => {
    vi.stubEnv('E2E_TEST_MODE', '1');
    vi.stubEnv('VERCEL_ENV', 'production');
    await expect(
      resolveOtpSendRule(
        makeOtpSendRequest({ email: 'artist+e2e@example.com' })
      )
    ).resolves.toEqual({ window: 60, max: 3 });
  });

  it('fails closed (stays limited) when the request body is unparseable', async () => {
    vi.stubEnv('E2E_TEST_MODE', '1');
    vi.stubEnv('VERCEL_ENV', 'development');
    await expect(
      resolveOtpSendRule(makeOtpSendRequest('not-json{{'))
    ).resolves.toEqual({ window: 60, max: 3 });
    await expect(
      resolveOtpSendRule(makeOtpSendRequest({ type: 'sign-in' }))
    ).resolves.toEqual({ window: 60, max: 3 });
  });
});
