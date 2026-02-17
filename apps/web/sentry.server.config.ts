// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

const isProduction = process.env.NODE_ENV === 'production';

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Suppress known non-actionable errors
  ignoreErrors: [
    /Clerk: (?:auth\(\)|currentUser\(\)|clerkClient\(\)).+only supported/,
    /transformAlgorithm is not a function/,
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

  // Suppress initialization timeout warnings
  debug: false,

  // Scrub sensitive data before sending to Sentry
  beforeSend(event) {
    if (event.user?.ip_address) {
      event.user.ip_address = '{{auto}}';
    }
    if (event.user?.email) {
      delete event.user.email;
    }
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
