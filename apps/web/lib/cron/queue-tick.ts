import 'server-only';

/**
 * One tick for the queue-polling crons. Compounding (Tim 2026-10-31): N jobs
 * polling on the same schedule become one job running N tasks. Each handler is
 * the existing cron route's GET, unchanged, so auth, limits and behavior stay
 * with the route; this only fans out. Enqueue sites kick a single queue
 * through `kickQueue` (event-driven); the 5-minute cron is the fail-safe.
 */
export const QUEUE_HANDLERS = [
  {
    name: 'interviews',
    load: () => import('@/app/api/cron/summarize-interviews/route'),
  },
  {
    name: 'ingestion',
    load: () => import('@/app/api/cron/process-ingestion-jobs/route'),
  },
  {
    name: 'workflows',
    load: () => import('@/app/api/cron/process-workflow-runs/route'),
  },
  {
    name: 'merch',
    load: () => import('@/app/api/cron/process-merch-fulfillment/route'),
  },
] as const;

export type QueueName = (typeof QUEUE_HANDLERS)[number]['name'];

export function selectQueues(only: string | null): readonly QueueName[] {
  const all = QUEUE_HANDLERS.map(h => h.name);
  if (!only) return all;
  const wanted = new Set(only.split(',').map(s => s.trim()));
  return all.filter(name => wanted.has(name));
}

export interface QueueResult {
  name: QueueName;
  ok: boolean;
  status: number;
  durationMs: number;
}

export async function runQueueTick(
  request: Request,
  only: string | null,
  now: () => number = Date.now
): Promise<QueueResult[]> {
  const names = new Set(selectQueues(only));
  const handlers = QUEUE_HANDLERS.filter(h => names.has(h.name));
  const settled = await Promise.allSettled(
    handlers.map(async handler => {
      const startedAt = now();
      const route = await handler.load();
      const response = await route.GET(request);
      return {
        name: handler.name,
        ok: response.status < 500,
        status: response.status,
        durationMs: now() - startedAt,
      } satisfies QueueResult;
    })
  );
  // A handler that threw is a failed queue, never a skipped one.
  return settled.map((result, index) =>
    result.status === 'fulfilled'
      ? result.value
      : {
          name: handlers[index].name,
          ok: false,
          status: 500,
          durationMs: 0,
        }
  );
}
