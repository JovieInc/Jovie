import { z } from 'zod';

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default('https://jov.ie'),
  NEXT_PUBLIC_STATSIG_CLIENT_KEY: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().optional(),
});

const rawPublicEnv = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? 'https://jov.ie',
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
  console.warn(
    '[env-public] Validation issues:',
    parsed.error.flatten().fieldErrors
  );
}

export const publicEnv = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: parsed.success
    ? parsed.data.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    : process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  NEXT_PUBLIC_APP_URL: parsed.success
    ? parsed.data.NEXT_PUBLIC_APP_URL
    : (process.env.NEXT_PUBLIC_APP_URL ?? 'https://jov.ie'),
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
