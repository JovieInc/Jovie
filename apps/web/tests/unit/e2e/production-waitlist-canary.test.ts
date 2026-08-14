import { describe, expect, it, vi } from 'vitest';
import {
  buildProductionWaitlistCanaryEmail,
  hashProductionWaitlistCanaryEmail,
  hasProductionWaitlistCanaryNamespace,
  isExactProductionWaitlistCanaryEmail,
} from '@/lib/canaries/production-waitlist';
import {
  assertDeploymentStable,
  assertProductionWaitlistCanaryPreflight,
  assertRuntimeMatchesDeployment,
  buildProductionWaitlistCanaryReceipt,
  getReadyProductionDeployment,
  readDurableProductionWaitlistReceipt,
  validateProductionWaitlistCanaryConfig,
} from '@/tests/e2e/utils/production-waitlist-canary';

const ENV = {
  BASE_URL: 'https://jov.ie',
  E2E_ENVIRONMENT: 'production',
  E2E_PROD_SIGNUP_EMAIL_BASE: 'synthetic@e2e.example.com',
  E2E_PROD_MAILBOX_PROVIDER: 'cloudflare-email-routing',
  E2E_PROD_OTP_CHECK_ORIGIN: 'https://otp.example',
  E2E_PROD_OTP_CHECK_URL: 'https://otp.example/latest',
  E2E_PROD_OTP_CHECK_TOKEN: 'otp-token',
  PLAYWRIGHT_TEST_BASE_URL: 'https://jov.ie',
  PRODUCTION_WAITLIST_CANARY_READ_TOKEN: 'r'.repeat(32),
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

const DURABLE_RECEIPT = {
  schemaVersion: 1 as const,
  canary: 'production-waitlist' as const,
  runId: '123-1',
  emailSha256: hashProductionWaitlistCanaryEmail(
    buildProductionWaitlistCanaryEmail(ENV.E2E_PROD_SIGNUP_EMAIL_BASE)
  ),
  entryId: '11111111-1111-4111-8111-111111111111',
  assertions: {
    database: {
      identityLinkage: 'passed' as const,
      session: 'passed' as const,
      waitlistEntry: 'passed' as const,
      waitlistAudit: 'passed' as const,
    },
    analytics: { firstPartyWaitlistConfirmation: 'passed' as const },
    communications: {
      policy: {
        waitlistConfirmationEmail: 'suppressed-before-enqueue' as const,
        slack: 'suppressed-before-provider-call' as const,
      },
      emailJobCount: 0 as const,
      auditSuppressionMarker: 'passed' as const,
    },
  },
};

describe('production waitlist canary contract', () => {
  it('uses one exact durable identity with no per-run namespace', () => {
    const email = buildProductionWaitlistCanaryEmail(
      'synthetic@e2e.example.com'
    );
    expect(email).toBe('synthetic+jovie-prod-waitlist-canary@e2e.example.com');
    expect(
      isExactProductionWaitlistCanaryEmail(email, 'synthetic@e2e.example.com')
    ).toBe(true);
    expect(
      isExactProductionWaitlistCanaryEmail(
        'synthetic+jovie-prod-waitlist-canary-run@e2e.example.com',
        'synthetic@e2e.example.com'
      )
    ).toBe(false);
    expect(hasProductionWaitlistCanaryNamespace(email)).toBe(true);
    expect(
      hasProductionWaitlistCanaryNamespace(
        'synthetic+jovie-prod-waitlist-canary-extra@e2e.example.com'
      )
    ).toBe(false);
  });

  it('fails closed without the scoped receipt and mailbox inputs', () => {
    expect(() => validateProductionWaitlistCanaryConfig(ENV)).not.toThrow();
    expect(() =>
      validateProductionWaitlistCanaryConfig({
        ...ENV,
        PRODUCTION_WAITLIST_CANARY_READ_TOKEN: '',
      })
    ).toThrow('PRODUCTION_WAITLIST_CANARY_READ_TOKEN');
    expect(() =>
      validateProductionWaitlistCanaryConfig({
        ...ENV,
        E2E_PROD_MAILBOX_PROVIDER: 'gmail',
      })
    ).toThrow('cloudflare-email-routing');
    expect(() =>
      validateProductionWaitlistCanaryConfig({
        ...ENV,
        PLAYWRIGHT_TEST_BASE_URL: 'https://preview.example.com',
      })
    ).toThrow('exactly https://jov.ie');
    expect(() =>
      validateProductionWaitlistCanaryConfig({
        ...ENV,
        E2E_PROD_OTP_CHECK_URL: 'https://evil.example/latest',
      })
    ).toThrow('exact HTTPS worker origin');
    expect(() =>
      validateProductionWaitlistCanaryConfig({
        ...ENV,
        E2E_PROD_OTP_CHECK_URL: 'http://otp.example/latest',
      })
    ).toThrow('exact HTTPS worker origin');
  });

  it('preflights exact deployed identity before mutation', async () => {
    const email = buildProductionWaitlistCanaryEmail(
      ENV.E2E_PROD_SIGNUP_EMAIL_BASE
    );
    const request = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.headers).toMatchObject({
          Authorization: `Bearer ${ENV.PRODUCTION_WAITLIST_CANARY_READ_TOKEN}`,
        });
        return new Response(
          JSON.stringify({
            schemaVersion: 1,
            canary: 'production-waitlist',
            environment: 'production',
            emailSha256:
              '7c7c074146450055e4f0ddff60a306ab3f00239c7f6a1e705b9895fd04247397',
            communicationPolicy: {
              waitlistConfirmationEmail: 'suppressed-before-enqueue',
              slack: 'suppressed-before-provider-call',
            },
            assertions: {
              exactIdentityConfigured: 'passed',
              readScopeConfigured: 'passed',
              communicationsFailClosed: 'passed',
            },
          })
        );
      }
    );

    await expect(
      assertProductionWaitlistCanaryPreflight(ENV, email, request)
    ).resolves.toBeUndefined();
  });

  it('rejects a malformed scoped receipt instead of trusting a TypeScript cast', async () => {
    const email = buildProductionWaitlistCanaryEmail(
      ENV.E2E_PROD_SIGNUP_EMAIL_BASE
    );
    const request = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            schemaVersion: 1,
            canary: 'production-waitlist',
            environment: 'production',
            emailSha256:
              '7c7c074146450055e4f0ddff60a306ab3f00239c7f6a1e705b9895fd04247397',
          })
        )
    );

    await expect(
      assertProductionWaitlistCanaryPreflight(ENV, email, request)
    ).rejects.toThrow();
  });

  it('accepts only a full-SHA READY production deployment', async () => {
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get('target')).toBe('production');
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

  it.each([
    ['runId', '123-2'],
    ['entryId', '22222222-2222-4222-8222-222222222222'],
    ['emailSha256', 'b'.repeat(64)],
  ] as const)('rejects a schema-valid durable receipt with a mismatched %s', async (field, value) => {
    const request = vi.fn(
      async () =>
        new Response(JSON.stringify({ ...DURABLE_RECEIPT, [field]: value }))
    );

    await expect(
      readDurableProductionWaitlistReceipt(
        ENV,
        { runId: DURABLE_RECEIPT.runId, entryId: DURABLE_RECEIPT.entryId },
        request
      )
    ).rejects.toThrow('identity or traversal mismatch');
  });

  it('rejects deployment drift and runtime SHA mismatches', async () => {
    expect(() =>
      assertDeploymentStable(DEPLOYMENT, { ...DEPLOYMENT, id: 'dpl_new' })
    ).toThrow('changed');
    await expect(
      assertRuntimeMatchesDeployment(
        DEPLOYMENT,
        vi.fn(
          async () =>
            new Response(
              JSON.stringify({ commitSha: DEPLOYMENT.sha.slice(0, 7) })
            )
        )
      )
    ).resolves.toBeUndefined();
    await expect(
      assertRuntimeMatchesDeployment(
        DEPLOYMENT,
        vi.fn(
          async () => new Response(JSON.stringify({ commitSha: 'bbbbbbb' }))
        )
      )
    ).rejects.toThrow('does not match');
  });

  it('emits a redacted receipt and explicitly retains the identity', () => {
    const receipt = buildProductionWaitlistCanaryReceipt({
      runId: '123-1',
      email: buildProductionWaitlistCanaryEmail(ENV.E2E_PROD_SIGNUP_EMAIL_BASE),
      deployment: DEPLOYMENT,
      durableReceipt: DURABLE_RECEIPT,
      startedAt: new Date('2026-08-10T00:00:00.000Z'),
      completedAt: new Date('2026-08-10T00:01:00.000Z'),
    });
    const serialized = JSON.stringify(receipt);
    expect(receipt.assertions.cleanup).toBe('not-run-identity-retained');
    expect(receipt.assertions.database).toBe('scoped-receipt-passed');
    expect(receipt.assertions.communications).toEqual({
      authOtp: 'routed-to-dedicated-mailbox',
      waitlistConfirmationEmail: 'suppressed-and-receipted',
      slack: 'suppressed-and-receipted',
    });
    expect(serialized).not.toContain('synthetic+');
    expect(serialized).not.toContain('otp-token');
  });

  it('rejects contradictory identifiers in the final evidence receipt', () => {
    expect(() =>
      buildProductionWaitlistCanaryReceipt({
        runId: '123-2',
        email: buildProductionWaitlistCanaryEmail(
          ENV.E2E_PROD_SIGNUP_EMAIL_BASE
        ),
        deployment: DEPLOYMENT,
        durableReceipt: DURABLE_RECEIPT,
        startedAt: new Date('2026-08-10T00:00:00.000Z'),
        completedAt: new Date('2026-08-10T00:01:00.000Z'),
      })
    ).toThrow('identity or traversal mismatch');
  });

  it('preserves redacted incomplete-evidence categories on a 409', async () => {
    const request = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            schemaVersion: 1,
            canary: 'production-waitlist',
            runId: DURABLE_RECEIPT.runId,
            emailSha256: DURABLE_RECEIPT.emailSha256,
            status: 'incomplete',
            missing: ['waitlist_audit', 'analytics_receipt'],
          }),
          { status: 409 }
        )
    );

    await expect(
      readDurableProductionWaitlistReceipt(
        ENV,
        { runId: DURABLE_RECEIPT.runId, entryId: DURABLE_RECEIPT.entryId },
        request
      )
    ).rejects.toThrow(
      'Canary receipt incomplete: waitlist_audit, analytics_receipt'
    );
  });
});
