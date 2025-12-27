import { z } from 'zod';
import { createScopedLogger } from '@/lib/utils/logger';

const log = createScopedLogger('EnvPublic');

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_CLERK_FRONTEND_API: z.string().url().optional(),
  // Domain configuration - defaults support multi-domain setup
  NEXT_PUBLIC_APP_URL: z.string().url().default('https://app.meetjovie.com'),
  NEXT_PUBLIC_PROFILE_URL: z.string().url().default('https://jov.ie'),
  NEXT_PUBLIC_MARKETING_URL: z.string().url().default('https://meetjovie.com'),
  NEXT_PUBLIC_PROFILE_HOSTNAME: z.string().default('jov.ie'),
  NEXT_PUBLIC_MARKETING_HOSTNAME: z.string().default('meetjovie.com'),
  NEXT_PUBLIC_APP_HOSTNAME: z.string().default('app.meetjovie.com'),
  NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN: z.string().default('meetjovie.com'),
  NEXT_PUBLIC_STATSIG_CLIENT_KEY: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().optional(),
});

const rawPublicEnv = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  NEXT_PUBLIC_CLERK_FRONTEND_API: process.env.NEXT_PUBLIC_CLERK_FRONTEND_API,
  // Domain configuration
  NEXT_PUBLIC_APP_URL:
    process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.meetjovie.com',
  NEXT_PUBLIC_PROFILE_URL:
    process.env.NEXT_PUBLIC_PROFILE_URL ?? 'https://jov.ie',
  NEXT_PUBLIC_MARKETING_URL:
    process.env.NEXT_PUBLIC_MARKETING_URL ?? 'https://meetjovie.com',
  NEXT_PUBLIC_PROFILE_HOSTNAME:
    process.env.NEXT_PUBLIC_PROFILE_HOSTNAME ?? 'jov.ie',
  NEXT_PUBLIC_MARKETING_HOSTNAME:
    process.env.NEXT_PUBLIC_MARKETING_HOSTNAME ?? 'meetjovie.com',
  NEXT_PUBLIC_APP_HOSTNAME:
    process.env.NEXT_PUBLIC_APP_HOSTNAME ?? 'app.meetjovie.com',
  NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN:
    process.env.NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN ?? 'meetjovie.com',
  NEXT_PUBLIC_STATSIG_CLIENT_KEY: process.env.NEXT_PUBLIC_STATSIG_CLIENT_KEY,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME:
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
};

const parsed = PublicEnvSchema.safeParse(rawPublicEnv);

if (!parsed.success && process.env.NODE_ENV === 'development') {
  // Log zod issues once in dev to aid setup
  // Do not throw to avoid blocking the entire app
  // This mirrors the behaviour in lib/env.ts but for public-only vars
  log.warn('Validation issues', {
    fieldErrors: parsed.error.flatten().fieldErrors,
  });
}

export const publicEnv = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: parsed.success
    ? parsed.data.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    : process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  NEXT_PUBLIC_CLERK_FRONTEND_API: parsed.success
    ? parsed.data.NEXT_PUBLIC_CLERK_FRONTEND_API
    : process.env.NEXT_PUBLIC_CLERK_FRONTEND_API,
  // Domain configuration
  NEXT_PUBLIC_APP_URL: parsed.success
    ? parsed.data.NEXT_PUBLIC_APP_URL
    : (process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.meetjovie.com'),
  NEXT_PUBLIC_PROFILE_URL: parsed.success
    ? parsed.data.NEXT_PUBLIC_PROFILE_URL
    : (process.env.NEXT_PUBLIC_PROFILE_URL ?? 'https://jov.ie'),
  NEXT_PUBLIC_MARKETING_URL: parsed.success
    ? parsed.data.NEXT_PUBLIC_MARKETING_URL
    : (process.env.NEXT_PUBLIC_MARKETING_URL ?? 'https://meetjovie.com'),
  NEXT_PUBLIC_PROFILE_HOSTNAME: parsed.success
    ? parsed.data.NEXT_PUBLIC_PROFILE_HOSTNAME
    : (process.env.NEXT_PUBLIC_PROFILE_HOSTNAME ?? 'jov.ie'),
  NEXT_PUBLIC_MARKETING_HOSTNAME: parsed.success
    ? parsed.data.NEXT_PUBLIC_MARKETING_HOSTNAME
    : (process.env.NEXT_PUBLIC_MARKETING_HOSTNAME ?? 'meetjovie.com'),
  NEXT_PUBLIC_APP_HOSTNAME: parsed.success
    ? parsed.data.NEXT_PUBLIC_APP_HOSTNAME
    : (process.env.NEXT_PUBLIC_APP_HOSTNAME ?? 'app.meetjovie.com'),
  NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN: parsed.success
    ? parsed.data.NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN
    : (process.env.NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN ?? 'meetjovie.com'),
  NEXT_PUBLIC_STATSIG_CLIENT_KEY: parsed.success
    ? parsed.data.NEXT_PUBLIC_STATSIG_CLIENT_KEY
    : process.env.NEXT_PUBLIC_STATSIG_CLIENT_KEY,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: parsed.success
    ? parsed.data.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    : process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: parsed.success
    ? parsed.data.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
    : process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
} as const;
