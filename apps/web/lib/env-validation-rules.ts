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
 * Validation rule: Check Clerk publishable key exists
 */
const checkClerkPublishableKey: ValidationRule = () => {
  // Skip validation if in mock mode
  if (publicEnv.NEXT_PUBLIC_CLERK_MOCK === '1') {
    return null;
  }

  if (!publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    // During cold start, downgrade to warning instead of critical
    if (isLikelyVercelColdStart()) {
      return {
        type: 'warning',
        message:
          'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing (may be cold start timing issue)',
      };
    }

    // After cold start window, this is a real config error
    return {
      type: 'critical',
      message:
        'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required for authentication',
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
 * Validation rule: Check Clerk key format
 */
const checkClerkKeyFormat: ValidationRule = () => {
  if (
    publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    !publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.startsWith('pk_')
  ) {
    return {
      type: 'error',
      message: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY should start with pk_',
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
 * Validation rule: Check Cloudinary configuration completeness
 */
const checkCloudinaryConfig: ValidationRule = ({ server }) => {
  const cloudinaryKeys = [
    server.CLOUDINARY_API_KEY,
    server.CLOUDINARY_API_SECRET,
    publicEnv.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  ];
  const cloudinaryKeysPresent = cloudinaryKeys.filter(Boolean).length;

  if (cloudinaryKeysPresent > 0 && cloudinaryKeysPresent < 3) {
    return {
      type: 'warning',
      message:
        'Incomplete Cloudinary configuration - need all of API_KEY, API_SECRET, and CLOUD_NAME',
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
 * Runtime validation rules (checked in runtime context)
 */
export const RUNTIME_VALIDATION_RULES: ValidationRule[] = [
  checkClerkPublishableKey,
  checkDatabaseUrl,
  checkClerkKeyFormat,
  checkStripeSecretFormat,
  checkStripePublishableFormat,
  checkStripePairConsistency,
  checkCloudinaryConfig,
  checkUrlEncryptionKey,
];
