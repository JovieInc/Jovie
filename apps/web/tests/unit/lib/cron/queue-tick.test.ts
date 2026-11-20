import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = vi.hoisted(() => ({
  interviews: vi.fn(),
  ingestion: vi.fn(),
  workflows: vi.fn(),
  merch: vi.fn(),
  merchGenerationRecovery: vi.fn(),
}));
const cronAuth = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('@/lib/cron/auth', () => ({ verifyCronRequest: cronAuth }));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn() } }));
vi.mock('@/app/api/cron/summarize-interviews/route', () => ({
  GET: handlers.interviews,
}));
vi.mock('@/app/api/cron/process-ingestion-jobs/route', () => ({
  GET: handlers.ingestion,
}));
vi.mock('@/app/api/cron/process-workflow-runs/route', () => ({
  GET: handlers.workflows,
}));
vi.mock('@/app/api/cron/process-merch-fulfillment/route', () => ({
  GET: handlers.merch,
}));
vi.mock('@/lib/merch/generation-recovery', () => ({
  reconcileMerchGeneration: handlers.merchGenerationRecovery,
}));

import { GET } from '@/app/api/cron/queue-tick/route';
import { runQueueTick, selectQueues } from '@/lib/cron/queue-tick';

const request = new Request('https://jov.ie/api/cron/queue-tick');

describe('queue tick', () => {
  beforeEach(() => {
    cronAuth.mockReset().mockReturnValue(null);
    for (const handler of Object.values(handlers))
      handler
        .mockReset()
        .mockResolvedValue(new Response('{}', { status: 200 }));
  });

  it('runs every queue on the cron tick', async () => {
    const results = await runQueueTick(request, null);
    expect(results.map(r => r.name)).toEqual([
      'interviews',
      'ingestion',
      'workflows',
      'merch',
      'merch-generation-recovery',
    ]);
    expect(results.every(r => r.ok)).toBe(true);
  });

  it('a kick runs only the named queue', async () => {
    const results = await runQueueTick(request, 'merch');
    expect(results.map(r => r.name)).toEqual(['merch']);
    expect(handlers.ingestion).not.toHaveBeenCalled();
    expect(selectQueues('nope,ingestion')).toEqual(['ingestion']);
  });

  it('negative control: a crashing or 5xx queue is reported failed and does not stop the others', async () => {
    handlers.ingestion.mockRejectedValue(new Error('boom'));
    handlers.workflows.mockResolvedValue(new Response('{}', { status: 500 }));
    const results = await runQueueTick(request, null);
    const byName = Object.fromEntries(results.map(r => [r.name, r.ok]));
    expect(byName).toEqual({
      interviews: true,
      ingestion: false,
      workflows: false,
      merch: true,
      'merch-generation-recovery': true,
    });
  });

  it.each([401, 403, 404, 429])(
    'reports a rejected queue as failed (%s)',
    async status => {
      handlers.workflows.mockResolvedValue(new Response('{}', { status }));
      const results = await runQueueTick(request, null);
      expect(results.find(result => result.name === 'workflows')).toMatchObject(
        {
          ok: false,
          status,
        }
      );
      expect(results.filter(result => result.ok)).toHaveLength(4);
      const response = await GET(request);
      expect(response.status).toBe(500);
      expect((await response.json()).ok).toBe(false);
    }
  );

  it('rejects unauthorized ticks before loading any queues', async () => {
    cronAuth.mockReturnValue(new Response('unauthorized', { status: 401 }));
    expect((await GET(request)).status).toBe(401);
    for (const handler of Object.values(handlers))
      expect(handler).not.toHaveBeenCalled();
  });

  it('serves a successful named queue kick without caching the result', async () => {
    const response = await GET(new Request(`${request.url}?only=merch`));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(await response.json()).toMatchObject({
      ok: true,
      results: [{ name: 'merch', ok: true, status: 200 }],
    });
    expect(handlers.ingestion).not.toHaveBeenCalled();
  });
});
