import 'server-only';
import type { z } from 'zod';
import { publicEnv } from '@/lib/env-public';
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
  if (vercelEnv !== 'production' && vercelEnv !== 'preview') {
    return null;
  }

  const secret = server.BETTER_AUTH_SECRET;
  if (!secret) {
    if (isLikelyVercelColdStart()) {
      return {
        type: 'warning',
        message:
          'BETTER_AUTH_SECRET is missing (may be cold start timing issue)',
      };
    }
    return {
      type: 'critical',
      message: 'BETTER_AUTH_SECRET is required for authentication',
    };
  }

  if (secret.length < 32) {
    return {
      type: 'critical',
      message: 'BETTER_AUTH_SECRET must be at least 32 characters',
    };
  }
  return null;
};

/**
 * Expected non-secret host allowlists for Better Auth base URLs.
 * Server base URL must match the deployed origin and never cross envs.
 * Does not log or include secret values.
 */
const BETTER_AUTH_URL_HOSTS = {
  production: new Set(['jov.ie', 'www.jov.ie']),
  staging: new Set(['staging.jov.ie']),
  local: new Set(['localhost', '127.0.0.1', '[::1]']),
} as const;

function parseUrlHostname(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function resolveBetterAuthUrlEnv(
  vercelEnv: string
): 'production' | 'staging' | 'local' | 'preview' {
  if (vercelEnv === 'production') return 'production';
  if (vercelEnv === 'preview') {
    // Staging alias deploys use preview on Vercel but host staging.jov.ie.
    const publicUrl = publicEnv.NEXT_PUBLIC_APP_URL;
    const host = parseUrlHostname(publicUrl);
    if (host && BETTER_AUTH_URL_HOSTS.staging.has(host)) return 'staging';
    return 'preview';
  }
  return 'local';
}

function isAllowedBetterAuthHost(
  hostname: string,
  envKind: 'production' | 'staging' | 'local' | 'preview'
): boolean {
  if (envKind === 'production') {
    return BETTER_AUTH_URL_HOSTS.production.has(hostname);
  }
  if (envKind === 'staging') {
    return BETTER_AUTH_URL_HOSTS.staging.has(hostname);
  }
  if (envKind === 'local') {
    return (
      BETTER_AUTH_URL_HOSTS.local.has(hostname) ||
      hostname.endsWith('.localhost')
    );
  }
  // Preview deployments: allow the exact Vercel deployment host only.
  const vercelUrl = process.env.VERCEL_URL?.toLowerCase();
  if (vercelUrl && hostname === vercelUrl) return true;
  return hostname.endsWith('.vercel.app');
}

/**
 * Validation rule: BETTER_AUTH_URL / NEXT_PUBLIC_BETTER_AUTH_URL must match
 * the environment origin and must not cross local/staging/production.
 */
const checkBetterAuthUrlOrigin: ValidationRule = ({ server, vercelEnv }) => {
  const envKind = resolveBetterAuthUrlEnv(vercelEnv);
  const candidates: Array<{ label: string; value: string | undefined }> = [
    { label: 'BETTER_AUTH_URL', value: server.BETTER_AUTH_URL },
    {
      label: 'NEXT_PUBLIC_BETTER_AUTH_URL',
      value: publicEnv.NEXT_PUBLIC_BETTER_AUTH_URL,
    },
  ];

  for (const { label, value } of candidates) {
    if (!value?.trim()) {
      // Optional in local/dev; production/preview secret check is separate.
      // Public URL is optional when same-origin client derives base from window.
      continue;
    }

    const hostname = parseUrlHostname(value);
    if (!hostname) {
      return {
        type: 'critical',
        message: `${label} is not a valid URL`,
      };
    }

    // Cross-environment hard fails (never print the full URL with secrets).
    const isProdHost = BETTER_AUTH_URL_HOSTS.production.has(hostname);
    const isStagingHost = BETTER_AUTH_URL_HOSTS.staging.has(hostname);
    const isLocalHost =
      BETTER_AUTH_URL_HOSTS.local.has(hostname) ||
      hostname.endsWith('.localhost');

    if (envKind === 'production' && (isStagingHost || isLocalHost)) {
      return {
        type: 'critical',
        message: `${label} host must be production (jov.ie), not ${hostname}`,
      };
    }
    if (envKind === 'staging' && (isProdHost || isLocalHost)) {
      return {
        type: 'critical',
        message: `${label} host must be staging (staging.jov.ie), not ${hostname}`,
      };
    }
    if (envKind === 'local' && (isProdHost || isStagingHost)) {
      return {
        type: 'critical',
        message: `${label} host must be local, not ${hostname}`,
      };
    }

    if (!isAllowedBetterAuthHost(hostname, envKind)) {
      return {
        type: 'critical',
        message: `${label} host ${hostname} is not allowed for this environment`,
      };
    }
  }

  // When both are set, they must resolve to the same origin host.
  const serverHost = parseUrlHostname(server.BETTER_AUTH_URL);
  const publicHost = parseUrlHostname(publicEnv.NEXT_PUBLIC_BETTER_AUTH_URL);
  if (serverHost && publicHost && serverHost !== publicHost) {
    return {
      type: 'critical',
      message:
        'BETTER_AUTH_URL and NEXT_PUBLIC_BETTER_AUTH_URL hosts must match',
    };
  }

  return null;
};

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
const checkStripeSecretFormat: ValidationRule = ({ server }) => {
  if (server.STRIPE_SECRET_KEY && !server.STRIPE_SECRET_KEY.startsWith('sk_')) {
    return {
      type: 'error',
      message: 'STRIPE_SECRET_KEY should start with sk_',
    };
  }
  return null;
};

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
const checkUrlEncryptionKey: ValidationRule = ({ server, vercelEnv }) => {
  if (vercelEnv === 'production' || vercelEnv === 'preview') {
    if (!server.URL_ENCRYPTION_KEY) {
      return {
        type: 'critical',
        message:
          'URL_ENCRYPTION_KEY is required in production/preview for secure link wrapping. Generate with: openssl rand -base64 32',
      };
    }
    if (
      server.URL_ENCRYPTION_KEY === 'default-key-change-in-production-32-chars'
    ) {
      return {
        type: 'critical',
        message:
          'URL_ENCRYPTION_KEY is using the default value. Generate a secure key with: openssl rand -base64 32',
      };
    }
  }
  return null;
};

/**
 * Validation rule: Check AI Gateway API key in production/preview.
 */
const checkAiGatewayApiKey: ValidationRule = ({ server, vercelEnv }) => {
  if (
    (vercelEnv === 'production' || vercelEnv === 'preview') &&
    !server.AI_GATEWAY_API_KEY
  ) {
    return {
      type: 'critical',
      message:
        'AI_GATEWAY_API_KEY is required in production/preview for chat completions',
    };
  }

  return null;
};

/**
 * Validation rule: Warn when XAI_API_KEY is missing in production/preview.
 *
 * xAI powers album-art generation, which gracefully degrades when the key is
 * absent. Warning (not critical) so the app still boots, but loud enough at
 * startup that an operator notices the missing capability.
 */
const checkXaiApiKey: ValidationRule = ({ server, vercelEnv }) => {
  if (
    (vercelEnv === 'production' || vercelEnv === 'preview') &&
    !server.XAI_API_KEY?.trim()
  ) {
    return {
      type: 'warning',
      message:
        'XAI_API_KEY is missing — album art generation will be disabled until configured',
    };
  }
  return null;
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
  checkAiGatewayApiKey,
  checkXaiApiKey,
];

/** Exported for focused unit tests (no secret material). */
export const __test__ = {
  checkBetterAuthUrlOrigin,
  parseUrlHostname,
  resolveBetterAuthUrlEnv,
  isAllowedBetterAuthHost,
};
