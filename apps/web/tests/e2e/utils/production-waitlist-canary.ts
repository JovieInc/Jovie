import {
  buildProductionWaitlistCanaryEmail,
  type DurableProductionWaitlistReceipt,
  hashProductionWaitlistCanaryEmail,
  parseProductionWaitlistCanaryRunId,
  productionWaitlistDurableReceiptSchema,
  productionWaitlistIncompleteReceiptSchema,
  productionWaitlistPreflightReceiptSchema,
} from '@/lib/canaries/production-waitlist';

const SHA_PATTERN = /^[a-f0-9]{40}$/i;
const RUNTIME_SHA_PATTERN = /^(?:[a-f0-9]{7}|[a-f0-9]{40})$/i;

export const PRODUCTION_WAITLIST_CANARY_KEYS = [
  'BASE_URL',
  'E2E_ENVIRONMENT',
  'E2E_PROD_SIGNUP_EMAIL_BASE',
  'E2E_PROD_MAILBOX_PROVIDER',
  'E2E_PROD_OTP_CHECK_ORIGIN',
  'E2E_PROD_OTP_CHECK_URL',
  'E2E_PROD_OTP_CHECK_TOKEN',
  'PLAYWRIGHT_TEST_BASE_URL',
  'PRODUCTION_WAITLIST_CANARY_READ_TOKEN',
  'SYNTHETIC_RUN_ID',
  'VERCEL_TOKEN',
  'VERCEL_ORG_ID',
  'VERCEL_PROJECT_ID',
] as const;

interface CanaryEnv {
  readonly [key: string]: string | undefined;
}

export interface ProductionDeployment {
  readonly id: string;
  readonly url: string;
  readonly sha: string;
  readonly readyState: 'READY';
}

interface VercelDeploymentPayload {
  readonly deployments?: ReadonlyArray<{
    readonly uid?: string;
    readonly id?: string;
    readonly url?: string;
    readonly readyState?: string;
    readonly state?: string;
    readonly meta?: { readonly githubCommitSha?: string };
  }>;
}

export interface ProductionWaitlistCanaryReceipt {
  readonly schemaVersion: 1;
  readonly canary: 'production-waitlist';
  readonly runId: string;
  readonly emailSha256: string;
  readonly deployment: { readonly id: string; readonly sha: string };
  readonly assertions: {
    readonly runtime: {
      readonly homepage: 'passed';
      readonly primaryCta: 'passed';
      readonly start: 'passed';
      readonly otpSession: 'passed';
      readonly intake: 'passed';
      readonly waitlist: 'passed';
      readonly deploymentStable: 'passed';
    };
    readonly database: 'scoped-receipt-passed';
    readonly analytics: {
      readonly firstPartyWaitlistConfirmation: 'scoped-receipt-passed';
    };
    readonly communications: {
      readonly authOtp: 'routed-to-dedicated-mailbox';
      readonly waitlistConfirmationEmail: 'suppressed-and-receipted';
      readonly slack: 'suppressed-and-receipted';
    };
    readonly cleanup: 'not-run-identity-retained';
  };
  readonly durableReceipt: DurableProductionWaitlistReceipt;
  readonly startedAt: string;
  readonly completedAt: string;
}

export function validateProductionWaitlistCanaryConfig(env: CanaryEnv): void {
  const missing = PRODUCTION_WAITLIST_CANARY_KEYS.filter(
    key => !env[key]?.trim()
  );
  if (missing.length > 0) {
    throw new Error(
      `Production waitlist canary missing: ${missing.join(', ')}`
    );
  }
  if (env.E2E_PROD_MAILBOX_PROVIDER !== 'cloudflare-email-routing') {
    throw new Error(
      'Production waitlist canary requires cloudflare-email-routing'
    );
  }
  for (const key of ['BASE_URL', 'PLAYWRIGHT_TEST_BASE_URL'] as const) {
    const target = new URL(env[key]!);
    if (
      target.origin !== 'https://jov.ie' ||
      target.pathname !== '/' ||
      target.search ||
      target.hash ||
      target.username ||
      target.password
    ) {
      throw new Error(`${key} must target exactly https://jov.ie`);
    }
  }
  if (env.E2E_ENVIRONMENT !== 'production') {
    throw new Error('E2E_ENVIRONMENT must be production');
  }
  if ((env.PRODUCTION_WAITLIST_CANARY_READ_TOKEN?.length ?? 0) < 32) {
    throw new Error(
      'PRODUCTION_WAITLIST_CANARY_READ_TOKEN must be at least 32 characters'
    );
  }
  const otpOrigin = new URL(env.E2E_PROD_OTP_CHECK_ORIGIN!);
  const otpUrl = new URL(env.E2E_PROD_OTP_CHECK_URL!);
  if (
    otpOrigin.protocol !== 'https:' ||
    otpOrigin.origin !== env.E2E_PROD_OTP_CHECK_ORIGIN ||
    otpOrigin.pathname !== '/' ||
    otpUrl.protocol !== 'https:' ||
    otpUrl.origin !== otpOrigin.origin ||
    otpUrl.username ||
    otpUrl.password ||
    otpUrl.hash
  ) {
    throw new Error(
      'E2E_PROD_OTP_CHECK_URL must use the configured exact HTTPS worker origin'
    );
  }
  buildProductionWaitlistCanaryEmail(env.E2E_PROD_SIGNUP_EMAIL_BASE!);
  parseProductionWaitlistCanaryRunId(env.SYNTHETIC_RUN_ID);
}

export async function getReadyProductionDeployment(
  env: CanaryEnv,
  request: typeof fetch = fetch
): Promise<ProductionDeployment> {
  const url = new URL('https://api.vercel.com/v6/deployments');
  url.searchParams.set('projectId', env.VERCEL_PROJECT_ID ?? '');
  url.searchParams.set('target', 'production');
  url.searchParams.set('state', 'READY');
  url.searchParams.set('limit', '1');
  if (env.VERCEL_ORG_ID?.startsWith('team_')) {
    url.searchParams.set('teamId', env.VERCEL_ORG_ID);
  }

  const response = await request(url, {
    headers: { Authorization: `Bearer ${env.VERCEL_TOKEN ?? ''}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Vercel deployment lookup failed (${response.status})`);
  }

  const payload = (await response.json()) as VercelDeploymentPayload;
  const deployment = payload.deployments?.[0];
  const id = deployment?.uid ?? deployment?.id;
  const readyState = (
    deployment?.readyState ??
    deployment?.state ??
    ''
  ).toUpperCase();
  const sha = deployment?.meta?.githubCommitSha ?? '';
  if (
    !id ||
    !deployment?.url ||
    readyState !== 'READY' ||
    !SHA_PATTERN.test(sha)
  ) {
    throw new Error('Vercel did not return one SHA-bound READY deployment');
  }
  return { id, url: deployment.url, sha, readyState: 'READY' };
}

export async function assertRuntimeMatchesDeployment(
  deployment: ProductionDeployment,
  request: typeof fetch = fetch
): Promise<void> {
  const response = await request('https://jov.ie/api/health/build-info', {
    headers: { 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Production build-info failed (${response.status})`);
  }
  const payload = (await response.json()) as { readonly commitSha?: string };
  const runtimeSha = payload.commitSha ?? '';
  if (
    !RUNTIME_SHA_PATTERN.test(runtimeSha) ||
    !deployment.sha.toLowerCase().startsWith(runtimeSha.toLowerCase())
  ) {
    throw new Error(
      'Production runtime SHA does not match the READY deployment'
    );
  }
}

export function assertDeploymentStable(
  before: ProductionDeployment,
  after: ProductionDeployment
): void {
  if (before.id !== after.id || before.sha !== after.sha) {
    throw new Error('Production deployment changed during the waitlist canary');
  }
}

async function readScopedReceipt(
  url: URL,
  env: CanaryEnv,
  request: typeof fetch
): Promise<Record<string, unknown>> {
  const response = await request(url, {
    headers: {
      Authorization: `Bearer ${env.PRODUCTION_WAITLIST_CANARY_READ_TOKEN ?? ''}`,
      'Cache-Control': 'no-cache',
    },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (response.status === 409) {
    const incomplete =
      productionWaitlistIncompleteReceiptSchema.safeParse(payload);
    if (incomplete.success) {
      throw new Error(
        `Canary receipt incomplete: ${incomplete.data.missing.join(', ')}`
      );
    }
  }
  if (!response.ok || !payload) {
    throw new Error(`Canary receipt read failed (${response.status})`);
  }
  return payload;
}

export async function assertProductionWaitlistCanaryPreflight(
  env: CanaryEnv,
  email: string,
  request: typeof fetch = fetch
): Promise<void> {
  const url = new URL(
    '/api/canary/waitlist/receipt?mode=preflight',
    'https://jov.ie'
  );
  const payload = productionWaitlistPreflightReceiptSchema.parse(
    await readScopedReceipt(url, env, request)
  );
  if (
    payload.canary !== 'production-waitlist' ||
    payload.environment !== 'production' ||
    payload.emailSha256 !== hashProductionWaitlistCanaryEmail(email)
  ) {
    throw new Error('Canary preflight identity or environment mismatch');
  }
}

export async function readDurableProductionWaitlistReceipt(
  env: CanaryEnv,
  params: { readonly runId: string; readonly entryId: string },
  request: typeof fetch = fetch
): Promise<DurableProductionWaitlistReceipt> {
  const url = new URL('/api/canary/waitlist/receipt', 'https://jov.ie');
  url.searchParams.set('run_id', params.runId);
  url.searchParams.set('entry_id', params.entryId);
  const receipt = productionWaitlistDurableReceiptSchema.parse(
    await readScopedReceipt(url, env, request)
  );
  const expectedRunId = parseProductionWaitlistCanaryRunId(params.runId);
  const expectedEmail = buildProductionWaitlistCanaryEmail(
    env.E2E_PROD_SIGNUP_EMAIL_BASE ?? ''
  );
  if (
    receipt.runId !== expectedRunId ||
    receipt.entryId !== params.entryId ||
    receipt.emailSha256 !== hashProductionWaitlistCanaryEmail(expectedEmail)
  ) {
    throw new Error('Canary durable receipt identity or traversal mismatch');
  }
  return receipt;
}

export function buildProductionWaitlistCanaryReceipt(params: {
  readonly runId: string;
  readonly email: string;
  readonly deployment: ProductionDeployment;
  readonly durableReceipt: DurableProductionWaitlistReceipt;
  readonly startedAt: Date;
  readonly completedAt: Date;
}): ProductionWaitlistCanaryReceipt {
  const runId = parseProductionWaitlistCanaryRunId(params.runId);
  const emailSha256 = hashProductionWaitlistCanaryEmail(params.email);
  if (
    !runId ||
    params.durableReceipt.runId !== runId ||
    params.durableReceipt.emailSha256 !== emailSha256
  ) {
    throw new Error('Canary final receipt identity or traversal mismatch');
  }
  return {
    schemaVersion: 1,
    canary: 'production-waitlist',
    runId,
    emailSha256,
    deployment: { id: params.deployment.id, sha: params.deployment.sha },
    assertions: {
      runtime: {
        homepage: 'passed',
        primaryCta: 'passed',
        start: 'passed',
        otpSession: 'passed',
        intake: 'passed',
        waitlist: 'passed',
        deploymentStable: 'passed',
      },
      database: 'scoped-receipt-passed',
      analytics: {
        firstPartyWaitlistConfirmation: 'scoped-receipt-passed',
      },
      communications: {
        authOtp: 'routed-to-dedicated-mailbox',
        waitlistConfirmationEmail: 'suppressed-and-receipted',
        slack: 'suppressed-and-receipted',
      },
      cleanup: 'not-run-identity-retained',
    },
    durableReceipt: params.durableReceipt,
    startedAt: params.startedAt.toISOString(),
    completedAt: params.completedAt.toISOString(),
  };
}
