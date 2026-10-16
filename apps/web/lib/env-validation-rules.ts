import 'server-only';
import type { z } from 'zod';
import { isAiGatewayAvailable } from '@/lib/ai/gateway-availability';
import {
  checkBetterAuthUrlOriginPolicy,
  isAllowedBetterAuthHost as isAllowedAuthHost,
  parseUrlHostname,
  resolveBetterAuthUrlEnv as resolveAuthUrlEnv,
} from '@/lib/auth/url-origin-policy';
import { publicEnv } from '@/lib/env-public';
import {
  checkBetterAuthSecretPolicy,
  checkStripeSecretFormatPolicy,
  checkUrlEncryptionKeyPolicy,
} from './env-configuration-policy';
import type { ServerEnvSchema } from './env-server-schema';

/**
 * Environment validation rule result
 */
export interface ValidationIssue {
  type: 'error' | 'warning' | 'critical';
  message: string;
}

/**
 * Environment validation rule
 */
export type ValidationRule = (env: {
  server: Record<keyof z.infer<typeof ServerEnvSchema>, string | undefined>;
  vercelEnv: string;
}) => ValidationIssue | null;

// Cold start detection threshold (seconds)
const COLD_START_UPTIME_THRESHOLD = 5;

/**
 * Detect if we're in a Vercel cold start scenario.
 *
 * Indicators:
 * - Running in production/preview (VERCEL_ENV set)
 * - Early in process lifetime (uptime < 5s)
 *
 * Heuristic-based detection.
 */
function isLikelyVercelColdStart(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  if (!vercelEnv || vercelEnv === 'development') {
    return false; // Not on Vercel production/preview
  }

  // Check process uptime (Node.js only)
  if (typeof process !== 'undefined' && 'uptime' in process) {
    const uptimeSeconds = (process as { uptime: () => number }).uptime();
    return uptimeSeconds < COLD_START_UPTIME_THRESHOLD;
  }

  return false;
}

/**
 * Validation rule: Better Auth secret must exist in production/preview.
 * Local/dev falls back to a non-production secret (see better-auth.ts).
 */
const checkBetterAuthSecret: ValidationRule = ({ server, vercelEnv }) => {
  const issue = checkBetterAuthSecretPolicy({
    secret: server.BETTER_AUTH_SECRET,
    vercelEnv,
  });
  if (issue && !server.BETTER_AUTH_SECRET && isLikelyVercelColdStart()) {
    return {
      type: 'warning',
      message: 'BETTER_AUTH_SECRET is missing (may be cold start timing issue)',
    };
  }
  return issue;
};

/**
 * Expected non-secret host allowlists for Better Auth base URLs.
 * Server base URL must match the deployed origin and never cross envs.
 * Does not log or include secret values.
 */
function resolveBetterAuthUrlEnv(vercelEnv: string) {
  return resolveAuthUrlEnv(vercelEnv, publicEnv.NEXT_PUBLIC_APP_URL);
}

function isAllowedBetterAuthHost(
  hostname: string,
  envKind: 'production' | 'staging' | 'local' | 'preview'
) {
  return isAllowedAuthHost(hostname, envKind, [
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
  ]);
}

const checkBetterAuthUrlOrigin: ValidationRule = ({ server, vercelEnv }) =>
  checkBetterAuthUrlOriginPolicy({
    betterAuthUrl: server.BETTER_AUTH_URL,
    publicBetterAuthUrl: publicEnv.NEXT_PUBLIC_BETTER_AUTH_URL,
    publicAppUrl: publicEnv.NEXT_PUBLIC_APP_URL,
    vercelEnv,
    vercelUrl: process.env.VERCEL_URL,
    vercelBranchUrl: process.env.VERCEL_BRANCH_URL,
  });

/**
 * Validation rule: Check database URL exists
 */
const checkDatabaseUrl: ValidationRule = ({ server }) => {
  if (!server.DATABASE_URL) {
    return {
      type: 'critical',
      message: 'DATABASE_URL is required for database operations',
    };
  }
  return null;
};

/**
 * Validation rule: Check Stripe secret key format
 */
const checkStripeSecretFormat: ValidationRule = ({ server }) =>
  checkStripeSecretFormatPolicy(server.STRIPE_SECRET_KEY);

/**
 * Validation rule: Check Stripe publishable key format
 */
const checkStripePublishableFormat: ValidationRule = () => {
  if (
    publicEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY &&
    !publicEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.startsWith('pk_')
  ) {
    return {
      type: 'error',
      message: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY should start with pk_',
    };
  }
  return null;
};

/**
 * Validation rule: Check for Stripe key pair consistency
 */
const checkStripePairConsistency: ValidationRule = ({ server }) => {
  const hasStripePublic = !!publicEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const hasStripeSecret = !!server.STRIPE_SECRET_KEY;

  if (hasStripePublic && !hasStripeSecret) {
    return {
      type: 'warning',
      message:
        'STRIPE_SECRET_KEY is missing but NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is set',
    };
  }
  if (hasStripeSecret && !hasStripePublic) {
    return {
      type: 'warning',
      message:
        'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing but STRIPE_SECRET_KEY is set',
    };
  }
  return null;
};

/**
 * Validation rule: Check URL encryption key in production/preview
 */
const checkUrlEncryptionKey: ValidationRule = ({ server, vercelEnv }) =>
  checkUrlEncryptionKeyPolicy({ key: server.URL_ENCRYPTION_KEY, vercelEnv });

/**
 * Validation rule: Warn when album art cannot authenticate to the AI Gateway.
 *
 * On Vercel, OIDC covers Gateway auth, so a missing AI_GATEWAY_API_KEY is not
 * a failure. Off Vercel, production/preview need the static key. Warning (not
 * critical) so the app still boots, but loud enough that an operator notices
 * the missing capability.
 */
const checkAlbumArtGateway: ValidationRule = ({ server, vercelEnv }) => {
  if (vercelEnv !== 'production' && vercelEnv !== 'preview') {
    return null;
  }
  if (isAiGatewayAvailable({ apiKey: server.AI_GATEWAY_API_KEY })) {
    return null;
  }
  return {
    type: 'warning',
    message:
      'AI Gateway is unavailable — album art generation will be disabled until configured',
  };
};

/**
 * Runtime validation rules (checked in runtime context)
 */
export const RUNTIME_VALIDATION_RULES: ValidationRule[] = [
  checkBetterAuthSecret,
  checkBetterAuthUrlOrigin,
  checkDatabaseUrl,
  checkStripeSecretFormat,
  checkStripePublishableFormat,
  checkStripePairConsistency,
  checkUrlEncryptionKey,
  // Album art warns only when Gateway auth is missing. On Vercel, OIDC is
  // injected at runtime and satisfies this check without AI_GATEWAY_API_KEY.
  checkAlbumArtGateway,
];

/** Exported for focused unit tests (no secret material). */
export const __test__ = {
  checkBetterAuthUrlOrigin,
  parseUrlHostname,
  resolveBetterAuthUrlEnv,
  isAllowedBetterAuthHost,
};
