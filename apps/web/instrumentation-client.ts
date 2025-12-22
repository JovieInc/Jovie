// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

/**
 * PII Collection Notice:
 * When sendDefaultPii is enabled, Sentry may collect:
 * - User IP addresses (anonymized via beforeSend)
 * - User IDs (Clerk user IDs only, no emails)
 *
 * This data is used for error debugging and is retained per Sentry's data retention policy.
 * Users can request data deletion via privacy@jov.ie.
 */

const isProduction = process.env.NODE_ENV === 'production';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Add optional integrations for additional features
  integrations: [Sentry.replayIntegration()],

  // Sample 10% of transactions in production, 100% in development
  tracesSampleRate: isProduction ? 0.1 : 1.0,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Define how likely Replay events are sampled.
  // 10% in production, 100% in development
  replaysSessionSampleRate: isProduction ? 0.1 : 1.0,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // Disable PII collection on client - user context set server-side only
  sendDefaultPii: false,

  // Scrub sensitive data before sending to Sentry
  beforeSend(event) {
    // Anonymize IP addresses if present
    if (event.user?.ip_address) {
      event.user.ip_address = '{{auto}}';
    }

    // Remove email addresses if present
    if (event.user?.email) {
      delete event.user.email;
    }

    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
