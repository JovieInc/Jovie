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
  readonly authUnavailable: boolean;
  readonly testAuthSessionOk: boolean | null;
  readonly checks: readonly SignedInAuthCheck[];
}

export const REQUIRED_SIGNED_IN_AUTH_ENV_KEYS = [
  'NEXT_PUBLIC_BETTER_AUTH_URL',
  'BETTER_AUTH_SECRET',
  'SESSION_SECRET',
  'DATABASE_URL',
] as const;

export type SignedInAuthEnvKey =
  (typeof REQUIRED_SIGNED_IN_AUTH_ENV_KEYS)[number];

function hasValue(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function resolveSignedInAuthHostname(
  target: SignedInAuthTarget
): string {
  return target;
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

function checkBetterAuthUrl(
  env: Partial<Record<string, string | undefined>>,
  target: SignedInAuthTarget
): SignedInAuthCheck {
  if (target === 'local') {
    return {
      id: 'better-auth-url',
      status: 'skip',
      message: 'Local target does not enforce Better Auth URL',
    };
  }

  const url = env.NEXT_PUBLIC_BETTER_AUTH_URL;
  if (!hasValue(url)) {
    return {
      id: 'better-auth-url',
      status: 'fail',
      message: 'NEXT_PUBLIC_BETTER_AUTH_URL is required for non-local targets',
      evidence: 'missing',
    };
  }

  if (!/^https?:\/\//.test(url!)) {
    return {
      id: 'better-auth-url',
      status: 'fail',
      message: 'NEXT_PUBLIC_BETTER_AUTH_URL must be an absolute http(s) URL',
      evidence: url,
    };
  }

  return {
    id: 'better-auth-url',
    status: 'pass',
    message: 'Better Auth URL is configured',
    evidence: url,
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
    checkBetterAuthUrl(env, target),
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

function buildSignInProbeChecks(
  signInResponse: Response,
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
      message: 'Failed to reach /signin for Better Auth probe',
      evidence: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  if (!signInResponse) {
    return { authUnavailable: false };
  }

  const bodyText = await signInResponse.text().catch(() => '');
  const authUnavailable = hasAuthUnavailableCopy(bodyText);

  checks.push(...buildSignInProbeChecks(signInResponse, authUnavailable));

  return { authUnavailable };
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
  options: { timeoutMs?: number } = {}
): Promise<SignedInAuthProbeResult> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const hostname = new URL(baseUrl).hostname;
  const checks: SignedInAuthCheck[] = [];

  const { authUnavailable } = await probeSignInPage(baseUrl, timeoutMs, checks);
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
    `[signed-in-auth-probe] authUnavailable=${result.authUnavailable} testAuthSessionOk=${result.testAuthSessionOk}`,
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

const AUTH_UNAVAILABLE_PHRASES = [
  'auth unavailable',
  'authentication unavailable',
  'temporarily unavailable',
] as const;
