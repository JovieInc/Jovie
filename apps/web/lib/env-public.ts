/**
 * Public environment variables with lazy access.
 *
 * Uses getters to read environment variables at access time rather than
 * module load time. This fixes intermittent "Missing publishableKey" errors
 * on Vercel serverless cold starts where modules may be cached before
 * environment variables are fully initialized.
 */
export const publicEnv = {
  get NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY() {
    return process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || undefined;
  },
  get NEXT_PUBLIC_CLERK_FRONTEND_API() {
    return process.env.NEXT_PUBLIC_CLERK_FRONTEND_API || undefined;
  },
  get NEXT_PUBLIC_APP_URL() {
    return process.env.NEXT_PUBLIC_APP_URL || 'https://app.jov.ie';
  },
  get NEXT_PUBLIC_PROFILE_URL() {
    return process.env.NEXT_PUBLIC_PROFILE_URL || 'https://jov.ie';
  },
  get NEXT_PUBLIC_PROFILE_HOSTNAME() {
    return process.env.NEXT_PUBLIC_PROFILE_HOSTNAME || 'jov.ie';
  },
  get NEXT_PUBLIC_APP_HOSTNAME() {
    return process.env.NEXT_PUBLIC_APP_HOSTNAME || 'app.jov.ie';
  },
  get NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN() {
    return process.env.NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN || 'jov.ie';
  },
  get NEXT_PUBLIC_STATSIG_CLIENT_KEY() {
    return process.env.NEXT_PUBLIC_STATSIG_CLIENT_KEY || undefined;
  },
  get NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY() {
    return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || undefined;
  },
  get NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME() {
    return process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || undefined;
  },
} as const;
