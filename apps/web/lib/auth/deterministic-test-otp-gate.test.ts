import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {} as { VERCEL_ENV?: string; E2E_TEST_MODE?: string },
}));

vi.mock('@/lib/env-server', () => ({ env: mocks.env }));

import { isDeterministicTestOtpEmail } from './rate-limit-rules';

const TEST_EMAIL = 'lr+1+clerk_test@jov.ie';

function setEnv(vercelEnv?: string, e2e?: string) {
  mocks.env.VERCEL_ENV = vercelEnv;
  mocks.env.E2E_TEST_MODE = e2e;
}

describe('isDeterministicTestOtpEmail (fixed-OTP gate)', () => {
  beforeEach(() => setEnv(undefined, undefined));

  it('refuses production for every address, even with E2E_TEST_MODE=1', () => {
    setEnv('production', '1');
    expect(isDeterministicTestOtpEmail(TEST_EMAIL)).toBe(false);
    expect(isDeterministicTestOtpEmail('a+e2e@test.jovie.com')).toBe(false);
  });

  it('allows the test shape on our own domains on staging/preview', () => {
    setEnv('preview');
    expect(isDeterministicTestOtpEmail(TEST_EMAIL)).toBe(true);
    expect(isDeterministicTestOtpEmail('x+clerk_test+y@test.jovie.com')).toBe(
      true
    );
  });

  it('refuses real addresses and foreign domains on staging', () => {
    setEnv('preview');
    expect(isDeterministicTestOtpEmail('artist@jov.ie')).toBe(false);
    expect(isDeterministicTestOtpEmail('victim+clerk_test@gmail.com')).toBe(
      false
    );
    expect(isDeterministicTestOtpEmail('x+clerk_test@jov.ie.evil.com')).toBe(
      false
    );
  });

  it('fails closed when the environment is unknown unless explicitly opted in', () => {
    setEnv(undefined, undefined);
    expect(isDeterministicTestOtpEmail(TEST_EMAIL)).toBe(false);
    setEnv('development', undefined);
    expect(isDeterministicTestOtpEmail(TEST_EMAIL)).toBe(false);
    setEnv(undefined, '1');
    expect(isDeterministicTestOtpEmail(TEST_EMAIL)).toBe(true);
  });
});
