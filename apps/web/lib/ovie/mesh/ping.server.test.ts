import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  MESH_INBOX_PATH,
  MESH_PING_SCHEMA,
  meshCredentialsFromEnv,
  sendMeshPing,
} from './ping.server';

const ORIGIN = 'https://summer.jov.ie';
const CREDENTIALS = {
  token: 'test-mesh-bearer',
  senderId: '0f0e0d0c-0b0a-4009-8008-700600500400',
  senderKind: 'jovie-web',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('meshCredentialsFromEnv', () => {
  it('resolves the CLI env-first contract and rejects incomplete sets', () => {
    expect(
      meshCredentialsFromEnv({
        JOVIE_MESH_TOKEN: 't',
        JOVIE_MESH_SENDER_ID: CREDENTIALS.senderId,
        JOVIE_MESH_SENDER_KIND: 'jovie-web',
      })
    ).toEqual({
      token: 't',
      senderId: CREDENTIALS.senderId,
      senderKind: 'jovie-web',
    });
    expect(meshCredentialsFromEnv({})).toBeNull();
    expect(
      meshCredentialsFromEnv({
        JOVIE_MESH_TOKEN: 't',
        JOVIE_MESH_SENDER_ID: 'not-a-uuid',
        JOVIE_MESH_SENDER_KIND: 'jovie-web',
      })
    ).toBeNull();
  });
});

describe('sendMeshPing', () => {
  it('posts a jovie.mesh-ping/v1 test message to the real mesh inbox', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const sentAt = Date.parse('2026-10-23T19:00:00.000Z');

    const result = await sendMeshPing({
      agentKind: 'lola',
      origin: ORIGIN,
      credentials: CREDENTIALS,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => sentAt,
    });

    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`https://summer.jov.ie${MESH_INBOX_PATH}`);
    expect(init?.method).toBe('POST');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${CREDENTIALS.token}`
    );
    const sent = JSON.parse(init?.body as string);
    expect(sent.senderId).toBe(CREDENTIALS.senderId);
    expect(sent.senderKind).toBe(CREDENTIALS.senderKind);
    expect(sent.to).toBe('lola');
    expect(sent.refs).toEqual([]);
    expect(sent.timestamp).toBe('2026-10-23T19:00:00.000Z');
    expect(sent.correlationId).toMatch(/^mesh-ping-/);
    expect(sent.body.startsWith(`${MESH_PING_SCHEMA} `)).toBe(true);
    expect(MESH_PING_SCHEMA).toBe('jovie.mesh-ping/v1');
    expect(sent.sha256).toBe(
      createHash('sha256').update(sent.body).digest('hex')
    );
  });

  it('reports upstream rejection instead of throwing', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('nope', { status: 503 }));
    const result = await sendMeshPing({
      agentKind: 'summer',
      origin: ORIGIN,
      credentials: CREDENTIALS,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => 0,
    });
    expect(result).toEqual({ ok: false, reason: 'upstream-error' });
  });

  it('reports network failure instead of throwing', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('down'));
    const result = await sendMeshPing({
      agentKind: 'summer',
      origin: ORIGIN,
      credentials: CREDENTIALS,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => 0,
    });
    expect(result).toEqual({ ok: false, reason: 'upstream-unreachable' });
  });
});
