import 'server-only';

import { withRetry } from '@/lib/db/client';
import { QUERY_TIMEOUTS } from '@/lib/db/query-timeout';

/**
 * Bounded read replay for the session-lookup selects (JOV-13156, Sentry
 * JOVIE-WEB-10T 7857366572): getDbUser / getProfileByDbUserId /
 * getSessionContext are single indexed SELECTs — replaying once after a
 * transient Neon transport kill is unambiguous (JOV-12188/JOV-8837
 * read-recovery doctrine, same policy as APP_USER_READ_RETRY in
 * lib/auth/app-user.ts). Admission is `isRetryableError`'s transport class,
 * never statement or idle-in-transaction timeouts (JOV-5754); non-transport
 * errors still propagate after one attempt. Reads only — callers must pass
 * side-effect-free SELECT thunks.
 */
const SESSION_READ_RETRY = {
  operation: 'read',
  maxAttempts: 2,
  retryBudgetMs: QUERY_TIMEOUTS.api,
} as const;

/** Replay a pure session-path read once after a transient transport kill. */
export function replaySessionRead<T>(
  query: () => Promise<T>,
  context: string
): Promise<T> {
  return withRetry(query, context, SESSION_READ_RETRY);
}
