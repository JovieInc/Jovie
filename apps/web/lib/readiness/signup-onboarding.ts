export type SignupOnboardingReadinessTarget = 'prd' | 'stg' | 'local';
export type SignupOnboardingReadinessSource = 'env' | 'vercel-file';

export const REQUIRED_SIGNUP_ONBOARDING_ENV_KEYS = [
  'BETTER_AUTH_URL',
  'NEXT_PUBLIC_BETTER_AUTH_URL',
  'BETTER_AUTH_SECRET',
  'DATABASE_URL',
  'SESSION_SECRET',
  'AI_GATEWAY_API_KEY',
  'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
  'TURNSTILE_SECRET_KEY',
] as const;

export type SignupOnboardingEnvKey =
  (typeof REQUIRED_SIGNUP_ONBOARDING_ENV_KEYS)[number];

export interface SignupOnboardingReadinessResult {
  readonly ok: boolean;
  readonly target: SignupOnboardingReadinessTarget;
  readonly source: SignupOnboardingReadinessSource;
  readonly required: readonly SignupOnboardingEnvKey[];
  readonly present: readonly SignupOnboardingEnvKey[];
  readonly missing: readonly SignupOnboardingEnvKey[];
  readonly invalid: readonly SignupOnboardingEnvKey[];
}

interface CheckSignupOnboardingReadinessOptions {
  readonly env: Partial<Record<string, string | undefined>>;
  readonly target: SignupOnboardingReadinessTarget;
  readonly source: SignupOnboardingReadinessSource;
}

function hasValue(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

const BETTER_AUTH_URL_KEYS = [
  'BETTER_AUTH_URL',
  'NEXT_PUBLIC_BETTER_AUTH_URL',
] as const satisfies readonly SignupOnboardingEnvKey[];

const ALLOWED_AUTH_ORIGINS = {
  prd: new Set(['https://jov.ie', 'https://www.jov.ie']),
  stg: new Set(['https://staging.jov.ie']),
} as const;

function canonicalAuthOrigin(
  value: string | undefined,
  target: Exclude<SignupOnboardingReadinessTarget, 'local'>
): string | null {
  if (!hasValue(value)) return null;
  try {
    const url = new URL(value!);
    const isOriginOnly =
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      url.port === '' &&
      url.pathname === '/' &&
      url.search === '' &&
      url.hash === '';
    return isOriginOnly && ALLOWED_AUTH_ORIGINS[target].has(url.origin)
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

export function checkSignupOnboardingReadiness({
  env,
  target,
  source,
}: CheckSignupOnboardingReadinessOptions): SignupOnboardingReadinessResult {
  const required =
    target === 'local' ? [] : [...REQUIRED_SIGNUP_ONBOARDING_ENV_KEYS];
  const present = required.filter(key => hasValue(env[key]));
  const missing = required.filter(key => !hasValue(env[key]));
  const invalidKeys = new Set<SignupOnboardingEnvKey>();
  if (target !== 'local') {
    const origins = BETTER_AUTH_URL_KEYS.map(key => ({
      key,
      origin: canonicalAuthOrigin(env[key], target),
    }));
    for (const { key, origin } of origins) {
      if (hasValue(env[key]) && !origin) invalidKeys.add(key);
    }
    const validOrigins = origins.flatMap(({ origin }) =>
      origin ? [origin] : []
    );
    if (validOrigins.length === 2 && validOrigins[0] !== validOrigins[1]) {
      for (const key of BETTER_AUTH_URL_KEYS) invalidKeys.add(key);
    }
  }
  const invalid = required.filter(key => invalidKeys.has(key));

  return {
    ok: missing.length === 0 && invalid.length === 0,
    target,
    source,
    required,
    present,
    missing,
    invalid,
  };
}

export function formatSignupOnboardingReadinessReport(
  result: SignupOnboardingReadinessResult
): string {
  const lines = [
    `[signup-readiness] target=${result.target} source=${result.source}`,
  ];

  if (result.required.length === 0) {
    lines.push(
      '[signup-readiness] local target: no production signup keys required'
    );
    lines.push('[signup-readiness] status=passed');
    return lines.join('\n');
  }

  for (const key of result.required) {
    const state = result.missing.includes(key)
      ? 'MISSING'
      : result.invalid.includes(key)
        ? 'INVALID'
        : 'SET';
    lines.push(`${key}: ${state}`);
  }

  lines.push(`[signup-readiness] status=${result.ok ? 'passed' : 'failed'}`);
  if (!result.ok) {
    if (result.missing.length > 0) {
      lines.push(`[signup-readiness] missing=${result.missing.join(', ')}`);
    }
    if (result.invalid.length > 0) {
      lines.push(`[signup-readiness] invalid=${result.invalid.join(', ')}`);
    }
  }

  return lines.join('\n');
}
