import 'server-only';

import { env } from '@/lib/env-server';
import { scheduleAfter } from '@/lib/next/schedule-after';
import { getBaseUrl } from '@/lib/utils/platform-detection/environment';
import type { QueueName } from './queue-tick';

export const KICK_TIMEOUT_MS = 5000;

/**
 * Event-driven trigger: run one queue now, right after a row was enqueued,
 * instead of waiting for the 5-minute fail-safe tick. Best effort and never
 * throws; if the kick is lost the cron still drains the queue.
 */
export function kickQueue(
  name: QueueName,
  fetchImpl: typeof fetch = fetch
): boolean {
  const secret = env.CRON_SECRET;
  if (!secret || env.NODE_ENV === 'test') return false;
  const url = `${getBaseUrl()}/api/cron/queue-tick?only=${name}`;
  return scheduleAfter(
    async () => {
      try {
        await fetchImpl(url, {
          headers: { authorization: `Bearer ${secret}` },
          // Short budget: the tick route keeps draining after we disconnect, and
          // this callback must finish inside the calling route's 30s limit.
          signal: AbortSignal.timeout(KICK_TIMEOUT_MS),
        });
      } catch {
        // The fail-safe tick will pick the work up.
      }
    },
    { fallback: 'skip' }
  );
}
