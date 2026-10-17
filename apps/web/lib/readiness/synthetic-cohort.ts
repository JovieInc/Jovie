import { createHash } from 'node:crypto';
import { z } from 'zod';
import { checkBetterAuthUrlOriginPolicy } from '@/lib/auth/url-origin-policy';
import {
  checkBetterAuthSecretPolicy,
  checkStripeSecretFormatPolicy,
  checkUrlEncryptionKeyPolicy,
  isHostWithOptionalPort,
  sessionSecretSchema,
} from '@/lib/env-configuration-policy';
import {
  getActiveSyntheticPrincipal,
  isControlledSyntheticMailbox,
  SYNTHETIC_PRINCIPAL_SCENARIOS,
} from '@/lib/synthetic/principals';
import { normalizeEmail } from '@/lib/utils/email';
import { REQUIRED_SIGNUP_ONBOARDING_ENV_KEYS } from './signup-onboarding';

const sha = z.string().regex(/^[a-f0-9]{40}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const applicationRole = z.string().regex(/^[A-Za-z_][A-Za-z0-9_$]{0,62}$/);
const build = z.object({ sourceSha: sha, artifactDigest: digest });
const immutableVercelOrigin = /^https:\/\/[a-zA-Z0-9-]+\.vercel\.app$/;
const bindingSchema = z.object({
  schema: z.literal('jovie.synthetic-cohort-config/v1'),
  projectId: z.string().regex(/^prj_[A-Za-z0-9]+$/),
  production: build.extend({
    databaseFingerprint: digest,
    applicationRole,
    origin: z.string(),
  }),
  cohort: build.extend({
    databaseFingerprint: digest,
    applicationRole,
    origin: z.string(),
  }),
  scenario: z.enum(SYNTHETIC_PRINCIPAL_SCENARIOS),
});

export type SyntheticCohortBinding = z.infer<typeof bindingSchema>;

const RUNTIME_PROOFS = [
  'protected_project_scoped_exact_artifact_deployment',
  'production_equivalent_schema_and_application_role',
  'customer_record_isolation',
  'non_synthetic_principal_denial',
  'existing_actor_lease_initial_state_and_session',
  'same_origin_browser_requests',
  'compiled_application_auth_and_return_origins',
  'artifact_target_compatibility',
  'full_canonical_environment_validation',
  'test_stripe_account_and_price_identity',
] as const;

const REQUIRED_ENV = [
  ...REQUIRED_SIGNUP_ONBOARDING_ENV_KEYS,
  'NEXT_PUBLIC_APP_URL',
  'E2E_PROD_SIGNUP_EMAIL_BASE',
  'E2E_PROD_USER_EMAIL',
  'STRIPE_SECRET_KEY',
  'URL_ENCRYPTION_KEY',
  'VERCEL_ENV',
  'VERCEL_URL',
  'VERCEL_PROJECT_ID',
  'VERCEL_GIT_COMMIT_SHA',
] as const;

function origin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/** Target identity only: a different endpoint is not customer-isolation proof. */
export function describeCohortDatabase(value: string | undefined): {
  fingerprint: string;
  role: string;
} | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const allowedOptions = new Set([
      'sslmode',
      'channel_binding',
      'connect_timeout',
      'application_name',
    ]);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname ||
      !url.username ||
      !url.password ||
      url.hash ||
      [...url.searchParams.keys()].some(key => !allowedOptions.has(key))
    ) {
      return null;
    }
    const database = decodeURIComponent(url.pathname.slice(1));
    const role = decodeURIComponent(url.username);
    if (!/^[A-Za-z0-9_.-]+$/.test(database) || !role) return null;
    const parts = [
      url.hostname.toLowerCase().replace('-pooler.', '.'),
      Number(url.port || 5432),
      database,
    ];
    // Match the established non-secret Python target receipt serialization.
    const serialized = `[${parts.map(part => JSON.stringify(part)).join(', ')}]`;
    return {
      fingerprint: createHash('sha256').update(serialized).digest('hex'),
      role,
    };
  } catch {
    return null;
  }
}

/**
 * Required cohort fields/bindings only (JOV-8251), not full environment validation.
 * No network, permission grant or
 * runtime-isolation attestation. Never use this result as customer acceptance.
 */
export function checkSyntheticCohortConfiguration({
  binding,
  env,
}: {
  binding: unknown;
  env: Readonly<Record<string, string | undefined>>;
}) {
  const parsed = bindingSchema.safeParse(binding);
  const issues = new Set<string>();
  const missing = REQUIRED_ENV.filter(key => !env[key]?.trim());
  if (missing.length) issues.add('missing_environment');
  if (!parsed.success) issues.add('invalid_binding');
  const expected = parsed.success ? parsed.data : null;
  const database = describeCohortDatabase(env.DATABASE_URL);
  if (!database) issues.add('invalid_database_url');
  const cohortOrigin = expected ? origin(expected.cohort.origin) : null;
  if (!cohortOrigin || !immutableVercelOrigin.test(cohortOrigin)) {
    issues.add('invalid_immutable_cohort_origin');
  }
  if (expected) {
    const productionOrigin = origin(expected.production.origin);
    if (!productionOrigin || !immutableVercelOrigin.test(productionOrigin)) {
      issues.add('invalid_production_origin');
    }
    if (cohortOrigin && cohortOrigin === productionOrigin) {
      issues.add('shared_production_origin');
    }
    if (
      expected.cohort.applicationRole !== expected.production.applicationRole
    ) {
      issues.add('production_application_role_mismatch');
    }
    if (env.VERCEL_PROJECT_ID !== expected.projectId) {
      issues.add('project_binding_mismatch');
    }
    if (env.VERCEL_GIT_COMMIT_SHA !== expected.cohort.sourceSha) {
      issues.add('runtime_source_mismatch');
    }
    if (expected.cohort.sourceSha !== expected.production.sourceSha) {
      issues.add('production_source_mismatch');
    }
    if (expected.cohort.artifactDigest !== expected.production.artifactDigest) {
      issues.add('production_artifact_mismatch');
    }
    if (
      expected.cohort.databaseFingerprint ===
        expected.production.databaseFingerprint ||
      database?.fingerprint === expected.production.databaseFingerprint
    ) {
      issues.add('shared_production_database');
    }
    if (database?.fingerprint !== expected.cohort.databaseFingerprint) {
      issues.add('database_binding_mismatch');
    }
    if (database?.role !== expected.cohort.applicationRole) {
      issues.add('application_role_mismatch');
    }
  }
  if (!['production', 'preview'].includes(env.VERCEL_ENV ?? '')) {
    issues.add('unsupported_deployment_environment');
  }
  if (
    checkBetterAuthSecretPolicy({
      secret: env.BETTER_AUTH_SECRET,
      vercelEnv: env.VERCEL_ENV ?? '',
    })
  ) {
    issues.add('auth_secret_policy_mismatch');
  }
  if (!sessionSecretSchema.safeParse(env.SESSION_SECRET).success) {
    issues.add('invalid_session_secret');
  }
  if (
    checkUrlEncryptionKeyPolicy({
      key: env.URL_ENCRYPTION_KEY,
      vercelEnv: env.VERCEL_ENV ?? '',
    })
  ) {
    issues.add('url_encryption_key_policy_mismatch');
  }
  if (checkStripeSecretFormatPolicy(env.STRIPE_SECRET_KEY)) {
    issues.add('stripe_secret_policy_mismatch');
  }
  if (
    env.VERCEL_BRANCH_URL !== undefined &&
    !isHostWithOptionalPort(env.VERCEL_BRANCH_URL)
  ) {
    issues.add('invalid_platform_branch_host');
  }
  // Bind the declared serving origin independently of configured auth URLs.
  // Better Auth derives request origins from its existing exact runtime hosts;
  // compiled public values and callback/return containment still need proof.
  if (
    !cohortOrigin ||
    !env.VERCEL_URL ||
    origin(`https://${env.VERCEL_URL}`) !== cohortOrigin
  ) {
    issues.add('platform_origin_mismatch');
  }
  if (!cohortOrigin || origin(env.NEXT_PUBLIC_APP_URL) !== cohortOrigin) {
    issues.add('cohort_origin_mismatch');
  }
  if (
    !origin(env.BETTER_AUTH_URL) ||
    !origin(env.NEXT_PUBLIC_BETTER_AUTH_URL) ||
    checkBetterAuthUrlOriginPolicy({
      betterAuthUrl: env.BETTER_AUTH_URL,
      publicBetterAuthUrl: env.NEXT_PUBLIC_BETTER_AUTH_URL,
      publicAppUrl: env.NEXT_PUBLIC_APP_URL,
      vercelEnv: env.VERCEL_ENV ?? '',
      vercelUrl: env.VERCEL_URL,
      vercelBranchUrl: env.VERCEL_BRANCH_URL,
    })
  ) {
    issues.add('auth_origin_policy_mismatch');
  }
  const email = normalizeEmail(env.E2E_PROD_USER_EMAIL ?? '');
  const mailboxBase = normalizeEmail(env.E2E_PROD_SIGNUP_EMAIL_BASE ?? '');
  const principal = expected
    ? getActiveSyntheticPrincipal(email, expected.scenario)
    : null;
  if (!principal) issues.add('unapproved_synthetic_principal');
  if (
    !z.string().email().safeParse(email).success ||
    !z.string().email().safeParse(mailboxBase).success ||
    !isControlledSyntheticMailbox(email, mailboxBase)
  ) {
    issues.add('uncontrolled_synthetic_mailbox');
  }
  if (
    [env.E2E_TEST_MODE, env.E2E_USE_TEST_AUTH_BYPASS].some(value =>
      ['1', 'true'].includes(value?.trim().toLowerCase() ?? '')
    )
  ) {
    issues.add('test_auth_bypass_enabled');
  }
  const key = env.STRIPE_SECRET_KEY ?? '';
  const stripeMode = /^(sk|rk)_test_\S+$/.test(key)
    ? 'test'
    : /^(sk|rk)_live_\S+$/.test(key)
      ? 'live'
      : 'unavailable';
  if (stripeMode !== 'test') issues.add('stripe_test_key_required');
  const publicKey = env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (publicKey && !/^pk_test_\S+$/.test(publicKey)) {
    issues.add('stripe_test_public_key_required');
  }
  if (expected?.scenario === 'checkout_test') {
    if (
      !/^price_[A-Za-z0-9]+$/.test(
        env.STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY ?? ''
      )
    ) {
      issues.add('canonical_test_price_required');
    }
    if (!/^whsec_\S+$/.test(env.STRIPE_WEBHOOK_SECRET ?? '')) {
      issues.add('webhook_secret_required');
    }
  }
  return {
    schema: 'jovie.synthetic-cohort-preflight/v1',
    phase: 'configuration_only',
    status: issues.size
      ? 'infrastructure_unavailable'
      : 'configuration_validated',
    configurationReady: issues.size === 0,
    acceptanceReady: false,
    issues: [...issues],
    missing,
    actorId: principal?.actorId ?? null,
    stripeMode,
    runtimeProofsRequired: [
      ...RUNTIME_PROOFS,
      ...(!expected || expected.scenario === 'checkout_test'
        ? ['signed_test_webhook_and_endpoint_entitlement']
        : []),
    ],
  } as const;
}
