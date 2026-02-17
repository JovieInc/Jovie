// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

/**
 * PII Collection Notice:
 * When sendDefaultPii is enabled, Sentry may collect:
 * - User IP addresses (anonymized via beforeSend)
 * - User IDs (Clerk user IDs only, no emails)
 * - Request headers (sensitive headers scrubbed)
 *
 * This data is used for error debugging and is retained per Sentry's data retention policy.
 * Users can request data deletion via privacy@jov.ie.
 */

const isProduction = process.env.NODE_ENV === 'production';

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Suppress known non-actionable errors
  ignoreErrors: [
    // Clerk SSR race condition: auth()/currentUser() called before request
    // context is available during edge/serverless cold starts. Not a code bug —
    // all usages are correctly in server components/actions/API routes.
    /Clerk: auth\(\)|currentUser\(\)|clerkClient\(\).+only supported/,
  ],

  // Sample 10% of transactions in production, 100% in development
  tracesSampleRate: isProduction ? 0.1 : 1.0,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII - scrubbed via beforeSend hook below
  sendDefaultPii: true,

  // AI Agent Monitoring: Track Vercel AI SDK calls (LLM requests, token usage)
  integrations: [
    Sentry.vercelAIIntegration({
      recordInputs: true,
      recordOutputs: true,
    }),
  ],

  // Suppress initialization timeout warnings (Sentry continues in background)
  debug: false,

  // Scrub sensitive data before sending to Sentry
  beforeSend(event) {
    // Anonymize IP addresses
    if (event.user?.ip_address) {
      event.user.ip_address = '{{auto}}';
    }

    // Remove email addresses if present
    if (event.user?.email) {
      delete event.user.email;
    }

    // Scrub sensitive headers
    if (event.request?.headers) {
      const sensitiveHeaders = [
        'authorization',
        'cookie',
        'x-api-key',
        'x-auth-token',
      ];
      for (const header of sensitiveHeaders) {
        if (event.request.headers[header]) {
          event.request.headers[header] = '[Filtered]';
        }
      }
    }

    return event;
  },
});
