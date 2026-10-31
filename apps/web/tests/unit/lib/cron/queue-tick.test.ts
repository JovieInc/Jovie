import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = vi.hoisted(() => ({
  interviews: vi.fn(),
  ingestion: vi.fn(),
  workflows: vi.fn(),
  merch: vi.fn(),
}));

vi.mock('server-only', () => ({}));
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

import { runQueueTick, selectQueues } from '@/lib/cron/queue-tick';

const request = new Request('https://jov.ie/api/cron/queue-tick');

describe('queue tick', () => {
  beforeEach(() => {
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
    });
  });
});
