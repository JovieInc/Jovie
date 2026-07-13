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
  CI: z.string().optional(),
  VITEST: z.string().optional(),
  VERCEL_ENV: z.enum(['development', 'preview', 'production']).optional(),
  NEXT_PUBLIC_APP_VERSION: z.string().optional(),
  NEXT_PUBLIC_BUILD_SHA: z.string().optional(),
  VERCEL_GIT_COMMIT_SHA: z.string().optional(),
  VERCEL_DEPLOYMENT_TIME: z.string().optional(),
  VERCEL_URL: z
    .string()
    .trim()
    .refine(isHostWithOptionalPort, {
      message:
        'VERCEL_URL must be a hostname or hostname:port without a scheme or path',
    })
    .optional(),
  VERCEL_AUTOMATION_BYPASS_SECRET: z.string().optional(),
  PUBLIC_NOAUTH_SMOKE: z.string().optional(),
  /**
   * E2E-only: lets tests force the onboarding LLM path to fail so the
   * deterministic fallback can be exercised. Hard-ignored on production
   * deploys regardless of value (see onboarding-handler.ts).
   */
  CHAT_LLM_FAILURE_INJECTION: z.string().optional(),

  /**
   * E2E-only: '1' switches the Better Auth email-OTP flow to the deterministic
   * test code for test-pattern addresses. Hard-ignored on production deploys
   * (better-auth.ts guards on VERCEL_ENV).
   */
  E2E_TEST_MODE: z.string().optional(),

  // Clerk server-side configuration
  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_WEBHOOK_SECRET: z.string().optional(),
  CLERK_PUBLISHABLE_KEY_STAGING: z.string().optional(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),

  // Better Auth (self-hosted auth — Clerk cutover in flight; optional until
  // the flip commit adds preview/prod fail-fast validation rules)
  BETTER_AUTH_SECRET: z.string().optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
  AUTH_GOOGLE_CLIENT_ID: z.string().optional(),
  AUTH_GOOGLE_CLIENT_SECRET: z.string().optional(),
  AUTH_APPLE_CLIENT_ID: z.string().optional(),
  AUTH_APPLE_TEAM_ID: z.string().optional(),
  AUTH_APPLE_KEY_ID: z.string().optional(),
  AUTH_APPLE_PRIVATE_KEY: z.string().optional(),

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
  /** Opt-in pool-level PostgreSQL statement_timeout in milliseconds. */
  DB_STATEMENT_TIMEOUT_MS: z.string().regex(/^\d+$/).optional(),

  // Server or build-time envs (may be undefined locally)
  SPOTIFY_CLIENT_ID: z.string().optional(),
  SPOTIFY_CLIENT_SECRET: z.string().optional(),
  JOVIE_SYSTEM_CLERK_USER_ID: z.string().optional(),
  JOVIE_SPOTIFY_ACCESS_TOKEN: z.string().optional(),
  APPLE_MUSIC_DEVELOPER_TOKEN: z.string().optional(),
  IOS_TESTFLIGHT_PUBLIC_LINK: z.string().url().optional(),

  // Apple Wallet profile passes (PassKit)
  APPLE_WALLET_PASS_TYPE_IDENTIFIER: z.string().optional(),
  APPLE_WALLET_TEAM_IDENTIFIER: z.string().optional(),
  APPLE_WALLET_SIGNER_CERT_PEM: z.string().optional(),
  APPLE_WALLET_SIGNER_KEY_PEM: z.string().optional(),
  APPLE_WALLET_SIGNER_KEY_PASSPHRASE: z.string().optional(),
  APPLE_WALLET_WWDR_CERT_PEM: z.string().optional(),
  APPLE_WALLET_AUTH_TOKEN_SECRET: z.string().min(32).optional(),
  APPLE_WALLET_APNS_PRODUCTION: z.enum(['true', 'false']).optional(),

  // Bandsintown configuration
  BANDSINTOWN_APP_ID: z.string().optional(),

  // Vercel Blob
  BLOB_READ_WRITE_TOKEN: z.string().optional(),

  // Telegram Bot (for asset ingestion webhook)
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

  // Stripe server-side configuration
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_CONNECT_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_WEBHOOK_SECRET_TIPS: z.string().optional(),
  STRIPE_WEBHOOK_SECRET_MERCH: z.string().optional(),
  TIP_PLATFORM_FEE_PERCENT: z.string().optional(),

  // Printful fulfillment backend
  PRINTFUL_API_KEY: z.string().optional(),
  PRINTFUL_API_BASE_URL: z.string().url().optional(),
  PRINTFUL_STORE_ID: z.string().optional(),
  PRINTFUL_WEBHOOK_SECRET: z.string().optional(),

  // Retired founding tier — webhook lookup only (founding -> pro entitlements)
  STRIPE_PRICE_FOUNDING_MONTHLY: z.string().startsWith('price_').optional(),

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
  GBRAIN_API_URL: z.string().optional(),
  GBRAIN_API_KEY: z.string().optional(),

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
  UPSTASH_REDIS_REST_URL: z.string().trim().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().trim().optional(),

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

  // Vercel deploy admin (promote/status endpoints)
  VERCEL_API_TOKEN: z.string().optional(),
  VERCEL_PROJECT_ID: z.string().optional(),
  VERCEL_TEAM_ID: z.string().optional(),
  VERCEL_PRODUCTION_DEPLOY_HOOK: z.string().url().optional(),

  // Statsig server-side (feature flags)
  STATSIG_SERVER_SECRET: z.string().optional(),

  // AI Gateway auth (required for chat completions)
  AI_GATEWAY_API_KEY: z.string().optional(),
  /** Optional Helicone proxy base URL (e.g. Cloudflare Worker) for cost/rate observability. */
  HELICONE_GATEWAY_BASE_URL: z.string().url().optional(),
  /** Helicone API key sent as `Helicone-Auth` when routing through the proxy. */
  HELICONE_API_KEY: z.string().optional(),
  // Hermes HUD events ingest authentication
  HERMES_HUD_API_KEY: z.string().optional(),
  HUD_AGENT_RUNS_FIXTURES: z
    .string()
    .optional()
    .describe(
      'Set to 1 to show fixture Agent OS runs when live ingest is empty'
    ),

  // OpenAI (for vision model fallback in asset extraction)
  OPENAI_API_KEY: z.string().optional(),

  // ElevenLabs (voice clone, promo TTS, voice pipeline webhooks)
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_WEBHOOK_SECRET: z.string().optional(),

  /** Set to `1` to allow local Sentry bootstrap in dev/test/E2E. */
  JOVIE_ENABLE_LOCAL_SENTRY: z.enum(['0', '1']).optional(),

  // Agnost AI analytics (Vercel AI SDK telemetry via OpenTelemetry)
  AGNOST_ORG_ID: z.string().uuid().optional(),
  /** Set to `1` to export Agnost traces in local development. */
  JOVIE_ENABLE_AGNOST: z.enum(['0', '1']).optional(),

  // Langfuse LLM tracing + prompt registry delivery (Langfuse Cloud)
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  /** Defaults to https://cloud.langfuse.com when unset. */
  LANGFUSE_BASE_URL: z.string().url().optional(),
  /** Set to `1` to export Langfuse traces in local development. */
  JOVIE_ENABLE_LANGFUSE: z.enum(['0', '1']).optional(),

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
  /** Optional override for the Release-to-Revenue design-partner creator username */
  RELEASE_TO_REVENUE_DESIGN_PARTNER_USERNAME: z.string().optional(),

  // Cloudflare zone analytics (AI crawler intelligence — GH-12748)
  CLOUDFLARE_ZONE_ID: z.string().optional(),

  // Development tools
  JOVIE_DEV_MEMORY_MONITOR: z.string().optional(),
  JOVIE_PROMPTFOO_EXPECT_MODEL_KEYS_DISABLED: z.string().optional(),
  /** Dev/E2E token for iOS real-browser auth harness rate-limit bypass */
  JOVIE_IOS_REAL_BROWSER_AUTH_TOKEN: z.string().optional(),

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
   * Master gate for outbound SMS provider POSTs (release alerts + webhook
   * auto-replies). When 'false' (or unset), sends short-circuit before
   * Twilio. Inbound STOP/HELP still process regardless (TCPA mandate).
   */
  OUTBOUND_SMS_ENABLED: z.string().optional(),
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
  'CI',
  'VITEST',
  'VERCEL_ENV',
  'NEXT_PUBLIC_APP_VERSION',
  'NEXT_PUBLIC_BUILD_SHA',
  'VERCEL_GIT_COMMIT_SHA',
  'VERCEL_DEPLOYMENT_TIME',
  'VERCEL_URL',
  'VERCEL_AUTOMATION_BYPASS_SECRET',
  'PUBLIC_NOAUTH_SMOKE',
  'CHAT_LLM_FAILURE_INJECTION',
  'E2E_TEST_MODE',
  'CLERK_SECRET_KEY',
  'CLERK_WEBHOOK_SECRET',
  'CLERK_PUBLISHABLE_KEY_STAGING',
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'AUTH_GOOGLE_CLIENT_ID',
  'AUTH_GOOGLE_CLIENT_SECRET',
  'AUTH_APPLE_CLIENT_ID',
  'AUTH_APPLE_TEAM_ID',
  'AUTH_APPLE_KEY_ID',
  'AUTH_APPLE_PRIVATE_KEY',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'RESEND_REPLY_TO_EMAIL',
  'RESEND_WEBHOOK_SECRET',
  'RESEND_INBOUND_WEBHOOK_SECRET',
  'SLACK_WEBHOOK_URL',
  'DATABASE_URL',
  'DB_STATEMENT_TIMEOUT_MS',
  'SPOTIFY_CLIENT_ID',
  'SPOTIFY_CLIENT_SECRET',
  'JOVIE_SYSTEM_CLERK_USER_ID',
  'JOVIE_SPOTIFY_ACCESS_TOKEN',
  'APPLE_MUSIC_DEVELOPER_TOKEN',
  'IOS_TESTFLIGHT_PUBLIC_LINK',
  'APPLE_WALLET_PASS_TYPE_IDENTIFIER',
  'APPLE_WALLET_TEAM_IDENTIFIER',
  'APPLE_WALLET_SIGNER_CERT_PEM',
  'APPLE_WALLET_SIGNER_KEY_PEM',
  'APPLE_WALLET_SIGNER_KEY_PASSPHRASE',
  'APPLE_WALLET_WWDR_CERT_PEM',
  'APPLE_WALLET_AUTH_TOKEN_SECRET',
  'APPLE_WALLET_APNS_PRODUCTION',
  'BANDSINTOWN_APP_ID',
  'BLOB_READ_WRITE_TOKEN',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_CONNECT_WEBHOOK_SECRET',
  'STRIPE_WEBHOOK_SECRET_TIPS',
  'STRIPE_WEBHOOK_SECRET_MERCH',
  'TIP_PLATFORM_FEE_PERCENT',
  'PRINTFUL_API_KEY',
  'PRINTFUL_API_BASE_URL',
  'PRINTFUL_STORE_ID',
  'PRINTFUL_WEBHOOK_SECRET',
  'STRIPE_PRICE_FOUNDING_MONTHLY',
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
  'GBRAIN_API_URL',
  'GBRAIN_API_KEY',
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
  'VERCEL_API_TOKEN',
  'VERCEL_PROJECT_ID',
  'VERCEL_TEAM_ID',
  'VERCEL_PRODUCTION_DEPLOY_HOOK',
  'STATSIG_SERVER_SECRET',
  'AI_GATEWAY_API_KEY',
  'HELICONE_GATEWAY_BASE_URL',
  'HELICONE_API_KEY',
  'HERMES_HUD_API_KEY',
  'HUD_AGENT_RUNS_FIXTURES',
  'OPENAI_API_KEY',
  'ELEVENLABS_API_KEY',
  'ELEVENLABS_WEBHOOK_SECRET',
  'JOVIE_ENABLE_LOCAL_SENTRY',
  'AGNOST_ORG_ID',
  'JOVIE_ENABLE_AGNOST',
  'LANGFUSE_SECRET_KEY',
  'LANGFUSE_PUBLIC_KEY',
  'LANGFUSE_BASE_URL',
  'JOVIE_ENABLE_LANGFUSE',
  'AGENT_OS_WORKFLOWS_ENABLED',
  'XAI_API_KEY',
  'ALBUM_ART_IMAGE_MODEL',
  'ALBUM_ART_GENERATION_DAILY_LIMIT',
  'ALBUM_ART_GENERATION_BURST_LIMIT',
  'JOVIE_DEV_MEMORY_MONITOR',
  'JOVIE_PROMPTFOO_EXPECT_MODEL_KEYS_DISABLED',
  'JOVIE_IOS_REAL_BROWSER_AUTH_TOKEN',
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
  'OUTBOUND_SMS_ENABLED',
  'SMS_DEMO_BYPASS_PRO_GATE',
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOOGLE_OAUTH_REDIRECT_URI_BASE',
  'GOOGLE_CALENDAR_DEFAULT_WINDOW_DAYS',
  'GMAIL_HISTORY_WINDOW_DAYS',
  'AI_CONNECTORS_DAILY_TOKEN_BUDGET',
] as const satisfies readonly (keyof z.infer<typeof ServerEnvSchema>)[];
