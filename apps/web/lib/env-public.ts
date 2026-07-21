function getRuntimeHtmlDatasetValue(
  key: 'clerkMock' | 'clerkProxyDisabled' | 'e2eMode'
): string | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }

  return document.documentElement.dataset[key] || undefined;
}

/**
 * Normalize a public URL env value into an absolute origin URL.
 *
 * Off-Vercel builds (e.g. `vercel build` in CI) may expose host-only values
 * like `staging.jov.ie` — or miss NEXT_PUBLIC_* vars entirely — and a bare
 * `new URL(raw)` then throws during page-data collection (e.g. /_not-found),
 * aborting the whole build. This helper never throws: host-only values get an
 * `https://` prefix and anything unparseable falls back.
 */
export function absolutePublicUrl(
  raw: string | undefined,
  fallback = 'https://jov.ie'
): string {
  const value = raw?.trim();
  if (!value) {
    return fallback;
  }
  const withProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)
    ? value
    : `https://${value}`;
  try {
    return new URL(withProtocol).origin;
  } catch {
    return fallback;
  }
}

/**
 * Public environment variables with lazy access.
 *
 * Uses getters to read environment variables at access time rather than
 * module load time. This fixes intermittent "Missing publishableKey" errors
 * on Vercel serverless cold starts where modules may be cached before
 * environment variables are fully initialized.
 */
export const publicEnv = {
  // Better Auth: Google One Tap client id (also gates One Tap rendering)
  get NEXT_PUBLIC_GOOGLE_CLIENT_ID() {
    return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || undefined;
  },
  // Better Auth: public base URL for the auth server
  get NEXT_PUBLIC_BETTER_AUTH_URL() {
    return process.env.NEXT_PUBLIC_BETTER_AUTH_URL || undefined;
  },
  get NEXT_PUBLIC_CLERK_FRONTEND_API() {
    return process.env.NEXT_PUBLIC_CLERK_FRONTEND_API || undefined;
  },
  get NEXT_PUBLIC_CLERK_MOCK() {
    return (
      process.env.NEXT_PUBLIC_CLERK_MOCK ||
      getRuntimeHtmlDatasetValue('clerkMock')
    );
  },
  get NEXT_PUBLIC_CLERK_PROXY_URL() {
    return process.env.NEXT_PUBLIC_CLERK_PROXY_URL || undefined;
  },
  get NEXT_PUBLIC_CLERK_PROXY_DISABLED() {
    return (
      process.env.NEXT_PUBLIC_CLERK_PROXY_DISABLED ||
      getRuntimeHtmlDatasetValue('clerkProxyDisabled')
    );
  },
  get NEXT_PUBLIC_APP_URL() {
    // Single domain architecture: app routes are at jov.ie/app/*
    return absolutePublicUrl(process.env.NEXT_PUBLIC_APP_URL);
  },
  get NEXT_PUBLIC_PROFILE_URL() {
    return absolutePublicUrl(process.env.NEXT_PUBLIC_PROFILE_URL);
  },
  get NEXT_PUBLIC_PROFILE_HOSTNAME() {
    return process.env.NEXT_PUBLIC_PROFILE_HOSTNAME || 'jov.ie';
  },
  get NEXT_PUBLIC_APP_HOSTNAME() {
    // Kept for backwards compatibility - now same as profile hostname
    return process.env.NEXT_PUBLIC_APP_HOSTNAME || 'jov.ie';
  },
  get NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN() {
    return process.env.NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN || 'jov.ie';
  },
  get NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY() {
    return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || undefined;
  },
  // Cloudflare Turnstile site key for onboarding chat bot challenge (JOV-2132)
  get NEXT_PUBLIC_TURNSTILE_SITE_KEY() {
    return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined;
  },
  // Feature flags
  get NEXT_PUBLIC_FEATURE_TIPS() {
    return process.env.NEXT_PUBLIC_FEATURE_TIPS ?? 'true';
  },
  get NEXT_PUBLIC_SHOW_OPERATOR_BANNER() {
    return process.env.NEXT_PUBLIC_SHOW_OPERATOR_BANNER || undefined;
  },
  get NEXT_PUBLIC_FEATURE_VOICE_INPUT() {
    return process.env.NEXT_PUBLIC_FEATURE_VOICE_INPUT ?? 'true';
  },
  get NEXT_PUBLIC_FEATURE_GROWTH_PLAN() {
    return process.env.NEXT_PUBLIC_FEATURE_GROWTH_PLAN ?? 'true';
  },
  get NEXT_PUBLIC_FEATURE_MAX_PLAN() {
    return process.env.NEXT_PUBLIC_FEATURE_MAX_PLAN ?? 'true';
  },
  get NEXT_PUBLIC_E2E_MODE() {
    return (
      process.env.NEXT_PUBLIC_E2E_MODE || getRuntimeHtmlDatasetValue('e2eMode')
    );
  },
  get NEXT_PUBLIC_DEMO_RECORDING() {
    return process.env.NEXT_PUBLIC_DEMO_RECORDING || undefined;
  },
  get NEXT_PUBLIC_FEATURE_SEE_IT_IN_ACTION() {
    return process.env.NEXT_PUBLIC_FEATURE_SEE_IT_IN_ACTION ?? 'true';
  },
  // SEO verification
  get NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION() {
    return process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined;
  },
  get NEXT_PUBLIC_BING_SITE_VERIFICATION() {
    return process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION || undefined;
  },
  get NEXT_PUBLIC_YANDEX_SITE_VERIFICATION() {
    return process.env.NEXT_PUBLIC_YANDEX_SITE_VERIFICATION || undefined;
  },
  get NEXT_PUBLIC_PINTEREST_VERIFICATION() {
    return process.env.NEXT_PUBLIC_PINTEREST_VERIFICATION || undefined;
  },
  // Sentry client-side
  get NEXT_PUBLIC_SENTRY_DSN() {
    return process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;
  },
  get NEXT_PUBLIC_SENTRY_DSN_DEV() {
    return process.env.NEXT_PUBLIC_SENTRY_DSN_DEV || undefined;
  },
  get NEXT_PUBLIC_SENTRY_CSP_REPORT_URI() {
    return process.env.NEXT_PUBLIC_SENTRY_CSP_REPORT_URI || undefined;
  },
  // Instantly.ai / Leadsy tracking pixel
  get NEXT_PUBLIC_INSTANTLY_PIXEL_ID() {
    return process.env.NEXT_PUBLIC_INSTANTLY_PIXEL_ID || undefined;
  },
  // Google Analytics 4 measurement ID (gtag.js)
  get NEXT_PUBLIC_GA_MEASUREMENT_ID() {
    return process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || undefined;
  },
} as const;
