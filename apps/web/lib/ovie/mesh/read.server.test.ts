import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { MeshReadPayload } from './types';

const FORBIDDEN_KEY_PATTERN = /token|hash|secret|key|credential|password/i;

function collectForbiddenKeys(value: unknown): string[] {
  if (typeof value === 'string' || value === null) return [];
  if (Array.isArray(value)) return value.flatMap(collectForbiddenKeys);
  if (typeof value === 'object') {
    return Object.entries(value).flatMap(([entryKey, entryValue]) =>
      FORBIDDEN_KEY_PATTERN.test(entryKey)
        ? [entryKey]
        : collectForbiddenKeys(entryValue)
    );
  }
  return [];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const NOW = Date.parse('2026-10-23T19:00:00.000Z');

function envWithOrigin(origin: string | undefined): NodeJS.ProcessEnv {
  return { ...(origin === undefined ? {} : { SUMMER_MESH_ORIGIN: origin }) };
}

describe('getSummerMeshOrigin', () => {
  it('accepts an https origin and strips a trailing slash', async () => {
    const { getSummerMeshOrigin } = await import('./read.server');
    expect(getSummerMeshOrigin(envWithOrigin('https://summer.example/'))).toBe(
      'https://summer.example'
    );
  });

  it('treats unset, http, credential-bearing, and invalid origins as unconfigured', async () => {
    const { getSummerMeshOrigin } = await import('./read.server');
    expect(getSummerMeshOrigin(envWithOrigin(undefined))).toBeNull();
    expect(getSummerMeshOrigin(envWithOrigin(''))).toBeNull();
    expect(
      getSummerMeshOrigin(envWithOrigin('http://summer.example'))
    ).toBeNull();
    expect(
      getSummerMeshOrigin(envWithOrigin('https://user:pass@summer.example'))
    ).toBeNull();
    expect(getSummerMeshOrigin(envWithOrigin('not a url'))).toBeNull();
  });
});

describe('loadMeshRead', () => {
  let fetchImpl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    fetchImpl = vi.fn();
  });

  it('degrades every row to unknown when the Summer origin is unconfigured', async () => {
    const { loadMeshRead } = await import('./read.server');
    const payload = await loadMeshRead({
      environment: envWithOrigin(undefined),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => NOW,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(payload.mailboxSource).toBe('unavailable');
    expect(payload.watcherSource).toBe('unavailable');
    expect(payload.agents.every(agent => agent.status === 'unknown')).toBe(
      true
    );
    expect(payload.agents.every(agent => agent.recentMessages === null)).toBe(
      true
    );
    expect(payload.agents.every(agent => agent.gaps === null)).toBe(true);
  });

  it('merges registry sender ids with mailbox records and the watcher log', async () => {
    fetchImpl.mockResolvedValue(
      jsonResponse({
        schema: 'summer.mesh-mailbox/v1',
        mailboxes: {
          summer: {
            lastSentAt: '2026-10-23T18:00:00.000Z',
            lastReceivedAt: '2026-10-23T18:30:00.000Z',
            recentMessages: [
              {
                direction: 'received',
                summary: 'Daily brief delivered',
                at: '2026-10-23T18:30:00.000Z',
              },
            ],
          },
          lola: {
            lastSentAt: '2026-10-20T12:00:00.000Z',
            lastReceivedAt: '2026-10-20T12:05:00.000Z',
            recentMessages: [],
          },
        },
        watcherLog: [
          { agentId: 'lola', note: 'Rotation approval pending' },
          { agentId: null, note: 'Mesh heartbeat ok' },
        ],
      })
    );
    const { loadMeshRead } = await import('./read.server');
    const payload = await loadMeshRead({
      environment: envWithOrigin('https://summer.example'),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => NOW,
    });

    expect(payload.schema).toBe('jovie.mesh-read/v1');
    expect(payload.mailboxSource).toBe('ok');
    expect(payload.watcherSource).toBe('ok');
    expect(payload.agents.map(agent => agent.id)).toEqual([
      'summer',
      'instinct',
      'chloe',
      'lola',
      'aeon',
      'stella',
      'grok-bot',
      'mesh-watcher',
    ]);

    const summer = payload.agents.find(agent => agent.id === 'summer');
    expect(summer?.lastReceivedAt).toBe('2026-10-23T18:30:00.000Z');
    expect(summer?.status).toBe('live');
    expect(summer?.recentMessages).toHaveLength(1);

    // No mailbox record for an agent still renders a row, silently stale.
    const chloe = payload.agents.find(agent => agent.id === 'chloe');
    expect(chloe?.status).toBe('stale');
    expect(chloe?.lastReceivedAt).toBeNull();

    const lola = payload.agents.find(agent => agent.id === 'lola');
    expect(lola?.gaps).toEqual(['Rotation approval pending']);
    expect(lola?.waitingOnTim).toBe('Rotation');
  });

  it('marks an agent stale when its last received message is older than the fresh window', async () => {
    fetchImpl.mockResolvedValue(
      jsonResponse({
        mailboxes: {
          summer: {
            lastSentAt: null,
            lastReceivedAt: '2026-10-22T18:59:00.000Z',
            recentMessages: [],
          },
        },
        watcherLog: [],
      })
    );
    const { loadMeshRead } = await import('./read.server');
    const payload = await loadMeshRead({
      environment: envWithOrigin('https://summer.example'),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => NOW,
    });
    expect(payload.agents.find(agent => agent.id === 'summer')?.status).toBe(
      'stale'
    );
  });

  it('degrades to unknown when the mesh endpoint is unreachable, unhappy, or malformed', async () => {
    const { loadMeshRead } = await import('./read.server');
    const options = {
      environment: envWithOrigin('https://summer.example'),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => NOW,
    };

    fetchImpl.mockRejectedValue(new Error('network down'));
    await expect(loadMeshRead(options)).resolves.toMatchObject({
      mailboxSource: 'unavailable',
      watcherSource: 'unavailable',
    });

    fetchImpl.mockResolvedValue(new Response('nope', { status: 503 }));
    await expect(loadMeshRead(options)).resolves.toMatchObject({
      mailboxSource: 'unavailable',
      watcherSource: 'unavailable',
    });

    fetchImpl.mockResolvedValue(jsonResponse('not the mesh shape'));
    await expect(loadMeshRead(options)).resolves.toMatchObject({
      mailboxSource: 'unavailable',
      watcherSource: 'unavailable',
    });
  });

  it('never surfaces token, hash, or secret fields from upstream payloads', async () => {
    fetchImpl.mockResolvedValue(
      jsonResponse({
        mailboxes: {
          summer: {
            lastSentAt: '2026-10-23T18:00:00.000Z',
            lastReceivedAt: '2026-10-23T18:30:00.000Z',
            recentMessages: [],
            tokenHash: 'deadbeef',
            senderToken: 'super-secret',
          },
        },
        watcherLog: [{ agentId: 'summer', note: 'ok', signingKey: 'k' }],
      })
    );
    const { loadMeshRead } = await import('./read.server');
    const payload: MeshReadPayload = await loadMeshRead({
      environment: envWithOrigin('https://summer.example'),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => NOW,
    });

    expect(collectForbiddenKeys(payload)).toEqual([]);
    expect(JSON.stringify(payload)).not.toContain('deadbeef');
    expect(JSON.stringify(payload)).not.toContain('super-secret');
  });
});
