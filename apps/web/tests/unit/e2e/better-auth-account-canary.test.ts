import { describe, expect, it, vi } from 'vitest';
import {
  assertDeploymentStable,
  assertRuntimeMatchesDeployment,
  buildBetterAuthAccountCanaryEmail,
  buildBetterAuthAccountCanaryLikePattern,
  buildBetterAuthAccountCanaryReceipt,
  buildBetterAuthSignInVerificationIdentifier,
  getReadyProductionDeployment,
  isExactBetterAuthAccountCanaryEmail,
  validateBetterAuthAccountCanaryConfig,
} from '@/tests/e2e/utils/better-auth-account-canary';

const ENV = {
  BASE_URL: 'https://jov.ie',
  DATABASE_URL: 'postgres://example',
  E2E_ENVIRONMENT: 'production',
  E2E_PROD_SIGNUP_EMAIL_BASE: 'synthetic@e2e.example.com',
  E2E_PROD_MAILBOX_PROVIDER: 'cloudflare-email-routing',
  E2E_PROD_OTP_CHECK_URL: 'https://otp.example/latest',
  E2E_PROD_OTP_CHECK_TOKEN: 'otp-token',
  PLAYWRIGHT_TEST_BASE_URL: 'https://jov.ie',
  SYNTHETIC_RUN_ID: '123-1',
  VERCEL_TOKEN: 'vercel-token',
  VERCEL_ORG_ID: 'team_example',
  VERCEL_PROJECT_ID: 'prj_example',
} as const;

const DEPLOYMENT = {
  id: 'dpl_ready',
  url: 'jovie-example.vercel.app',
  sha: 'a'.repeat(40),
  readyState: 'READY' as const,
};

describe('Better Auth production account canary contract', () => {
  it('uses one exact, anchored cleanup namespace', () => {
    const email = buildBetterAuthAccountCanaryEmail(
      'synthetic@e2e.example.com',
      'run_123'
    );
    expect(email).toBe(
      'synthetic+jovie-ba-prod-canary-run-123@e2e.example.com'
    );
    expect(
      isExactBetterAuthAccountCanaryEmail(email, 'synthetic@e2e.example.com')
    ).toBe(true);
    for (const unsafe of [
      'synthetic+other-run-123@e2e.example.com',
      'synthetic+jovie-ba-prod-canary-@e2e.example.com',
      'synthetic+jovie-ba-prod-canary-run-123@other.example.com',
      'somebody+jovie-ba-prod-canary-run-123@e2e.example.com',
    ]) {
      expect(
        isExactBetterAuthAccountCanaryEmail(unsafe, 'synthetic@e2e.example.com')
      ).toBe(false);
    }
  });

  it('targets Better Auth 1.6.23 sign-in verification residue exactly', () => {
    expect(
      buildBetterAuthSignInVerificationIdentifier(
        'synthetic+jovie-ba-prod-canary-run-123@e2e.example.com'
      )
    ).toBe(
      'sign-in-otp-synthetic+jovie-ba-prod-canary-run-123@e2e.example.com'
    );
  });

  it('escapes SQL LIKE wildcards in the stale-canary namespace', () => {
    expect(
      buildBetterAuthAccountCanaryLikePattern('syn_%@e2e.example.com')
    ).toBe('syn\\_\\%+jovie-ba-prod-canary-%@e2e.example.com');
  });

  it('fails closed unless every mutation and deployment input is present', () => {
    expect(() => validateBetterAuthAccountCanaryConfig(ENV)).not.toThrow();
    expect(() =>
      validateBetterAuthAccountCanaryConfig({
        ...ENV,
        DATABASE_URL: '',
      })
    ).toThrow('DATABASE_URL');
    expect(() =>
      validateBetterAuthAccountCanaryConfig({
        ...ENV,
        E2E_PROD_MAILBOX_PROVIDER: 'gmail',
      })
    ).toThrow('cloudflare-email-routing');
    expect(() =>
      validateBetterAuthAccountCanaryConfig({
        ...ENV,
        PLAYWRIGHT_TEST_BASE_URL: 'https://preview.example.com',
      })
    ).toThrow('exactly https://jov.ie');
    expect(() =>
      validateBetterAuthAccountCanaryConfig({
        ...ENV,
        E2E_ENVIRONMENT: 'preview',
      })
    ).toThrow('must be production');
  });

  it('accepts only a full-SHA READY production deployment', async () => {
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get('target')).toBe('production');
      expect(url.searchParams.get('state')).toBe('READY');
      expect(url.searchParams.get('teamId')).toBe('team_example');
      return new Response(
        JSON.stringify({
          deployments: [
            {
              uid: DEPLOYMENT.id,
              url: DEPLOYMENT.url,
              readyState: DEPLOYMENT.readyState,
              meta: { githubCommitSha: DEPLOYMENT.sha },
            },
          ],
        })
      );
    });

    await expect(getReadyProductionDeployment(ENV, request)).resolves.toEqual(
      DEPLOYMENT
    );
  });

  it('rejects deployment drift and runtime SHA mismatches', async () => {
    expect(() =>
      assertDeploymentStable(DEPLOYMENT, { ...DEPLOYMENT, id: 'dpl_new' })
    ).toThrow('changed');

    const matchingRequest = vi.fn(
      async () =>
        new Response(JSON.stringify({ commitSha: DEPLOYMENT.sha.slice(0, 7) }))
    );
    await expect(
      assertRuntimeMatchesDeployment(DEPLOYMENT, matchingRequest)
    ).resolves.toBeUndefined();

    const mismatchingRequest = vi.fn(
      async () => new Response(JSON.stringify({ commitSha: 'bbbbbbb' }))
    );
    await expect(
      assertRuntimeMatchesDeployment(DEPLOYMENT, mismatchingRequest)
    ).rejects.toThrow('does not match');

    const malformedRequest = vi.fn(
      async () => new Response(JSON.stringify({ commitSha: 'a' }))
    );
    await expect(
      assertRuntimeMatchesDeployment(DEPLOYMENT, malformedRequest)
    ).rejects.toThrow('does not match');
  });

  it('emits a redacted receipt bound to the deployment SHA', () => {
    const receipt = buildBetterAuthAccountCanaryReceipt({
      runId: 'run-123',
      email: 'synthetic+jovie-ba-prod-canary-run-123@e2e.example.com',
      deployment: DEPLOYMENT,
      startedAt: new Date('2026-07-14T00:00:00.000Z'),
      completedAt: new Date('2026-07-14T00:01:00.000Z'),
    });
    const serialized = JSON.stringify(receipt);

    expect(receipt.deployment.sha).toBe(DEPLOYMENT.sha);
    expect(receipt.emailSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.assertions.cleanup).toBe('zero-residue');
    expect(serialized).not.toContain('synthetic+');
    expect(serialized).not.toContain('otp-token');
  });
});
