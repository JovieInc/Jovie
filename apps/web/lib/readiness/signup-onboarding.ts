export type SignupOnboardingReadinessTarget = 'prd' | 'stg' | 'local';
export type SignupOnboardingReadinessSource = 'env' | 'vercel-file';

export const REQUIRED_SIGNUP_ONBOARDING_ENV_KEYS = [
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
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
}

interface CheckSignupOnboardingReadinessOptions {
  readonly env: Partial<Record<string, string | undefined>>;
  readonly target: SignupOnboardingReadinessTarget;
  readonly source: SignupOnboardingReadinessSource;
}

function hasValue(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
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

  return {
    ok: missing.length === 0,
    target,
    source,
    required,
    present,
    missing,
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
    lines.push(`${key}: ${result.missing.includes(key) ? 'MISSING' : 'SET'}`);
  }

  lines.push(`[signup-readiness] status=${result.ok ? 'passed' : 'failed'}`);
  if (!result.ok) {
    lines.push(`[signup-readiness] missing=${result.missing.join(', ')}`);
  }

  return lines.join('\n');
}
