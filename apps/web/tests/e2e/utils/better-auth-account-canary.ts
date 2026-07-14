import { createHash } from 'node:crypto';

const CANARY_NAMESPACE = 'jovie-ba-prod-canary';
const SHA_PATTERN = /^[a-f0-9]{40}$/i;
const RUNTIME_SHA_PATTERN = /^(?:[a-f0-9]{7}|[a-f0-9]{40})$/i;

export const BETTER_AUTH_ACCOUNT_CANARY_KEYS = [
  'BASE_URL',
  'DATABASE_URL',
  'E2E_ENVIRONMENT',
  'E2E_PROD_SIGNUP_EMAIL_BASE',
  'E2E_PROD_MAILBOX_PROVIDER',
  'E2E_PROD_OTP_CHECK_URL',
  'E2E_PROD_OTP_CHECK_TOKEN',
  'PLAYWRIGHT_TEST_BASE_URL',
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

export interface BetterAuthAccountCanaryReceipt {
  readonly schemaVersion: 1;
  readonly canary: 'better-auth-production-account';
  readonly runId: string;
  readonly emailSha256: string;
  readonly deployment: { readonly id: string; readonly sha: string };
  readonly assertions: {
    readonly startRoute: 'passed';
    readonly session: 'passed';
    readonly identityLinkage: 'passed';
    readonly deploymentStable: 'passed';
    readonly cleanup: 'zero-residue';
  };
  readonly startedAt: string;
  readonly completedAt: string;
}

function splitEmail(email: string): readonly [string, string] {
  const match = email
    .trim()
    .toLowerCase()
    .match(/^([^@+]+)@([^@]+)$/);
  if (!match?.[1] || !match[2]) {
    throw new Error(
      'E2E_PROD_SIGNUP_EMAIL_BASE must be a base address without plus-tagging'
    );
  }
  return [match[1], match[2]];
}

function normalizeRunId(runId: string): string {
  const normalized = runId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  if (!normalized)
    throw new Error('Synthetic run id is empty after normalization');
  return normalized;
}

export function buildBetterAuthAccountCanaryEmail(
  baseEmail: string,
  runId: string
): string {
  const [local, domain] = splitEmail(baseEmail);
  return `${local}+${CANARY_NAMESPACE}-${normalizeRunId(runId)}@${domain}`;
}

export function buildBetterAuthAccountCanaryLikePattern(
  baseEmail: string
): string {
  const [local, domain] = splitEmail(baseEmail);
  const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');
  return `${escapeLike(local)}+${CANARY_NAMESPACE}-%@${escapeLike(domain)}`;
}

/** Mirrors Better Auth 1.6.23 email-otp `toOTPIdentifier('sign-in', email)`. */
export function buildBetterAuthSignInVerificationIdentifier(
  email: string
): string {
  return `sign-in-otp-${email}`;
}

export function isExactBetterAuthAccountCanaryEmail(
  email: string,
  baseEmail: string
): boolean {
  const [local, domain] = splitEmail(baseEmail);
  const escapedLocal = local.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedDomain = domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `^${escapedLocal}\\+${CANARY_NAMESPACE}-[a-z0-9]+(?:-[a-z0-9]+)*@${escapedDomain}$`
  ).test(email.toLowerCase());
}

export function validateBetterAuthAccountCanaryConfig(env: CanaryEnv): void {
  const missing = BETTER_AUTH_ACCOUNT_CANARY_KEYS.filter(
    key => !env[key]?.trim()
  );
  if (missing.length > 0) {
    throw new Error(
      `Better Auth account canary missing: ${missing.join(', ')}`
    );
  }
  if (env.E2E_PROD_MAILBOX_PROVIDER !== 'cloudflare-email-routing') {
    throw new Error(
      'Better Auth account canary requires cloudflare-email-routing'
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
  splitEmail(env.E2E_PROD_SIGNUP_EMAIL_BASE!);
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
    throw new Error('Production deployment changed during the account canary');
  }
}

export function buildBetterAuthAccountCanaryReceipt({
  runId,
  email,
  deployment,
  startedAt,
  completedAt,
}: {
  readonly runId: string;
  readonly email: string;
  readonly deployment: ProductionDeployment;
  readonly startedAt: Date;
  readonly completedAt: Date;
}): BetterAuthAccountCanaryReceipt {
  return {
    schemaVersion: 1,
    canary: 'better-auth-production-account',
    runId,
    emailSha256: createHash('sha256').update(email).digest('hex'),
    deployment: { id: deployment.id, sha: deployment.sha },
    assertions: {
      startRoute: 'passed',
      session: 'passed',
      identityLinkage: 'passed',
      deploymentStable: 'passed',
      cleanup: 'zero-residue',
    },
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
  };
}
