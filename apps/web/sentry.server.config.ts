// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';
import { createBeforeSendHook, getBaseServerConfig } from '@/lib/sentry/config';

const baseConfig = getBaseServerConfig();

Sentry.init({
  ...baseConfig,

  // Extend shared beforeSend with server-specific filtering
  beforeSend: createBeforeSendHook(event => {
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
    // Expected auth errors from server actions when session expires or user
    // is not authenticated. These are handled by the client error boundary
    // and are not bugs (JOV-1065).
    /^Unauthorized$/,
  ],

  // AI Agent Monitoring: Track Vercel AI SDK calls (LLM requests, token usage)
  integrations: [
    Sentry.vercelAIIntegration({
      recordInputs: true,
      recordOutputs: true,
    }),
  ],
});
