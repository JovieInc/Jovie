import { NextResponse } from 'next/server';
import { decodeFapiHostFromPublishableKey } from '@/lib/auth/decode-fapi-host';
import { verifyCronRequest } from '@/lib/cron/auth';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { serverFetch } from '@/lib/http/server-fetch';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Clerk instance config-audit cron (JOV-2446).
 *
 * Jovie is SSO-only (Google + Apple). The Clerk dashboard for both production
 * and staging instances must NEVER have email/password or email-OTP enabled
 * as authentication strategies. The AuthShell appearance map (defense in
 * depth) and the Layer A canary catch UI-visible regressions, but the actual
 * security boundary is the Clerk dashboard config — a regression there leaves
 * `https://clerk.<env>.jov.ie/v1/client/sign_ins` open to credential POSTs
 * even when the UI hides the form.
 *
 * This cron polls Clerk's public Frontend API `environment` endpoint (the
 * same endpoint the Clerk JS SDK uses to decide which auth UI to render) and
 * alerts via captureError + Slack if any forbidden strategy is enabled.
 *
 * Scheduled every 30 min in vercel.json. The FAPI environment endpoint does
 * not require auth credentials — it returns the public auth-strategy config
 * the user-facing app reads. We probe both prod and staging in a single run.
 */

const FORBIDDEN_FIRST_FACTOR_STRATEGIES = new Set([
  'password',
  'email_code',
  'email_link',
  'phone_code',
  'username',
]);

const FORBIDDEN_IDENTIFICATION_REQUIREMENTS = new Set([
  'email_address',
  'phone_number',
  'username',
]);

interface ClerkInstance {
  readonly label: 'production' | 'staging';
  readonly publishableKey: string | undefined;
}

interface InstanceAuditResult {
  readonly label: string;
  readonly fapiHost: string | null;
  readonly probed: boolean;
  readonly forbiddenStrategies: readonly string[];
  readonly forbiddenIdentifications: readonly string[];
  readonly error?: string;
}

interface AuditOutcome {
  readonly ok: boolean;
  readonly results: readonly InstanceAuditResult[];
  readonly violations: readonly InstanceAuditResult[];
}

function getInstances(): readonly ClerkInstance[] {
  return [
    {
      label: 'production',
      publishableKey:
        env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() || undefined,
    },
    {
      label: 'staging',
      publishableKey: env.CLERK_PUBLISHABLE_KEY_STAGING?.trim() || undefined,
    },
  ];
}

async function fetchEnvironmentJson(
  fapiHost: string,
  publishableKey: string
): Promise<Record<string, unknown>> {
  const url = `https://${fapiHost}/v1/environment?_clerk_js_version=5.0.0`;
  const response = await serverFetch(url, {
    headers: {
      Accept: 'application/json',
      // Clerk FAPI accepts the publishable key in both Authorization and
      // the `Clerk-Frontend-Api-Key` style; Authorization works for both
      // live and test instances and is what `@clerk/clerk-js` sends.
      Authorization: publishableKey,
    },
    timeoutMs: 10_000,
    cache: 'no-store',
    context: `clerk-fapi-environment-${fapiHost}`,
    retry: { maxRetries: 2, baseDelayMs: 250, maxDelayMs: 1000 },
  });

  if (!response.ok) {
    throw new Error(
      `Clerk FAPI environment returned HTTP ${response.status}: ${response.statusText}`
    );
  }

  return (await response.json()) as Record<string, unknown>;
}

function asStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function pickAuthConfig(
  envJson: Record<string, unknown>
): Record<string, unknown> {
  const direct = envJson['auth_config'];
  if (direct && typeof direct === 'object') {
    return direct as Record<string, unknown>;
  }

  const userSettings = envJson['user_settings'];
  if (userSettings && typeof userSettings === 'object') {
    return userSettings as Record<string, unknown>;
  }

  return {};
}

function extractFirstFactors(
  authConfig: Record<string, unknown>
): readonly string[] {
  const direct = asStringArray(authConfig['first_factors']);
  if (direct.length > 0) return direct;

  const attributes = authConfig['attributes'];
  if (attributes && typeof attributes === 'object') {
    const factors = new Set<string>();
    for (const [attribute, settings] of Object.entries(attributes)) {
      if (!settings || typeof settings !== 'object') continue;
      const s = settings as Record<string, unknown>;
      if (s['used_for_first_factor'] !== true) continue;
      const verifications = asStringArray(s['verifications']);
      if (verifications.length === 0) {
        factors.add(attribute);
      } else {
        for (const verification of verifications) {
          factors.add(verification);
        }
      }
    }
    return Array.from(factors);
  }

  return [];
}

function extractIdentifications(
  authConfig: Record<string, unknown>
): readonly string[] {
  const direct = asStringArray(authConfig['identification_requirements']);
  if (direct.length > 0) return direct;

  const attributes = authConfig['attributes'];
  if (attributes && typeof attributes === 'object') {
    const required: string[] = [];
    for (const [attribute, settings] of Object.entries(attributes)) {
      if (!settings || typeof settings !== 'object') continue;
      const s = settings as Record<string, unknown>;
      if (s['used_for_first_factor'] === true && s['enabled'] === true) {
        required.push(attribute);
      }
    }
    return required;
  }

  return [];
}

async function auditInstance(
  instance: ClerkInstance
): Promise<InstanceAuditResult> {
  if (!instance.publishableKey) {
    return {
      label: instance.label,
      fapiHost: null,
      probed: false,
      forbiddenStrategies: [],
      forbiddenIdentifications: [],
      error: 'publishable_key_missing',
    };
  }

  const fapiHost = decodeFapiHostFromPublishableKey(instance.publishableKey);
  if (!fapiHost) {
    return {
      label: instance.label,
      fapiHost: null,
      probed: false,
      forbiddenStrategies: [],
      forbiddenIdentifications: [],
      error: 'fapi_host_decode_failed',
    };
  }

  try {
    const envJson = await fetchEnvironmentJson(
      fapiHost,
      instance.publishableKey
    );
    const authConfig = pickAuthConfig(envJson);
    const firstFactors = extractFirstFactors(authConfig);
    const identifications = extractIdentifications(authConfig);

    const forbiddenStrategies = firstFactors.filter(factor =>
      FORBIDDEN_FIRST_FACTOR_STRATEGIES.has(factor)
    );
    const forbiddenIdentifications = identifications.filter(identification =>
      FORBIDDEN_IDENTIFICATION_REQUIREMENTS.has(identification)
    );

    return {
      label: instance.label,
      fapiHost,
      probed: true,
      forbiddenStrategies,
      forbiddenIdentifications,
    };
  } catch (error) {
    return {
      label: instance.label,
      fapiHost,
      probed: false,
      forbiddenStrategies: [],
      forbiddenIdentifications: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function auditClerkInstances(
  instances: readonly ClerkInstance[] = getInstances()
): Promise<AuditOutcome> {
  const results = await Promise.all(instances.map(auditInstance));
  const violations = results.filter(
    result =>
      result.forbiddenStrategies.length > 0 ||
      result.forbiddenIdentifications.length > 0
  );

  const ok = violations.length === 0 && results.every(r => r.probed);

  return {
    ok,
    results,
    violations,
  };
}

function formatViolationMessage(violations: readonly InstanceAuditResult[]) {
  const lines = ['Clerk instance config audit detected SSO-only violations:'];
  for (const violation of violations) {
    lines.push(
      `- [${violation.label}] fapi=${violation.fapiHost ?? 'unknown'} ` +
        `strategies=${violation.forbiddenStrategies.join(',') || 'none'} ` +
        `identifications=${violation.forbiddenIdentifications.join(',') || 'none'}`
    );
  }
  lines.push('Flip the Clerk dashboard back to SSO-only (JOV-2446).');
  return lines.join('\n');
}

export async function GET(request: Request) {
  const authError = verifyCronRequest(request, {
    route: '/api/cron/clerk-config-audit',
  });
  if (authError) return authError;

  try {
    const outcome = await auditClerkInstances();

    logger.info('[clerk-config-audit] Audit complete', {
      ok: outcome.ok,
      results: outcome.results.map(result => ({
        label: result.label,
        probed: result.probed,
        forbiddenStrategies: result.forbiddenStrategies,
        forbiddenIdentifications: result.forbiddenIdentifications,
        error: result.error,
      })),
    });

    if (outcome.violations.length > 0) {
      const message = formatViolationMessage(outcome.violations);
      logger.error('[clerk-config-audit] VIOLATION', { message });
      await captureError(
        'Clerk dashboard regressed off SSO-only (JOV-2446)',
        new Error(message),
        {
          route: '/api/cron/clerk-config-audit',
          method: 'GET',
          severity: 'fatal',
          violations: outcome.violations,
        }
      );
    }

    return NextResponse.json(
      {
        success: outcome.ok,
        results: outcome.results,
        violations: outcome.violations,
        timestamp: new Date().toISOString(),
      },
      {
        status: outcome.ok ? 200 : 503,
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (error) {
    logger.error('[clerk-config-audit] Audit failed:', error);
    await captureError('Clerk config audit cron failed', error, {
      route: '/api/cron/clerk-config-audit',
      method: 'GET',
    });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Audit failed',
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
