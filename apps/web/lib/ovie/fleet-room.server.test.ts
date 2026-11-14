import { describe, expect, it, vi } from 'vitest';
import { memoryRoomRedis } from '@/lib/agent-room/test-redis';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/redis', () => ({ getRedis: () => null }));
vi.mock('@/lib/env-server', () => ({ env: {} }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

const {
  fleetRoomCronJob,
  fleetRoomSyncQuery,
  ingestFleetRoomLinearWebhook,
  readOvieFleetRoom,
  syncOvieFleetRoom,
} = await import('./fleet-room.server');
const { OVIE_FLEET_HOME_THREADS } = await import('./fleet-room');

const NOW = new Date('2026-11-11T20:10:00.000Z');

function commentPayload(data: Record<string, unknown>, url?: string) {
  return { type: 'Comment', action: 'create', url, data };
}

describe('ingestFleetRoomLinearWebhook', () => {
  it('writes an attributed comment using the issue identifier from the payload url', async () => {
    const redis = memoryRoomRedis();
    const linear = vi.fn();
    const result = await ingestFleetRoomLinearWebhook(
      commentPayload(
        {
          id: 'c1',
          body: '[Lola → Claude Duet] Communication acceptance evidence',
          createdAt: '2026-11-11T18:52:16.997Z',
          userId: 'bb142ab2-e0e9-4f89-b330-b484d6b32139',
          issueId: '0b7c3d1e-1111-4222-8333-944455556666',
        },
        'https://linear.app/jovie/issue/JOV-12296/make-linear#comment-c1'
      ),
      { redis, linear }
    );
    expect(result).toEqual({ status: 'written', written: 1, trimmed: 0 });
    expect(linear).not.toHaveBeenCalled();
    const room = await readOvieFleetRoom(NOW, { redis });
    expect(room.status).toBe('ok');
    expect(room.view.events[0]).toMatchObject({
      agentId: 'lola',
      to: 'elsa',
      toName: 'Elsa',
      thread: { ref: 'JOV-12296' },
    });
  });

  it('reads the issue once when a native payload carries only issueId', async () => {
    const redis = memoryRoomRedis();
    const linear = vi.fn().mockResolvedValue({
      issue: {
        identifier: 'JOV-7998',
        title: 'Commission mesh receipt',
        url: 'https://linear.app/jovie/issue/JOV-7998/commission',
      },
    });
    const result = await ingestFleetRoomLinearWebhook(
      commentPayload({
        id: 'c2',
        body: '[Chloe → Lola] ack lola-chloe-roundtrip-20261111-01',
        createdAt: '2026-11-11T19:00:00.000Z',
        issueId: '0b7c3d1e-1111-4222-8333-944455556666',
      }),
      { redis, linear }
    );
    expect(result.status).toBe('written');
    expect(linear).toHaveBeenCalledTimes(1);
  });

  it('ignores unattributed comments before any provider or store call', async () => {
    const linear = vi.fn();
    const result = await ingestFleetRoomLinearWebhook(
      commentPayload({
        id: 'c3',
        body: 'Validation lifecycle moved JOV-1 to Merging.',
        createdAt: '2026-11-11T19:00:00.000Z',
        issueId: '0b7c3d1e-1111-4222-8333-944455556666',
      }),
      { redis: null, linear }
    );
    expect(result).toEqual({ status: 'ignored', reason: 'unattributed' });
    expect(linear).not.toHaveBeenCalled();
    expect(
      await ingestFleetRoomLinearWebhook(
        { type: 'Issue', action: 'update', data: {} },
        { redis: null, linear }
      )
    ).toEqual({ status: 'ignored', reason: 'not-a-comment' });
  });
});

describe('syncOvieFleetRoom', () => {
  it('reads fleet issues and home threads in one query through the same normalizer', async () => {
    const redis = memoryRoomRedis();
    const thread = (identifier: string, comments: unknown[]) => ({
      identifier,
      title: `${identifier} title`,
      url: `https://linear.app/jovie/issue/${identifier}`,
      comments: { nodes: comments },
    });
    const linear = vi.fn().mockResolvedValue({
      fleet: {
        nodes: [
          thread('JOV-12296', [
            {
              id: 'a',
              body: '[Summer → fleet] one bottleneck: reach',
              createdAt: '2026-11-11T19:00:00.000Z',
              user: { id: 'bb142ab2-e0e9-4f89-b330-b484d6b32139' },
            },
            {
              id: 'b',
              body: 'Validation lifecycle moved JOV-12296.',
              createdAt: '2026-11-11T19:01:00.000Z',
              user: { id: 'bb142ab2-e0e9-4f89-b330-b484d6b32139' },
            },
          ]),
        ],
      },
      home0: thread('JOV-12296', []),
      home1: thread('JOV-7998', [
        {
          id: 'c',
          body: "Codex couldn't start a task for this request: usage limits",
          createdAt: '2026-11-11T19:02:00.000Z',
          user: { id: 'c802cb9b-dcdd-4081-afa9-376e905b73ab' },
        },
      ]),
    });
    const receipt = await syncOvieFleetRoom(NOW, { redis, linear });
    expect(receipt).toMatchObject({ status: 'ok', issues: 2, written: 2 });
    const [query, variables] = linear.mock.calls[0];
    expect(query).toBe(fleetRoomSyncQuery(OVIE_FLEET_HOME_THREADS));
    expect(variables).toMatchObject({
      since: '2026-11-04T20:10:00.000Z',
      home0: OVIE_FLEET_HOME_THREADS[0],
    });
    const room = await readOvieFleetRoom(NOW, { redis });
    expect(room.view.agents[0]).toMatchObject({
      id: 'codex',
      presence: 'blocked',
    });
  });

  it('skips a home thread that fails instead of dropping the whole sync', async () => {
    const redis = memoryRoomRedis();
    const comment = {
      id: 'd',
      body: "Codex couldn't start a task for this request: usage limits",
      createdAt: '2026-11-11T19:02:00.000Z',
      user: { id: 'c802cb9b-dcdd-4081-afa9-376e905b73ab' },
    };
    const bad = OVIE_FLEET_HOME_THREADS[0];
    const linear = vi.fn(
      async (_query: string, variables: Record<string, unknown>) => {
        if (Object.values(variables).includes(bad)) {
          throw new Error('Entity not found');
        }
        if (variables.home0) {
          return {
            home0: {
              identifier: String(variables.home0),
              title: null,
              url: null,
              comments: { nodes: [comment] },
            },
          };
        }
        return { fleet: { nodes: [] } };
      }
    );
    const receipt = await syncOvieFleetRoom(NOW, { redis, linear });
    expect(receipt).toMatchObject({ status: 'ok' });
    expect(linear).toHaveBeenCalledTimes(2 + OVIE_FLEET_HOME_THREADS.length);
    if (OVIE_FLEET_HOME_THREADS.length > 1) {
      expect(receipt).toMatchObject({ written: 1 });
    }
  });

  it('still fails when the fleet list itself cannot be read', async () => {
    const linear = vi.fn().mockRejectedValue(new Error('Linear down'));
    await expect(
      syncOvieFleetRoom(NOW, { redis: memoryRoomRedis(), linear })
    ).rejects.toThrow('Linear down');
  });

  it('reports unconfigured sources instead of throwing', async () => {
    expect(await syncOvieFleetRoom(NOW, { redis: null, linear: null })).toEqual(
      {
        status: 'unavailable',
        reason: 'redis-unavailable',
      }
    );
    expect(
      await syncOvieFleetRoom(NOW, { redis: memoryRoomRedis(), linear: null })
    ).toEqual({ status: 'unavailable', reason: 'linear-unconfigured' });
  });

  it('runs only in the hourly cron slot', async () => {
    const run = vi.fn(async (_name: string, fn: () => Promise<unknown>) =>
      fn()
    );
    const sync = vi.fn().mockResolvedValue({ status: 'ok' });
    expect(await fleetRoomCronJob(30, run, sync)).toEqual({
      success: true,
      skipped: true,
    });
    expect(sync).not.toHaveBeenCalled();
    await fleetRoomCronJob(5, run, sync);
    expect(run).toHaveBeenCalledWith('fleetRoom', expect.any(Function));
    expect(sync).toHaveBeenCalledTimes(1);
  });
});

describe('readOvieFleetRoom', () => {
  it('still returns the roster when no store is configured', async () => {
    const room = await readOvieFleetRoom(NOW, { redis: null });
    expect(room).toMatchObject({
      status: 'unavailable',
      reason: 'redis-unavailable',
    });
    expect(room.view.agents.length).toBeGreaterThan(0);
    expect(room.view.events).toEqual([]);
  });
});
