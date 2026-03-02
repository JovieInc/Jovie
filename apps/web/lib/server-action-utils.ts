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
    const rawMessage =
      error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error(`[server-action${context ? `:${context}` : ''}]`, rawMessage);
    return { success: false, error: 'Something went wrong. Please try again.' };
  }
}
