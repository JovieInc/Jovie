import { z } from 'zod';

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_CLERK_FRONTEND_API: z.string().url().optional(),
  // Domain configuration - unified jov.ie domain architecture
  NEXT_PUBLIC_APP_URL: z.string().url().default('https://app.jov.ie'),
  NEXT_PUBLIC_PROFILE_URL: z.string().url().default('https://jov.ie'),
  NEXT_PUBLIC_MARKETING_URL: z.string().url().default('https://jov.ie'),
  NEXT_PUBLIC_PROFILE_HOSTNAME: z.string().default('jov.ie'),
  NEXT_PUBLIC_MARKETING_HOSTNAME: z.string().default('jov.ie'),
  NEXT_PUBLIC_APP_HOSTNAME: z.string().default('app.jov.ie'),
  NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN: z.string().default('jov.ie'),
  NEXT_PUBLIC_STATSIG_CLIENT_KEY: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().optional(),
});

const rawPublicEnv = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || undefined,
  NEXT_PUBLIC_CLERK_FRONTEND_API:
    process.env.NEXT_PUBLIC_CLERK_FRONTEND_API || undefined,
  // Domain configuration - unified jov.ie domain architecture
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'https://app.jov.ie',
  NEXT_PUBLIC_PROFILE_URL:
    process.env.NEXT_PUBLIC_PROFILE_URL || 'https://jov.ie',
  NEXT_PUBLIC_MARKETING_URL:
    process.env.NEXT_PUBLIC_MARKETING_URL || 'https://jov.ie',
  NEXT_PUBLIC_PROFILE_HOSTNAME:
    process.env.NEXT_PUBLIC_PROFILE_HOSTNAME || 'jov.ie',
  NEXT_PUBLIC_MARKETING_HOSTNAME:
    process.env.NEXT_PUBLIC_MARKETING_HOSTNAME || 'jov.ie',
  NEXT_PUBLIC_APP_HOSTNAME:
    process.env.NEXT_PUBLIC_APP_HOSTNAME || 'app.jov.ie',
  NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN:
    process.env.NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN || 'jov.ie',
  NEXT_PUBLIC_STATSIG_CLIENT_KEY:
    process.env.NEXT_PUBLIC_STATSIG_CLIENT_KEY || undefined,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || undefined,
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME:
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || undefined,
};

const parsed = PublicEnvSchema.safeParse(rawPublicEnv);

if (!parsed.success && process.env.NODE_ENV === 'development') {
  // Log zod issues once in dev to aid setup
  // Do not throw to avoid blocking the entire app
  // This mirrors the behaviour in lib/env.ts but for public-only vars
  console.warn(
    '[env-public] Validation issues:',
    parsed.error.flatten().fieldErrors
  );
}

export const publicEnv = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: parsed.success
    ? parsed.data.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    : process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || undefined,
  NEXT_PUBLIC_CLERK_FRONTEND_API: parsed.success
    ? parsed.data.NEXT_PUBLIC_CLERK_FRONTEND_API
    : process.env.NEXT_PUBLIC_CLERK_FRONTEND_API || undefined,
  // Domain configuration - unified jov.ie domain architecture
  NEXT_PUBLIC_APP_URL: parsed.success
    ? parsed.data.NEXT_PUBLIC_APP_URL
    : process.env.NEXT_PUBLIC_APP_URL || 'https://app.jov.ie',
  NEXT_PUBLIC_PROFILE_URL: parsed.success
    ? parsed.data.NEXT_PUBLIC_PROFILE_URL
    : process.env.NEXT_PUBLIC_PROFILE_URL || 'https://jov.ie',
  NEXT_PUBLIC_MARKETING_URL: parsed.success
    ? parsed.data.NEXT_PUBLIC_MARKETING_URL
    : process.env.NEXT_PUBLIC_MARKETING_URL || 'https://jov.ie',
  NEXT_PUBLIC_PROFILE_HOSTNAME: parsed.success
    ? parsed.data.NEXT_PUBLIC_PROFILE_HOSTNAME
    : process.env.NEXT_PUBLIC_PROFILE_HOSTNAME || 'jov.ie',
  NEXT_PUBLIC_MARKETING_HOSTNAME: parsed.success
    ? parsed.data.NEXT_PUBLIC_MARKETING_HOSTNAME
    : process.env.NEXT_PUBLIC_MARKETING_HOSTNAME || 'jov.ie',
  NEXT_PUBLIC_APP_HOSTNAME: parsed.success
    ? parsed.data.NEXT_PUBLIC_APP_HOSTNAME
    : process.env.NEXT_PUBLIC_APP_HOSTNAME || 'app.jov.ie',
  NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN: parsed.success
    ? parsed.data.NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN
    : process.env.NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN || 'jov.ie',
  NEXT_PUBLIC_STATSIG_CLIENT_KEY: parsed.success
    ? parsed.data.NEXT_PUBLIC_STATSIG_CLIENT_KEY
    : process.env.NEXT_PUBLIC_STATSIG_CLIENT_KEY || undefined,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: parsed.success
    ? parsed.data.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    : process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || undefined,
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: parsed.success
    ? parsed.data.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
    : process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || undefined,
} as const;
