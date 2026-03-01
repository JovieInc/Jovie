// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';
import { getBaseServerConfig } from '@/lib/sentry/config';

const baseConfig = getBaseServerConfig();

Sentry.init({
  ...baseConfig,

  // Suppress known non-actionable errors
  ignoreErrors: [
    // Clerk SSR race condition: auth()/currentUser() called before request
    // context is available during edge/serverless cold starts. Not a code bug —
    // all usages are correctly in server components/actions/API routes.
    /Clerk: (?:auth\(\)|currentUser\(\)|clerkClient\(\)).+only supported/,
    // Node.js TransformStream internal bug — not application code.
    /transformAlgorithm is not a function/,
  ],

  // AI Agent Monitoring: Explicit for edge runtime (not auto-enabled like Node)
  integrations: [
    Sentry.vercelAIIntegration({
      recordInputs: true,
      recordOutputs: true,
    }),
  ],
});
