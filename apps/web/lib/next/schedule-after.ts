import 'server-only';

import { after } from 'next/server';

/**
 * Next.js `after()` talks to Vercel's helper over `/opt/vercel/ipc.sock`.
 * When that socket is down (build, ISR, Fluid freeze, missing helper) the
 * runtime throws this instead of the documented "outside a request scope"
 * error (JOV-5605). Treat both as "cannot keep the function alive".
 */
export const VERCEL_IPC_SOCK_ERROR_PATTERN =
  /connect ECONNREFUSED .*\/opt\/vercel\/ipc\.sock/;

export function isAfterUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message;
  if (message.includes('outside a request scope')) return true;
  if (VERCEL_IPC_SOCK_ERROR_PATTERN.test(message)) return true;

  const code =
    'code' in error ? String((error as NodeJS.ErrnoException).code) : '';
  return code === 'ECONNREFUSED' && message.includes('ipc.sock');
}

export type ScheduleAfterFallback = 'microtask' | 'inline' | 'skip';

/**
 * Schedule work that should outlive the response. Falls back when `after()`
 * cannot register with the Vercel IPC helper so the caller does not 500.
 *
 * - `microtask` (default): still run the work on this tick (tests, scripts).
 * - `inline`: start immediately (durable workers that must write DB state).
 * - `skip`: drop the work (SSG/ISR best-effort that must not mutate on build).
 */
export function scheduleAfter(
  task: () => unknown,
  options?: { fallback?: ScheduleAfterFallback }
): boolean {
  try {
    after(task);
    return true;
  } catch (error) {
    if (!isAfterUnavailableError(error)) {
      throw error;
    }

    const fallback = options?.fallback ?? 'microtask';
    if (fallback === 'skip') return false;
    if (fallback === 'inline') {
      void Promise.resolve(task());
      return false;
    }

    queueMicrotask(() => {
      void task();
    });
    return false;
  }
}
