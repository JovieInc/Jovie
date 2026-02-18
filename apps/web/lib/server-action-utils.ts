import * as Sentry from '@sentry/nextjs';

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Wraps a server action with structured error handling and Sentry reporting.
 *
 * Use this for server actions invoked directly (e.g. form actions, internal
 * API calls) where you want a consistent `{ success, data/error }` return shape.
 *
 * Do NOT wrap server actions that are used as TanStack Query mutation functions —
 * those intentionally let errors propagate so the client `onError` handler fires.
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  context?: string
): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    Sentry.captureException(error, {
      tags: { context: context ?? 'server-action' },
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}
