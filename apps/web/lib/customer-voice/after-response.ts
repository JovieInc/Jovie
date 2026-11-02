import { after } from 'next/server';

/**
 * Run optional follow-up work after the response is sent (Vercel keeps the
 * function alive for it). Outside a request scope, `after` throws; the work
 * then runs detached. Errors are swallowed: callers pass work that reports
 * its own failures and must never fail the primary path.
 */
export function runAfterResponse(work: () => Promise<unknown>): void {
  const safe = () => work().catch(() => undefined);
  try {
    after(safe);
  } catch {
    void safe();
  }
}
