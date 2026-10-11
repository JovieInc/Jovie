// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';
import {
  createBeforeSendHook,
  getBaseServerConfig,
  isNonProductionServerNoise,
} from '@/lib/sentry/config';
import {
  DESTINATION_STREAM_CLOSED_IGNORE_ERRORS,
  isNonActionableDestinationStreamEvent,
  isNonActionableLoopbackBetterAuthHostEvent,
  isNonActionableVercelIpcEvent,
  isTransientInfraHttpTransaction,
  isUpstashQuotaSentryEvent,
  LOOPBACK_BETTER_AUTH_HOST_IGNORE_ERRORS,
  MUSICFETCH_CUTOVER_IGNORE_ERRORS,
  SPOTIFY_RELEASE_CREDIT_BOUND_IGNORE_ERRORS,
  UPSTASH_QUOTA_IGNORE_ERRORS,
  VERCEL_IPC_SOCK_IGNORE_ERRORS,
} from '@/lib/sentry/non-actionable-issues';

const baseConfig = getBaseServerConfig();

Sentry.init({
  ...baseConfig,

  tracesSampler: samplingContext => {
    const name = samplingContext.name ?? '';
    if (isTransientInfraHttpTransaction(name)) {
      return 0;
    }
    return baseConfig.tracesSampleRate;
  },

  beforeSend: createBeforeSendHook(event => {
    if (isNonProductionServerNoise(event)) {
      return null;
    }
    if (isUpstashQuotaSentryEvent(event)) {
      return null;
    }
    if (isNonActionableVercelIpcEvent(event)) {
      return null;
    }
    if (isNonActionableLoopbackBetterAuthHostEvent(event)) {
      return null;
    }
    if (isNonActionableDestinationStreamEvent(event)) {
      return null;
    }
    return event;
  }),

  // Suppress known non-actionable errors
  ignoreErrors: [
    ...UPSTASH_QUOTA_IGNORE_ERRORS,
    ...SPOTIFY_RELEASE_CREDIT_BOUND_IGNORE_ERRORS,
    ...VERCEL_IPC_SOCK_IGNORE_ERRORS,
    ...DESTINATION_STREAM_CLOSED_IGNORE_ERRORS,
    ...LOOPBACK_BETTER_AUTH_HOST_IGNORE_ERRORS,
    ...MUSICFETCH_CUTOVER_IGNORE_ERRORS,
    // Clerk SSR race condition: auth()/currentUser() called before request
    // context is available during edge/serverless cold starts. Not a code bug —
    // all usages are correctly in server components/actions/API routes.
    /Clerk: (?:auth\(\)|currentUser\(\)|clerkClient\(\)).+only supported/,
    // Node.js TransformStream internal bug — not application code.
    /transformAlgorithm is not a function/,
    /TimeoutError: page\.waitForFunction/i,
    /TimeoutError: locator\.waitFor/i,
    /toHaveURL/,
  ],

  // Sentry 11 does not support vercelAIIntegration on Vercel Edge.
  // The shared collection policy still disables model inputs and outputs.
});
