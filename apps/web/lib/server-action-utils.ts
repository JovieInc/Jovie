import * as Sentry from '@sentry/nextjs';

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

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
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred';
    return { success: false, error: message };
  }
}
