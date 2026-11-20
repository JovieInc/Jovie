import { z } from 'zod';

/** Pure canonical field constraints shared by runtime validation and cohort preflight. */
export const sessionSecretSchema = z.string().min(32);

const HOST_WITH_OPTIONAL_PORT_REGEX =
  /^(?!https?:\/\/)(?!.*\/)[a-z0-9.-]+(?::\d+)?$/i;

export function isHostWithOptionalPort(value: string): boolean {
  return HOST_WITH_OPTIONAL_PORT_REGEX.test(value.trim());
}

export function checkBetterAuthSecretPolicy({
  secret,
  vercelEnv,
}: {
  secret: string | undefined;
  vercelEnv: string;
}): { type: 'critical'; message: string } | null {
  if (vercelEnv !== 'production' && vercelEnv !== 'preview') {
    return null;
  }

  if (!secret) {
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
}

export function checkStripeSecretFormatPolicy(
  key: string | undefined
): { type: 'error'; message: string } | null {
  if (key && !key.startsWith('sk_')) {
    return {
      type: 'error',
      message: 'STRIPE_SECRET_KEY should start with sk_',
    };
  }
  return null;
}

export function checkUrlEncryptionKeyPolicy({
  key,
  vercelEnv,
}: {
  key: string | undefined;
  vercelEnv: string;
}): { type: 'critical'; message: string } | null {
  if (vercelEnv === 'production' || vercelEnv === 'preview') {
    if (!key) {
      return {
        type: 'critical',
        message:
          'URL_ENCRYPTION_KEY is required in production/preview for secure link wrapping. Generate with: openssl rand -base64 32',
      };
    }
    if (key === 'default-key-change-in-production-32-chars') {
      return {
        type: 'critical',
        message:
          'URL_ENCRYPTION_KEY is using the default value. Generate a secure key with: openssl rand -base64 32',
      };
    }
  }
  return null;
}

export function checkPIIEncryptionKeyPolicy({
  key,
  vercelEnv,
}: {
  key: string | undefined;
  vercelEnv: string;
}): { type: 'warning'; message: string } | null {
  if (vercelEnv !== 'production' && vercelEnv !== 'preview') {
    return null;
  }
  if (!key) {
    return {
      type: 'warning',
      message:
        'PII_ENCRYPTION_KEY is missing — encryptPII/decryptPII throw on the first PII write/read (email, phone, IP, tokens). Generate with: openssl rand -base64 32 and provision it in the production secret store (Doppler jovie-web/prd). JOV-9038.',
    };
  }
  return null;
}
