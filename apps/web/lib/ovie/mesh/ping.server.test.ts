import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { MESH_PING_SCHEMA, sendMeshPing } from './ping.server';

const ORIGIN = 'https://summer.example';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('sendMeshPing', () => {
  it('posts a jovie.mesh-ping/v1 test message to the Summer mesh endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const sentAt = Date.parse('2026-10-23T19:00:00.000Z');

    const result = await sendMeshPing({
      agentId: 'lola',
      origin: ORIGIN,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => sentAt,
    });

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://summer.example/summer/v1/mesh');
    expect(init?.method).toBe('POST');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(init?.body as string);
    expect(body).toEqual({
      schema: 'jovie.mesh-ping/v1',
      type: 'ping',
      agentId: 'lola',
      sentAt: '2026-10-23T19:00:00.000Z',
    });
  });

  it('exposes the ping schema constant', () => {
    expect(MESH_PING_SCHEMA).toBe('jovie.mesh-ping/v1');
  });

  it('reports upstream rejection instead of throwing', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('nope', { status: 503 }));
    const result = await sendMeshPing({
      agentId: 'summer',
      origin: ORIGIN,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => 0,
    });
    expect(result).toEqual({ ok: false, reason: 'upstream-error' });
  });

  it('reports network failure instead of throwing', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('down'));
    const result = await sendMeshPing({
      agentId: 'summer',
      origin: ORIGIN,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => 0,
    });
    expect(result).toEqual({ ok: false, reason: 'upstream-unreachable' });
  });
});
