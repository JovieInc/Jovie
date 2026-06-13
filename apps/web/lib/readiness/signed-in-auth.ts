import { HOSTNAME, STAGING_HOSTNAMES } from '@/constants/domains';
import type { ClerkKeyStatus } from '@/lib/auth/clerk-key-status';
import { CLERK_KEY_STATUS_HEADER } from '@/lib/auth/clerk-key-status';
import { resolveClerkKeys } from '@/lib/auth/staging-clerk-keys';
import {
  TEST_AUTH_BYPASS_MODE,
  TEST_MODE_HEADER,
} from '@/lib/auth/test-mode-constants';

export type SignedInAuthTarget = 'local' | 'stg' | 'prd';
export type SignedInAuthSource = 'env' | 'vercel-file';

export type SignedInAuthCheckStatus = 'pass' | 'fail' | 'skip';

export interface SignedInAuthCheck {
  readonly id: string;
  readonly status: SignedInAuthCheckStatus;
  readonly message: string;
  readonly evidence?: string;
}

export interface SignedInAuthVerificationResult {
  readonly ok: boolean;
  readonly target: SignedInAuthTarget;
  readonly source: SignedInAuthSource;
  readonly hostname: string;
  readonly checks: readonly SignedInAuthCheck[];
}

export interface SignedInAuthProbeResult {
  readonly ok: boolean;
  readonly baseUrl: string;
  readonly hostname: string;
  readonly clerkKeyStatus: ClerkKeyStatus | 'missing';
  readonly authUnavailable: boolean;
  readonly testAuthSessionOk: boolean | null;
  readonly checks: readonly SignedInAuthCheck[];
}

export const REQUIRED_SIGNED_IN_AUTH_ENV_KEYS = [
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
  'SESSION_SECRET',
  'DATABASE_URL',
] as const;

export type SignedInAuthEnvKey =
  (typeof REQUIRED_SIGNED_IN_AUTH_ENV_KEYS)[number];

const AUTH_UNAVAILABLE_PHRASES = [
  'auth unavailable',
  'authentication unavailable',
  'temporarily unavailable',
  'clerk is not configured',
] as const;

function hasValue(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function publishableKeyPrefix(value: string | undefined): string | null {
  if (!hasValue(value)) return null;
  if (value!.startsWith('pk_live_')) return 'pk_live';
  if (value!.startsWith('pk_test_')) return 'pk_test';
  return 'unknown';
}

export function resolveSignedInAuthHostname(
  target: SignedInAuthTarget
): string {
  if (target === 'stg') return `staging.${HOSTNAME}`;
  if (target === 'prd') return HOSTNAME;
  return 'localhost';
}

function checkRequiredEnvKeys(
  env: Partial<Record<string, string | undefined>>,
  target: SignedInAuthTarget
): SignedInAuthCheck[] {
  if (target === 'local') {
    return [
      {
        id: 'required-env-keys',
        status: 'skip',
        message:
          'Local target uses dev test-auth bypass; production auth keys are optional',
      },
    ];
  }

  const missing = REQUIRED_SIGNED_IN_AUTH_ENV_KEYS.filter(
    key => !hasValue(env[key])
  );

  if (missing.length === 0) {
    return [
      {
        id: 'required-env-keys',
        status: 'pass',
        message: `All required signed-in auth env keys are set (${REQUIRED_SIGNED_IN_AUTH_ENV_KEYS.join(', ')})`,
      },
    ];
  }

  return [
    {
      id: 'required-env-keys',
      status: 'fail',
      message: `Missing required signed-in auth env keys: ${missing.join(', ')}`,
      evidence: missing.join(', '),
    },
  ];
}

function checkClerkKeyRouting(
  env: Partial<Record<string, string | undefined>>,
  target: SignedInAuthTarget,
  hostname: string
): SignedInAuthCheck[] {
  const previousPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const previousSecretKey = process.env.CLERK_SECRET_KEY;
  const previousStagingPublishableKey =
    process.env.CLERK_PUBLISHABLE_KEY_STAGING;
  const previousStagingSecretKey = process.env.CLERK_SECRET_KEY_STAGING;

  try {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY =
      env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    process.env.CLERK_SECRET_KEY = env.CLERK_SECRET_KEY;
    process.env.CLERK_PUBLISHABLE_KEY_STAGING =
      env.CLERK_PUBLISHABLE_KEY_STAGING;
    process.env.CLERK_SECRET_KEY_STAGING = env.CLERK_SECRET_KEY_STAGING;

    const keys = resolveClerkKeys(hostname);

    if (target === 'stg' && keys.status === 'staging_inherits_prod') {
      return [
        {
          id: 'clerk-key-routing',
          status: 'fail',
          message:
            'Staging host would inherit production Clerk keys; staging must use its own Clerk instance',
          evidence: `hostname=${hostname} status=${keys.status}`,
        },
      ];
    }

    if (target === 'stg' && keys.status === 'staging_missing') {
      return [
        {
          id: 'clerk-key-routing',
          status: 'fail',
          message:
            'Staging Clerk keys are missing or incomplete for the staging hostname',
          evidence: `hostname=${hostname} status=${keys.status}`,
        },
      ];
    }

    if (keys.status !== 'ok') {
      return [
        {
          id: 'clerk-key-routing',
          status: 'fail',
          message: `Clerk key routing failed for ${hostname}`,
          evidence: `status=${keys.status}`,
        },
      ];
    }

    return [
      {
        id: 'clerk-key-routing',
        status: 'pass',
        message: `Clerk key routing resolved for ${hostname}`,
        evidence: `status=${keys.status} publishableKeyPrefix=${publishableKeyPrefix(keys.publishableKey) ?? 'missing'}`,
      },
    ];
  } finally {
    if (previousPublishableKey === undefined) {
      delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    } else {
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = previousPublishableKey;
    }

    if (previousSecretKey === undefined) {
      delete process.env.CLERK_SECRET_KEY;
    } else {
      process.env.CLERK_SECRET_KEY = previousSecretKey;
    }

    if (previousStagingPublishableKey === undefined) {
      delete process.env.CLERK_PUBLISHABLE_KEY_STAGING;
    } else {
      process.env.CLERK_PUBLISHABLE_KEY_STAGING = previousStagingPublishableKey;
    }

    if (previousStagingSecretKey === undefined) {
      delete process.env.CLERK_SECRET_KEY_STAGING;
    } else {
      process.env.CLERK_SECRET_KEY_STAGING = previousStagingSecretKey;
    }
  }
}

function checkPublishableKeyType(
  env: Partial<Record<string, string | undefined>>,
  target: SignedInAuthTarget,
  hostname: string
): SignedInAuthCheck {
  if (target === 'local') {
    return {
      id: 'publishable-key-type',
      status: 'skip',
      message: 'Local target does not enforce publishable key prefix',
    };
  }

  const keys = resolveClerkKeysForEnv(env, hostname);
  const prefix = publishableKeyPrefix(keys.publishableKey);

  if (target === 'prd' && prefix !== 'pk_live') {
    return {
      id: 'publishable-key-type',
      status: 'fail',
      message: 'Production target must use a pk_live_ Clerk publishable key',
      evidence: `prefix=${prefix ?? 'missing'}`,
    };
  }

  return {
    id: 'publishable-key-type',
    status: 'pass',
    message: `Publishable key prefix is acceptable for ${target}`,
    evidence: `prefix=${prefix ?? 'missing'}`,
  };
}

function resolveClerkKeysForEnv(
  env: Partial<Record<string, string | undefined>>,
  hostname: string
) {
  const previousPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const previousSecretKey = process.env.CLERK_SECRET_KEY;
  const previousStagingPublishableKey =
    process.env.CLERK_PUBLISHABLE_KEY_STAGING;
  const previousStagingSecretKey = process.env.CLERK_SECRET_KEY_STAGING;

  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY =
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  process.env.CLERK_SECRET_KEY = env.CLERK_SECRET_KEY;
  process.env.CLERK_PUBLISHABLE_KEY_STAGING = env.CLERK_PUBLISHABLE_KEY_STAGING;
  process.env.CLERK_SECRET_KEY_STAGING = env.CLERK_SECRET_KEY_STAGING;

  const keys = resolveClerkKeys(hostname);

  if (previousPublishableKey === undefined) {
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  } else {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = previousPublishableKey;
  }

  if (previousSecretKey === undefined) {
    delete process.env.CLERK_SECRET_KEY;
  } else {
    process.env.CLERK_SECRET_KEY = previousSecretKey;
  }

  if (previousStagingPublishableKey === undefined) {
    delete process.env.CLERK_PUBLISHABLE_KEY_STAGING;
  } else {
    process.env.CLERK_PUBLISHABLE_KEY_STAGING = previousStagingPublishableKey;
  }

  if (previousStagingSecretKey === undefined) {
    delete process.env.CLERK_SECRET_KEY_STAGING;
  } else {
    process.env.CLERK_SECRET_KEY_STAGING = previousStagingSecretKey;
  }

  return keys;
}

function checkStagingHostnames(): SignedInAuthCheck {
  const expected = [`staging.${HOSTNAME}`, `main.${HOSTNAME}`];
  const actual = Array.from(STAGING_HOSTNAMES).sort((a, b) =>
    a.localeCompare(b)
  );
  const matches =
    expected.every(hostname => STAGING_HOSTNAMES.has(hostname)) &&
    actual.length === expected.length;

  return {
    id: 'staging-hostnames',
    status: matches ? 'pass' : 'fail',
    message: matches
      ? 'Staging hostnames are configured for Clerk key routing'
      : 'Staging hostname set does not match expected Clerk routing hosts',
    evidence: `expected=${expected.join(',')} actual=${actual.join(',')}`,
  };
}

export function hasAuthUnavailableCopy(text: string): boolean {
  const normalized = text.toLowerCase();
  return AUTH_UNAVAILABLE_PHRASES.some(phrase => normalized.includes(phrase));
}

interface VerifySignedInAuthOptions {
  readonly env: Partial<Record<string, string | undefined>>;
  readonly target: SignedInAuthTarget;
  readonly source: SignedInAuthSource;
}

export function verifySignedInAuthConfig({
  env,
  target,
  source,
}: VerifySignedInAuthOptions): SignedInAuthVerificationResult {
  const hostname = resolveSignedInAuthHostname(target);
  const checks: SignedInAuthCheck[] = [
    ...checkRequiredEnvKeys(env, target),
    ...checkClerkKeyRouting(env, target, hostname),
    checkPublishableKeyType(env, target, hostname),
    checkStagingHostnames(),
  ];

  const ok = checks.every(
    check => check.status === 'pass' || check.status === 'skip'
  );

  return {
    ok,
    target,
    source,
    hostname,
    checks,
  };
}

export function formatSignedInAuthReport(
  result: SignedInAuthVerificationResult
): string {
  const lines = [
    `[signed-in-auth] target=${result.target} source=${result.source} hostname=${result.hostname}`,
  ];

  for (const check of result.checks) {
    lines.push(
      `[${check.status}] ${check.id}: ${check.message}${
        check.evidence ? ` (${check.evidence})` : ''
      }`
    );
  }

  lines.push(`[signed-in-auth] status=${result.ok ? 'passed' : 'failed'}`);
  return lines.join('\n');
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.localhost')
  );
}

interface ProbeSignedInAuthDeploymentOptions {
  readonly timeoutMs?: number;
}

function resolveClerkKeyStatus(
  headerValue: string | null
): ClerkKeyStatus | 'missing' {
  if (
    headerValue === 'ok' ||
    headerValue === 'no_publishable_key' ||
    headerValue === 'staging_missing' ||
    headerValue === 'staging_inherits_prod'
  ) {
    return headerValue;
  }

  return 'missing';
}

function buildSignInProbeChecks(
  signInResponse: Response,
  clerkKeyStatus: ClerkKeyStatus | 'missing',
  authUnavailable: boolean
): SignedInAuthCheck[] {
  return [
    {
      id: 'signin-reachable',
      status: signInResponse.ok ? 'pass' : 'fail',
      message: signInResponse.ok
        ? 'Sign-in page responded successfully'
        : `Sign-in page returned HTTP ${signInResponse.status}`,
      evidence: `status=${signInResponse.status}`,
    },
    {
      id: 'clerk-key-status-header',
      status: clerkKeyStatus === 'ok' ? 'pass' : 'fail',
      message:
        clerkKeyStatus === 'ok'
          ? 'Middleware reported healthy Clerk key routing'
          : `Middleware reported Clerk key status ${clerkKeyStatus}`,
      evidence: `${CLERK_KEY_STATUS_HEADER}=${clerkKeyStatus}`,
    },
    {
      id: 'auth-unavailable-copy',
      status: authUnavailable ? 'fail' : 'pass',
      message: authUnavailable
        ? 'Sign-in page rendered auth-unavailable copy'
        : 'Sign-in page did not render auth-unavailable copy',
    },
  ];
}

async function probeSignInPage(
  baseUrl: string,
  timeoutMs: number,
  checks: SignedInAuthCheck[]
): Promise<{
  readonly clerkKeyStatus: ClerkKeyStatus | 'missing';
  readonly authUnavailable: boolean;
}> {
  const signInResponse = await fetch(new URL('/signin', baseUrl), {
    method: 'GET',
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  }).catch(error => {
    checks.push({
      id: 'signin-reachable',
      status: 'fail',
      message: 'Failed to reach /signin for Clerk key status probe',
      evidence: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  if (!signInResponse) {
    return { clerkKeyStatus: 'missing', authUnavailable: false };
  }

  const clerkKeyStatus = resolveClerkKeyStatus(
    signInResponse.headers.get(CLERK_KEY_STATUS_HEADER)
  );
  const bodyText = await signInResponse.text().catch(() => '');
  const authUnavailable = hasAuthUnavailableCopy(bodyText);

  checks.push(
    ...buildSignInProbeChecks(signInResponse, clerkKeyStatus, authUnavailable)
  );

  return { clerkKeyStatus, authUnavailable };
}

async function probeDevTestAuthSession(
  baseUrl: string,
  hostname: string,
  timeoutMs: number,
  checks: SignedInAuthCheck[]
): Promise<boolean | null> {
  if (!isLoopbackHost(hostname)) {
    checks.push({
      id: 'dev-test-auth-session',
      status: 'skip',
      message:
        'Remote deployment probe skips loopback-only dev test-auth session',
    });
    return null;
  }

  const sessionResponse = await fetch(
    new URL('/api/dev/test-auth/session', baseUrl),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [TEST_MODE_HEADER]: TEST_AUTH_BYPASS_MODE,
      },
      body: JSON.stringify({ persona: 'creator-ready' }),
      signal: AbortSignal.timeout(timeoutMs),
    }
  ).catch(error => {
    checks.push({
      id: 'dev-test-auth-session',
      status: 'fail',
      message: 'Dev test-auth session bootstrap failed',
      evidence: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  if (!sessionResponse) {
    return false;
  }

  const responseText = await sessionResponse.text().catch(() => '');
  checks.push({
    id: 'dev-test-auth-session',
    status: sessionResponse.ok ? 'pass' : 'fail',
    message: sessionResponse.ok
      ? 'Dev test-auth session bootstrap succeeded'
      : 'Dev test-auth session bootstrap returned a non-OK response',
    evidence: `status=${sessionResponse.status} body=${responseText.slice(0, 160)}`,
  });

  return sessionResponse.ok;
}

export async function probeSignedInAuthDeployment(
  baseUrl: string,
  options: ProbeSignedInAuthDeploymentOptions = {}
): Promise<SignedInAuthProbeResult> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const hostname = new URL(baseUrl).hostname;
  const checks: SignedInAuthCheck[] = [];

  const { clerkKeyStatus, authUnavailable } = await probeSignInPage(
    baseUrl,
    timeoutMs,
    checks
  );
  const testAuthSessionOk = await probeDevTestAuthSession(
    baseUrl,
    hostname,
    timeoutMs,
    checks
  );

  const ok = checks.every(
    check => check.status === 'pass' || check.status === 'skip'
  );

  return {
    ok,
    baseUrl,
    hostname,
    clerkKeyStatus,
    authUnavailable,
    testAuthSessionOk,
    checks,
  };
}

export function formatSignedInAuthProbeReport(
  result: SignedInAuthProbeResult
): string {
  const lines = [
    `[signed-in-auth-probe] baseUrl=${result.baseUrl} hostname=${result.hostname}`,
    `[signed-in-auth-probe] clerkKeyStatus=${result.clerkKeyStatus} authUnavailable=${result.authUnavailable} testAuthSessionOk=${result.testAuthSessionOk}`,
  ];

  for (const check of result.checks) {
    lines.push(
      `[${check.status}] ${check.id}: ${check.message}${
        check.evidence ? ` (${check.evidence})` : ''
      }`
    );
  }

  lines.push(
    `[signed-in-auth-probe] status=${result.ok ? 'passed' : 'failed'}`
  );
  return lines.join('\n');
}
