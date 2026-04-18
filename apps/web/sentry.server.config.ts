// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';
import {
  createBeforeSendHook,
  getBaseServerConfig,
  isNonProductionServerNoise,
} from '@/lib/sentry/config';

const baseConfig = getBaseServerConfig();

// Health endpoint is polled every minute by Sentry uptime monitoring.
// Exclude it from performance traces to avoid polluting transaction data.
// Sentry uptime monitor config: Alerts → Uptime → Add Monitor
//   URL: https://jov.ie/api/health  |  Interval: 1 min
const HEALTH_ENDPOINT_PATTERN = /^\/api\/health/;

Sentry.init({
  ...baseConfig,

  // Drop performance traces for the health endpoint — Sentry's uptime monitor
  // pings it every minute, which would otherwise skew p50/p99 latency data.
  tracesSampler: samplingContext => {
    const name = samplingContext.name ?? '';
    if (HEALTH_ENDPOINT_PATTERN.test(name)) {
      return 0;
    }
    return baseConfig.tracesSampleRate;
  },

  // Extend shared beforeSend with server-specific filtering
  beforeSend: createBeforeSendHook(event => {
    if (isNonProductionServerNoise(event)) {
      return null;
    }

    // EPIPE/ECONNRESET on /api/chat are expected client disconnects (tab close,
    // navigation). Drop them only for that path; surface them everywhere else.
    const isChatPath = event.request?.url?.includes('/api/chat');
    if (isChatPath) {
      const msg = event.exception?.values?.[0]?.value ?? '';
      if (/write EPIPE/.test(msg) || /ECONNRESET/.test(msg)) {
        return null;
      }
    }
    return event;
  }),

  // Suppress known non-actionable errors
  ignoreErrors: [
    // Clerk SSR race condition: auth()/currentUser() called before request
    // context is available during edge/serverless cold starts. Not a code bug —
    // all usages are correctly in server components/actions/API routes.
    /Clerk: (?:auth\(\)|currentUser\(\)|clerkClient\(\)).+only supported/,
    // Node.js TransformStream internal bug — not application code.
    // Occurs during streaming responses (chat API). Only 2 users affected.
    /transformAlgorithm is not a function/,
    // EPIPE/ECONNRESET: client disconnected mid-stream (tab close, navigation).
    // Expected in any streaming endpoint; not an application bug.
    /write EPIPE/,
    /ECONNRESET/,
    // Expected auth errors from server actions when session expires or user
    // is not authenticated. These are handled by the client error boundary
    // and are not bugs (JOV-1065).
    /^Unauthorized$/,
    /TimeoutError: page\.waitForFunction/i,
    /TimeoutError: locator\.waitFor/i,
    /toHaveURL/,
    // FeaturedCreators: table check timeout with graceful fallback already in place.
    /\[FeaturedCreators\].*(?:timed out|failed or timed out)/,
    // OutreachPipeline: hitting configured daily budget limit is expected behavior.
    /Daily query budget exhausted/,
  ],

  // AI Agent Monitoring: Track Vercel AI SDK calls (LLM requests, token usage)
  integrations: [
    Sentry.vercelAIIntegration({
      recordInputs: true,
      recordOutputs: true,
    }),
  ],
});
