import 'server-only';
import { z } from 'zod';
import {
  getDatabaseUrlErrorMessage,
  isDatabaseUrlValid,
} from './utils/database-url-validator';

/**
 * Custom DATABASE_URL validator using shared validation logic
 */
const databaseUrlValidator = z.string().optional().refine(isDatabaseUrlValid, {
  message: getDatabaseUrlErrorMessage(),
});

const HOST_WITH_OPTIONAL_PORT_REGEX =
  /^(?!https?:\/\/)(?!.*\/)[a-z0-9.-]+(?::\d+)?$/i;

function isHostWithOptionalPort(value: string): boolean {
  return HOST_WITH_OPTIONAL_PORT_REGEX.test(value.trim());
}

function isTrustedHostList(value: string): boolean {
  return value.split(',').every(entry => {
    const trimmedEntry = entry.trim();
    return trimmedEntry.length > 0 && isHostWithOptionalPort(trimmedEntry);
  });
}

/**
 * Server-side environment variables schema
 */
export const ServerEnvSchema = z.object({
  // Runtime environment
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .optional()
    .default('development'),
  VITEST: z.string().optional(),
  VERCEL_ENV: z.enum(['development', 'preview', 'production']).optional(),
  VERCEL_URL: z
    .string()
    .trim()
    .refine(isHostWithOptionalPort, {
      message:
        'VERCEL_URL must be a hostname or hostname:port without a scheme or path',
    })
    .optional(),
  VERCEL_AUTOMATION_BYPASS_SECRET: z.string().optional(),

  // Clerk server-side configuration
  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_WEBHOOK_SECRET: z.string().optional(),
  CLERK_PUBLISHABLE_KEY_STAGING: z.string().optional(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),

  // Email / notifications
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  RESEND_REPLY_TO_EMAIL: z.string().email().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  RESEND_INBOUND_WEBHOOK_SECRET: z.string().optional(),

  // Slack notifications (admin alerts for claims, signups, upgrades, waitlist)
  SLACK_WEBHOOK_URL: z.string().url().optional(),

  // Database configuration (required at runtime, but optional during build)
  DATABASE_URL: databaseUrlValidator,

  // Server or build-time envs (may be undefined locally)
  SPOTIFY_CLIENT_ID: z.string().optional(),
  SPOTIFY_CLIENT_SECRET: z.string().optional(),
  JOVIE_SYSTEM_CLERK_USER_ID: z.string().optional(),
  APPLE_MUSIC_DEVELOPER_TOKEN: z.string().optional(),

  // Bandsintown configuration
  BANDSINTOWN_APP_ID: z.string().optional(),

  // Vercel Blob
  BLOB_READ_WRITE_TOKEN: z.string().optional(),

  // Stripe server-side configuration
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_CONNECT_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_WEBHOOK_SECRET_TIPS: z.string().optional(),
  TIP_PLATFORM_FEE_PERCENT: z.string().optional(),

  // Stripe price IDs for Pro tier (amounts in lib/config/plan-prices.ts)
  STRIPE_PRICE_PRO_MONTHLY: z.string().startsWith('price_').optional(),
  STRIPE_PRICE_PRO_ANNUAL: z.string().startsWith('price_').optional(),
  STRIPE_PRICE_PRO_YEARLY: z.string().startsWith('price_').optional(),

  // Stripe price IDs for Growth tier (legacy, kept for backward compat)
  STRIPE_PRICE_GROWTH_MONTHLY: z.string().startsWith('price_').optional(),
  STRIPE_PRICE_GROWTH_YEARLY: z.string().startsWith('price_').optional(),

  // Stripe price IDs for Max tier (amounts in lib/config/plan-prices.ts)
  STRIPE_PRICE_MAX_MONTHLY: z.string().startsWith('price_').optional(),
  STRIPE_PRICE_MAX_YEARLY: z.string().startsWith('price_').optional(),
  INGESTION_CRON_SECRET: z.string().optional(),

  // URL encryption (required in production/preview)
  LEAD_ATTRIBUTION_SECRET: z.string().optional(),
  URL_ENCRYPTION_KEY: z.string().optional(),

  // Cron job authentication
  CRON_SECRET: z.string().optional(),
  // Optional allowlist of additional hosts (comma-separated) whose
  // `x-forwarded-host` should be treated as trusted for cron routes.
  // Used for Jovie-owned preview aliases. Never trusts `*.vercel.app`.
  CRON_TRUSTED_HOSTS: z
    .string()
    .trim()
    .refine(isTrustedHostList, {
      message:
        'CRON_TRUSTED_HOSTS must be a comma-separated list of hostnames or hostname:port entries without schemes or paths',
    })
    .optional(),

  // Security keys
  METADATA_HASH_KEY: z.string().optional(),
  PII_ENCRYPTION_KEY: z.string().optional(),

  // HUD (internal kiosk display)
  HUD_KIOSK_TOKEN: z.string().optional(),
  HUD_STARTUP_NAME: z.string().optional(),
  HUD_STARTUP_LOGO_URL: z.string().url().optional(),
  HUD_GITHUB_TOKEN: z.string().optional(),
  HUD_GITHUB_OWNER: z.string().optional(),
  HUD_GITHUB_REPO: z.string().optional(),
  HUD_GITHUB_WORKFLOW: z.string().optional(),

  // Revalidation
  REVALIDATE_SECRET: z.string().optional(),

  // Apple Music DSP enrichment
  APPLE_MUSIC_KEY_ID: z.string().optional(),
  APPLE_MUSIC_TEAM_ID: z.string().optional(),
  APPLE_MUSIC_PRIVATE_KEY: z.string().optional(),

  // SoundCloud API v2 (Pro badge detection)
  SOUNDCLOUD_CLIENT_ID: z.string().optional(),

  // MusicFetch.io (cross-platform DSP profiles + social links via ISRC/UPC)
  MUSICFETCH_API_TOKEN: z.string().optional(),
  MUSICFETCH_DAILY_HARD_LIMIT: z.string().optional(),
  MUSICFETCH_MONTHLY_HARD_LIMIT: z.string().optional(),

  // Mercury (banking metrics)
  MERCURY_API_BASE_URL: z.string().url().optional(),
  MERCURY_API_TOKEN: z.string().optional(),
  MERCURY_API_KEY: z.string().optional(),
  MERCURY_CHECKING_ACCOUNT_ID: z.string().optional(),
  MERCURY_ACCOUNT_ID: z.string().optional(),

  // Upstash Redis
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Onboarding chat (anonymous session signing + bot challenge — JOV-2132)
  SESSION_SECRET: z.string().min(32).optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),

  // Analytics
  ANALYTICS_RETENTION_DAYS: z.string().optional(),
  TRACKING_TOKEN_SECRET: z.string().optional(),
  TRACKING_RATE_LIMIT_CLICKS_PER_HOUR: z.string().optional(),
  TRACKING_RATE_LIMIT_VISITS_PER_HOUR: z.string().optional(),

  // Admin impersonation
  ENABLE_IMPERSONATION: z.string().optional(),
  IMPERSONATION_SECRET: z.string().optional(),

  // Sentry server-side
  SENTRY_DSN: z.string().optional(),
  SENTRY_DSN_DEV: z.string().optional(),
  SENTRY_WEBHOOK_SECRET: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),
  SENTRY_ORG_SLUG: z.string().optional(),
  SENTRY_DEV_PROJECT: z.string().optional(),

  // Linear webhook automation
  LINEAR_WEBHOOK_SECRET: z.string().optional(),
  // Linear API key for HUD queries (tim-action-required issues)
  LINEAR_API_KEY: z.string().optional(),

  // GitHub dispatch (Sentry autofix pipeline)
  GH_DISPATCH_TOKEN: z.string().optional(),
  // Vercel-injected Git metadata (used to target the dispatch repo)
  VERCEL_GIT_REPO_OWNER: z.string().optional(),
  VERCEL_GIT_REPO_SLUG: z.string().optional(),

  // Statsig server-side (feature flags)
  STATSIG_SERVER_SECRET: z.string().optional(),

  // AI Gateway auth (required for chat completions)
  AI_GATEWAY_API_KEY: z.string().optional(),

  // Braintrust observability (LLM tracing + evals)
  BRAINTRUST_API_KEY: z.string().optional(),

  // AgentOS workflows are compile-ready but runtime-disabled by default.
  AGENT_OS_WORKFLOWS_ENABLED: z.enum(['true', 'false']).optional(),

  // xAI / Grok image generation
  XAI_API_KEY: z.string().optional(),
  ALBUM_ART_IMAGE_MODEL: z.string().optional(),
  ALBUM_ART_GENERATION_DAILY_LIMIT: z.string().optional(),
  ALBUM_ART_GENERATION_BURST_LIMIT: z.string().optional(),

  // Google OAuth + Connectors (AI Connector v1 — JOV-2230)
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  /** Base URL for the Google OAuth redirect URI, e.g. https://jov.ie/api/connectors/google */
  GOOGLE_OAUTH_REDIRECT_URI_BASE: z.string().url().optional(),
  /** Days before/after today to fetch Calendar events (default: 90 past, 365 future) */
  GOOGLE_CALENDAR_DEFAULT_WINDOW_DAYS: z.string().optional(),
  /** Days of Gmail history to scan for booking signals (default: 30) */
  GMAIL_HISTORY_WINDOW_DAYS: z.string().optional(),
  /** Per-user per-day Gateway token budget for AI Connector extraction (default: 100000) */
  AI_CONNECTORS_DAILY_TOKEN_BUDGET: z.string().optional(),

  // Development tools
  JOVIE_DEV_MEMORY_MONITOR: z.string().optional(),

  // Instantly (outreach email campaigns)
  INSTANTLY_API_KEY: z.string().optional(),
  INSTANTLY_CAMPAIGN_ID: z.string().optional(),

  // Search APIs (lead discovery)
  SERPAPI_API_KEY: z.string().optional(),
  GOOGLE_CSE_API_KEY: z.string().optional(),
  GOOGLE_CSE_ENGINE_ID: z.string().optional(),

  // Jovie Marketing Pixels (for retargeting Jovie visitors)
  JOVIE_FACEBOOK_PIXEL_ID: z.string().optional(),
  JOVIE_FACEBOOK_ACCESS_TOKEN: z.string().optional(),
  JOVIE_GOOGLE_MEASUREMENT_ID: z.string().optional(),
  JOVIE_GOOGLE_API_SECRET: z.string().optional(),
  JOVIE_TIKTOK_PIXEL_ID: z.string().optional(),
  JOVIE_TIKTOK_ACCESS_TOKEN: z.string().optional(),

  // E2E / Playwright auth helpers
  E2E_USE_TEST_AUTH_BYPASS: z.string().optional(),
  E2E_CLERK_USER_ID: z.string().optional(),
  E2E_CLERK_USER_USERNAME: z.string().optional(),
  E2E_PROD_SIGNUP_EMAIL_BASE: z.string().email().optional(),
  E2E_PROD_SIGNUP_PASSWORD: z.string().optional(),
  E2E_PROD_MAILBOX_PROVIDER: z
    .enum(['gmail', 'cloudflare-email-routing'])
    .optional(),
  E2E_PROD_MAILBOX_CLIENT_ID: z.string().optional(),
  E2E_PROD_MAILBOX_CLIENT_SECRET: z.string().optional(),
  E2E_PROD_MAILBOX_REFRESH_TOKEN: z.string().optional(),
  E2E_PROD_MAILBOX_QUERY_FROM: z.string().optional(),
  E2E_PROD_OTP_CHECK_URL: z.string().url().optional(),
  E2E_PROD_OTP_CHECK_TOKEN: z.string().optional(),
  DEMO_RECORDING: z.string().optional(),
  DEMO_CLERK_USER_ID: z.string().optional(),

  // SMS subscribe handoff (Twilio + intent codes; JOV-1834)
  SMS_INTENT_SECRET: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_AUTH_TOKEN_SECONDARY: z.string().optional(),
  TWILIO_AUTH_TOKEN_SECONDARY_EXPIRES_AT: z.string().optional(),
  TWILIO_MESSAGING_SERVICE_SID: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  /**
   * Master gate for the native SMS handoff CTA + intent API. When 'false'
   * (or unset), `POST /api/notifications/sms-intents` returns 503 and the
   * frontend hides the CTA. The webhook still processes STOP/HELP/STOPALL
   * regardless of this flag (TCPA mandate).
   */
  NATIVE_SMS_ENABLED: z.string().optional(),
  /**
   * Demo override that bypasses the existing SMS Pro-gating in
   * subscribeToNotificationsDomain when set to 'true'. Off by default;
   * intended for the YC demo window only. See autoplan decision row #32 / F7.
   */
  SMS_DEMO_BYPASS_PRO_GATE: z.string().optional(),
});

/**
 * List of environment variable keys to extract from process.env.
 * Single source of truth for server environment configuration.
 */
export const ENV_KEYS = [
  'NODE_ENV',
  'VITEST',
  'VERCEL_ENV',
  'VERCEL_URL',
  'VERCEL_AUTOMATION_BYPASS_SECRET',
  'CLERK_SECRET_KEY',
  'CLERK_WEBHOOK_SECRET',
  'CLERK_PUBLISHABLE_KEY_STAGING',
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'RESEND_REPLY_TO_EMAIL',
  'RESEND_WEBHOOK_SECRET',
  'RESEND_INBOUND_WEBHOOK_SECRET',
  'SLACK_WEBHOOK_URL',
  'DATABASE_URL',
  'SPOTIFY_CLIENT_ID',
  'SPOTIFY_CLIENT_SECRET',
  'JOVIE_SYSTEM_CLERK_USER_ID',
  'APPLE_MUSIC_DEVELOPER_TOKEN',
  'BANDSINTOWN_APP_ID',
  'BLOB_READ_WRITE_TOKEN',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_CONNECT_WEBHOOK_SECRET',
  'STRIPE_WEBHOOK_SECRET_TIPS',
  'TIP_PLATFORM_FEE_PERCENT',
  'STRIPE_PRICE_PRO_MONTHLY',
  'STRIPE_PRICE_PRO_ANNUAL',
  'STRIPE_PRICE_PRO_YEARLY',
  'STRIPE_PRICE_GROWTH_MONTHLY',
  'STRIPE_PRICE_GROWTH_YEARLY',
  'STRIPE_PRICE_MAX_MONTHLY',
  'STRIPE_PRICE_MAX_YEARLY',
  'INGESTION_CRON_SECRET',
  'LEAD_ATTRIBUTION_SECRET',
  'URL_ENCRYPTION_KEY',
  'CRON_SECRET',
  'CRON_TRUSTED_HOSTS',
  'METADATA_HASH_KEY',
  'PII_ENCRYPTION_KEY',
  'HUD_KIOSK_TOKEN',
  'HUD_STARTUP_NAME',
  'HUD_STARTUP_LOGO_URL',
  'HUD_GITHUB_TOKEN',
  'HUD_GITHUB_OWNER',
  'HUD_GITHUB_REPO',
  'HUD_GITHUB_WORKFLOW',
  'REVALIDATE_SECRET',
  'APPLE_MUSIC_KEY_ID',
  'APPLE_MUSIC_TEAM_ID',
  'APPLE_MUSIC_PRIVATE_KEY',
  'SOUNDCLOUD_CLIENT_ID',
  'MUSICFETCH_API_TOKEN',
  'MUSICFETCH_DAILY_HARD_LIMIT',
  'MUSICFETCH_MONTHLY_HARD_LIMIT',
  'MERCURY_API_BASE_URL',
  'MERCURY_API_TOKEN',
  'MERCURY_API_KEY',
  'MERCURY_CHECKING_ACCOUNT_ID',
  'MERCURY_ACCOUNT_ID',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'SESSION_SECRET',
  'TURNSTILE_SECRET_KEY',
  'E2E_PROD_SIGNUP_EMAIL_BASE',
  'E2E_PROD_SIGNUP_PASSWORD',
  'E2E_PROD_MAILBOX_PROVIDER',
  'E2E_PROD_MAILBOX_CLIENT_ID',
  'E2E_PROD_MAILBOX_CLIENT_SECRET',
  'E2E_PROD_MAILBOX_REFRESH_TOKEN',
  'E2E_PROD_MAILBOX_QUERY_FROM',
  'E2E_PROD_OTP_CHECK_URL',
  'E2E_PROD_OTP_CHECK_TOKEN',
  'ANALYTICS_RETENTION_DAYS',
  'TRACKING_TOKEN_SECRET',
  'TRACKING_RATE_LIMIT_CLICKS_PER_HOUR',
  'TRACKING_RATE_LIMIT_VISITS_PER_HOUR',
  'ENABLE_IMPERSONATION',
  'IMPERSONATION_SECRET',
  'SENTRY_DSN',
  'SENTRY_WEBHOOK_SECRET',
  'SENTRY_AUTH_TOKEN',
  'SENTRY_ORG_SLUG',
  'LINEAR_WEBHOOK_SECRET',
  'LINEAR_API_KEY',
  'GH_DISPATCH_TOKEN',
  'VERCEL_GIT_REPO_OWNER',
  'VERCEL_GIT_REPO_SLUG',
  'STATSIG_SERVER_SECRET',
  'AI_GATEWAY_API_KEY',
  'BRAINTRUST_API_KEY',
  'AGENT_OS_WORKFLOWS_ENABLED',
  'XAI_API_KEY',
  'ALBUM_ART_IMAGE_MODEL',
  'ALBUM_ART_GENERATION_DAILY_LIMIT',
  'ALBUM_ART_GENERATION_BURST_LIMIT',
  'JOVIE_DEV_MEMORY_MONITOR',
  'INSTANTLY_API_KEY',
  'INSTANTLY_CAMPAIGN_ID',
  'SERPAPI_API_KEY',
  'GOOGLE_CSE_API_KEY',
  'GOOGLE_CSE_ENGINE_ID',
  'JOVIE_FACEBOOK_PIXEL_ID',
  'JOVIE_FACEBOOK_ACCESS_TOKEN',
  'JOVIE_GOOGLE_MEASUREMENT_ID',
  'JOVIE_GOOGLE_API_SECRET',
  'JOVIE_TIKTOK_PIXEL_ID',
  'JOVIE_TIKTOK_ACCESS_TOKEN',
  'E2E_USE_TEST_AUTH_BYPASS',
  'E2E_CLERK_USER_ID',
  'E2E_CLERK_USER_USERNAME',
  'DEMO_RECORDING',
  'DEMO_CLERK_USER_ID',
  'SMS_INTENT_SECRET',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_AUTH_TOKEN_SECONDARY',
  'TWILIO_AUTH_TOKEN_SECONDARY_EXPIRES_AT',
  'TWILIO_MESSAGING_SERVICE_SID',
  'TWILIO_FROM_NUMBER',
  'NATIVE_SMS_ENABLED',
  'SMS_DEMO_BYPASS_PRO_GATE',
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOOGLE_OAUTH_REDIRECT_URI_BASE',
  'GOOGLE_CALENDAR_DEFAULT_WINDOW_DAYS',
  'GMAIL_HISTORY_WINDOW_DAYS',
  'AI_CONNECTORS_DAILY_TOKEN_BUDGET',
] as const satisfies readonly (keyof z.infer<typeof ServerEnvSchema>)[];
