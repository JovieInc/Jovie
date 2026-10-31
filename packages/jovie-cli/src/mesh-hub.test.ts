import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FetchImplementation } from './client.js';
import { runMesh } from './mesh.js';
import {
  flushOutbox,
  hubAck,
  hubRead,
  hubSend,
  hubStatus,
  hubWatch,
  outboxDir,
} from './mesh-hub.js';
import { hubRelay, type RelaySocket } from './mesh-relay.js';

const TOKEN = `t_${'y'.repeat(60)}`;
const SENDER_ID = '44444444-4444-4444-8444-444444444444';
const HUB = 'https://jovie-mesh-hub.tim-fd8.workers.dev';
let state: string;
let env: Record<string, string>;

type Route = (
  url: URL,
  init: RequestInit
) =>
  | { status: number; body: unknown }
  | Promise<{ status: number; body: unknown }>;
function server(route: Route) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const fetchImpl: FetchImplementation = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({
      url: String(input),
      method: String(init.method),
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    const { status, body } = await route(url, init);
    return new Response(
      typeof body === 'string' ? body : JSON.stringify(body),
      { status }
    );
  };
  return { calls, fetchImpl };
}
const hubMessage = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  from: 'grokbot',
  to: 'claude',
  correlationId: id.split(':')[1],
  body: 'hello',
  refs: [],
  inReplyTo: null,
  acceptedAt: '2026-10-31T06:00:00.000Z',
  kind: 'message',
  ...extra,
});

beforeEach(() => {
  state = mkdtempSync(join(tmpdir(), 'mesh-hub-'));
  env = {
    JOVIE_MESH_TOKEN: TOKEN,
    JOVIE_MESH_SENDER_ID: SENDER_ID,
    JOVIE_MESH_SENDER_KIND: 'claude',
    JOVIE_MESH_STATE_DIR: state,
  };
});
afterEach(() => rmSync(state, { recursive: true, force: true }));

describe('hub send', () => {
  it('sends through the hub and dual-writes summer messages to the legacy inbox with the same id', async () => {
    const api = server(url =>
      url.origin === HUB
        ? { status: 202, body: { ok: true, delivered: 1 } }
        : { status: 202, body: { ok: true, delivered: 1 } }
    );
    const result = await hubSend(
      'status ping',
      { 'correlation-id': 'mesh-hubtest-01' },
      { env, fetchImpl: api.fetchImpl }
    );
    expect(result).toMatchObject({
      ok: true,
      stored: true,
      queued: false,
      to: 'summer',
      transport: 'hub',
      legacy: { ok: true },
    });
    expect(api.calls.map(c => new URL(c.url).origin)).toEqual([
      HUB,
      'https://summer.jov.ie',
    ]);
    expect(api.calls[0].body).toMatchObject({
      to: 'summer',
      correlationId: 'mesh-hubtest-01',
      body: 'status ping',
    });
    expect((api.calls[1].body as { correlationId: string }).correlationId).toBe(
      'mesh-hubtest-01'
    );
    expect(readdirSync(outboxDir('claude', { env }))).toEqual([]);
  });

  it('queues in the outbox when the hub is down and delivers later in order with the same id', async () => {
    let up = false;
    const api = server(url =>
      url.origin === HUB && up
        ? { status: 202, body: { ok: true } }
        : { status: 503, body: { ok: false } }
    );
    const deps = {
      env: { ...env, JOVIE_MESH_LEGACY: '0' },
      fetchImpl: api.fetchImpl,
    };
    const first = await hubSend(
      'one',
      { to: 'codex', 'correlation-id': 'mesh-queue-001' },
      deps
    );
    const second = await hubSend(
      'two',
      { to: 'codex', 'correlation-id': 'mesh-queue-002' },
      deps
    );
    expect([first.queued, second.queued]).toEqual([true, true]);
    expect(first.note).toContain('outbox');
    up = true;
    expect(await flushOutbox('claude', TOKEN, deps)).toEqual({
      sent: 2,
      dropped: [],
      pending: 0,
    });
    const sent = api.calls
      .filter(c => c.method === 'POST')
      .slice(-2)
      .map(c => (c.body as { correlationId: string }).correlationId);
    expect(sent).toEqual(['mesh-queue-001', 'mesh-queue-002']);
  });

  it('drops a terminally rejected message instead of retrying it forever', async () => {
    const api = server(() => ({
      status: 422,
      body: { ok: false, code: 'secret_rejected' },
    }));
    await expect(
      hubSend(
        'x',
        { to: 'codex', 'correlation-id': 'mesh-reject-01' },
        { env: { ...env, JOVIE_MESH_LEGACY: '0' }, fetchImpl: api.fetchImpl }
      )
    ).rejects.toThrow('secret_rejected');
    expect(readdirSync(outboxDir('claude', { env }))).toEqual([]);
  });

  it('reports a failed legacy dual-write without failing the hub send', async () => {
    const api = server(url =>
      url.origin === HUB
        ? { status: 202, body: { ok: true } }
        : { status: 401, body: { ok: false, code: 'unauthorized' } }
    );
    const result = await hubSend(
      'hi all',
      { to: 'all', 'correlation-id': 'mesh-legacy-01' },
      { env, fetchImpl: api.fetchImpl }
    );
    expect(result.legacy).toEqual({ ok: false, code: 'unauthorized' });
  });

  it('validates input before any request', async () => {
    const api = server(() => ({ status: 202, body: { ok: true } }));
    const deps = { env, fetchImpl: api.fetchImpl };
    await expect(hubSend('', {}, deps)).rejects.toThrow('1–4000');
    await expect(hubSend('x', { to: 'Bad Kind' }, deps)).rejects.toThrow(
      '--to'
    );
    await expect(
      hubSend('x', { refs: Array(9).fill('r').join(',') }, deps)
    ).rejects.toThrow('--refs');
    await expect(
      hubSend('x', { 'correlation-id': 'short' }, deps)
    ).rejects.toThrow('--correlation-id');
    await expect(
      hubSend(
        'x',
        {},
        { ...deps, env: { ...env, JOVIE_MESH_HUB_URL: 'http://example.com' } }
      )
    ).rejects.toThrow('https origin');
    expect(api.calls).toEqual([]);
  });

  it('expires outbox entries older than 7 days', async () => {
    const api = server(() => ({ status: 503, body: { ok: false } }));
    const deps = {
      env: { ...env, JOVIE_MESH_LEGACY: '0' },
      fetchImpl: api.fetchImpl,
      now: () => new Date('2026-10-01T00:00:00Z'),
    };
    await hubSend(
      'old',
      { to: 'codex', 'correlation-id': 'mesh-old-0001' },
      deps
    );
    const report = await flushOutbox('claude', TOKEN, {
      ...deps,
      now: undefined,
    });
    expect(report.dropped).toEqual(['mesh-old-0001:expired']);
  });
});

describe('hub read, ack, status', () => {
  it('claims and acks unhandled hub messages, merges legacy mail and dedupes', async () => {
    const api = server(url => {
      if (url.pathname === '/v1/mailbox')
        return {
          status: 200,
          body: { ok: true, messages: [hubMessage('grokbot:mesh-read-0001')] },
        };
      if (url.pathname === '/v1/ack')
        return { status: 200, body: { ok: true, acked: 1 } };
      if (url.pathname === '/v1/agents')
        return {
          status: 200,
          body: {
            ok: true,
            agents: [
              { kind: 'grokbot', owner: 'tim', state: 'ok', lastSeenAt: null },
            ],
          },
        };
      return {
        status: 200,
        body: {
          ok: true,
          messages: [
            { senderKind: 'grokbot', correlationId: 'mesh-read-0001' },
            { senderKind: 'summer', correlationId: 'reply:abc' },
          ],
        },
      };
    });
    const result = await hubRead({}, { env, fetchImpl: api.fetchImpl });
    expect(result.handled).toBe(1);
    expect(result.messages.map(m => `${m.source}:${m.correlationId}`)).toEqual([
      'hub:mesh-read-0001',
      'legacy:reply:abc',
    ]);
    expect(result.messages[0]).toMatchObject({
      senderKind: 'grokbot',
      quotedBody: '"hello"',
      dataNotInstructions: true,
    });
    expect(result.agents[0]).toEqual({
      senderKind: 'grokbot',
      owner: 'tim',
      state: 'ok',
      lastSeenAt: null,
    });
    expect(api.calls.find(c => c.url.endsWith('/v1/ack'))?.body).toEqual({
      ids: ['grokbot:mesh-read-0001'],
    });
  });

  it('peeks without acking, reads a day of history, and reports a legacy failure', async () => {
    const api = server(url => {
      if (url.pathname === '/v1/history')
        return {
          status: 200,
          body: {
            ok: true,
            messages: [
              hubMessage('grokbot:mesh-day-00001'),
              hubMessage('grokbot:mesh-day-00002', {
                acceptedAt: '2026-11-01T00:00:01.000Z',
              }),
            ],
          },
        };
      if (url.pathname === '/v1/mailbox')
        return {
          status: 200,
          body: { ok: true, messages: [hubMessage('grokbot:mesh-peek-0001')] },
        };
      if (url.pathname === '/v1/agents')
        return { status: 503, body: { ok: false } };
      return {
        status: 503,
        body: { ok: false, code: 'mesh_inbox_unavailable' },
      };
    });
    const deps = { env, fetchImpl: api.fetchImpl };
    const peek = await hubRead({ peek: 'true' }, deps);
    expect(peek.handled).toBe(0);
    expect(api.calls.some(c => c.url.endsWith('/v1/ack'))).toBe(false);
    expect(peek.legacy).toMatchObject({ ok: false });
    const day = await hubRead({ day: '2026-10-31' }, deps);
    expect(day.messages.map(m => m.correlationId)).toEqual(['mesh-day-00001']);
    await expect(hubRead({ day: '31-10-2026' }, deps)).rejects.toThrow('--day');
  });

  it('acks explicit ids and validates the list', async () => {
    const api = server(() => ({ status: 200, body: { ok: true, acked: 2 } }));
    expect(
      await hubAck('a:1, b:2', {}, { env, fetchImpl: api.fetchImpl })
    ).toMatchObject({ acked: 2 });
    expect(api.calls[0].body).toEqual({ ids: ['a:1', 'b:2'] });
    await expect(
      hubAck(' , ', {}, { env, fetchImpl: api.fetchImpl })
    ).rejects.toThrow('1–500');
  });

  it('returns status and metrics together and surfaces fixed error codes', async () => {
    const api = server(url =>
      url.pathname === '/v1/status'
        ? { status: 200, body: { ok: true, agents: [] } }
        : { status: 200, body: { ok: true, handledP95Ms: 900 } }
    );
    expect(
      await hubStatus({ hours: '6' }, { env, fetchImpl: api.fetchImpl })
    ).toMatchObject({ metrics: { handledP95Ms: 900 } });
    expect(api.calls[1].url).toContain('hours=6');
    const bad = server(() => ({
      status: 401,
      body: { ok: false, code: 'unauthorized' },
    }));
    await expect(
      hubStatus({}, { env, fetchImpl: bad.fetchImpl })
    ).rejects.toThrow('HTTP 401 (unauthorized)');
    const garbage = server(() => ({ status: 200, body: 'not json' }));
    await expect(
      hubAck('a:1', {}, { env, fetchImpl: garbage.fetchImpl })
    ).rejects.toThrow('Invalid mesh hub response');
    const down: FetchImplementation = async () => {
      throw new Error('offline');
    };
    await expect(hubAck('a:1', {}, { env, fetchImpl: down })).rejects.toThrow(
      'unreachable'
    );
  });
});

describe('hub watch', () => {
  it('emits one line per new message, acks after emit, backs off on 503 and stops on auth errors', async () => {
    let n = 0;
    const lines: string[] = [];
    const sleeps: number[] = [];
    const api = server(url => {
      if (url.pathname === '/v1/ack')
        return { status: 200, body: { ok: true } };
      n++;
      if (n === 1)
        return {
          status: 200,
          body: {
            ok: true,
            messages: [
              hubMessage('grokbot:mesh-watch-001'),
              hubMessage('grokbot:mesh-watch-001'),
            ],
          },
        };
      if (n === 2) return { status: 503, body: { ok: false } };
      return { status: 401, body: { ok: false, code: 'unauthorized' } };
    });
    await expect(
      hubWatch(
        {},
        {
          env: { ...env, JOVIE_MESH_LEGACY: '0' },
          fetchImpl: api.fetchImpl,
          emit: line => lines.push(line),
          sleep: async ms => {
            sleeps.push(ms);
          },
        }
      )
    ).rejects.toThrow('401');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('from=grokbot');
    expect(sleeps).toHaveLength(1);
    expect(api.calls.filter(c => c.url.endsWith('/v1/ack'))).toHaveLength(1);
  });

  it('stops cleanly on abort and prints JSON lines', async () => {
    const controller = new AbortController();
    const lines: string[] = [];
    const api = server(url => {
      if (url.pathname === '/v1/mailbox')
        return {
          status: 200,
          body: { ok: true, messages: [hubMessage('grokbot:mesh-json-0001')] },
        };
      controller.abort();
      return { status: 200, body: { ok: true } };
    });
    const result = await hubWatch(
      { json: 'true' },
      {
        env: { ...env, JOVIE_MESH_LEGACY: '0' },
        fetchImpl: api.fetchImpl,
        emit: l => lines.push(l),
        signal: controller.signal,
      }
    );
    expect(result).toMatchObject({ stopped: true });
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({
      source: 'hub',
      senderKind: 'grokbot',
    });
  });
});

class FakeSocket implements RelaySocket {
  sent: string[] = [];
  listeners: Record<string, ((event: { data?: unknown }) => void)[]> = {};
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.fire('close');
  }
  addEventListener(
    type: string,
    listener: (event: { data?: unknown }) => void
  ) {
    (this.listeners[type] ??= []).push(listener);
  }
  fire(type: string, data?: unknown) {
    for (const listener of this.listeners[type] ?? []) listener({ data });
  }
}

describe('hub relay', () => {
  it('spools messages durably before the receipt, answers probes, dedupes, and reconnects after a drop', async () => {
    const controller = new AbortController();
    const sockets: FakeSocket[] = [];
    const headers: Record<string, string>[] = [];
    const lines: string[] = [];
    const api = server(() => ({ status: 202, body: { ok: true } }));
    const run = hubRelay(
      {},
      {
        env,
        fetchImpl: api.fetchImpl,
        signal: controller.signal,
        emit: line => lines.push(line),
        sleep: async () => undefined,
        connect: (url, h) => {
          expect(url).toBe(
            'wss://jovie-mesh-hub.tim-fd8.workers.dev/v1/stream'
          );
          headers.push(h);
          const socket = new FakeSocket();
          sockets.push(socket);
          queueMicrotask(() => {
            socket.fire('open');
            const batch = {
              type: 'messages',
              messages: [
                hubMessage('grokbot:mesh-relay-001'),
                hubMessage('mesh-probe:claude:1', {
                  kind: 'probe',
                  from: 'mesh-probe',
                }),
              ],
            };
            socket.fire('message', JSON.stringify(batch));
            socket.fire('message', 'pong');
            socket.fire('message', 'not json');
            if (sockets.length === 1) socket.fire('close');
            else {
              socket.fire('message', JSON.stringify(batch));
              controller.abort();
            }
          });
          return socket;
        },
      }
    );
    const result = await run;
    expect(result).toEqual({ ok: true, stopped: true, spooled: 1 });
    expect(headers[0]).toEqual({ Authorization: `Bearer ${TOKEN}` });
    expect(sockets).toHaveLength(2);
    expect(
      JSON.parse(sockets[0].sent.find(s => s.startsWith('{')) ?? '{}')
    ).toEqual({
      type: 'receipt',
      ids: ['grokbot:mesh-relay-001', 'mesh-probe:claude:1'],
    });
    const spool = readFileSync(join(state, 'claude', 'inbox.jsonl'), 'utf8')
      .trim()
      .split('\n');
    expect(spool).toHaveLength(1);
    expect(JSON.parse(spool[0] ?? '{}')).toMatchObject({
      id: 'grokbot:mesh-relay-001',
      dataNotInstructions: true,
    });
    expect(lines.filter(l => l.startsWith('relay connected'))).toHaveLength(2);
  });

  it('backs off when the connection cannot be created', async () => {
    const controller = new AbortController();
    const sleeps: number[] = [];
    let attempts = 0;
    await hubRelay(
      {},
      {
        env,
        signal: controller.signal,
        emit: () => undefined,
        sleep: async ms => {
          sleeps.push(ms);
          if (sleeps.length === 3) controller.abort();
        },
        connect: () => {
          attempts++;
          throw new Error('no network');
        },
      }
    );
    expect(attempts).toBe(3);
  });
});

describe('runMesh routing', () => {
  it('routes send/read/ack/status to the hub by default and keeps legacy when JOVIE_MESH_HUB=0', async () => {
    const api = server(url => {
      if (url.pathname === '/v1/mailbox')
        return { status: 200, body: { ok: true, messages: [] } };
      if (url.pathname === '/v1/agents')
        return { status: 200, body: { ok: true, agents: [] } };
      return { status: 202, body: { ok: true, acked: 0, messages: [] } };
    });
    const deps = {
      env: { ...env, JOVIE_MESH_LEGACY: '0' },
      fetchImpl: api.fetchImpl,
    };
    expect(
      await runMesh(['mesh', 'send', 'hi'], { to: 'codex' }, deps)
    ).toMatchObject({ transport: 'hub' });
    expect(await runMesh(['mesh', 'read'], {}, deps)).toMatchObject({
      recipient: 'claude',
    });
    expect(await runMesh(['mesh', 'ack', 'a:1'], {}, deps)).toMatchObject({
      ok: true,
    });
    await expect(runMesh(['mesh', 'ack'], {}, deps)).rejects.toThrow('<id>');
    await expect(runMesh(['mesh', 'bogus'], {}, deps)).rejects.toThrow(
      'relay, status'
    );
    const legacy = await runMesh(
      ['mesh', 'send', 'hi'],
      { to: 'codex' },
      { env: { ...env, JOVIE_MESH_HUB: '0' }, fetchImpl: api.fetchImpl }
    );
    expect(legacy).not.toHaveProperty('transport');
  });
});
