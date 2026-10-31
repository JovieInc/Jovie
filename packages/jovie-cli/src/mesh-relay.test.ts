import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const launchctl = vi.hoisted(() => ({
  calls: [] as string[][],
  failBootout: false,
}));
vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execFileSync: (command: string, args: string[]) => {
      if (command !== 'launchctl') throw new Error(`unexpected ${command}`);
      launchctl.calls.push(args);
      if (args[0] === 'bootout' && launchctl.failBootout)
        throw new Error('not loaded');
      return Buffer.from('');
    },
  };
});

import type { FetchImplementation } from './client.js';
import { hubWatch } from './mesh-hub.js';
import { hubRelay, installRelay, type RelaySocket } from './mesh-relay.js';

const TOKEN = `t_${'z'.repeat(60)}`;
const SENDER_ID = '55555555-5555-4555-8555-555555555555';
let state: string;
let env: Record<string, string>;
const realPlatform = process.platform;

class Socket implements RelaySocket {
  sent: string[] = [];
  closed = 0;
  failSend = false;
  listeners: Record<string, ((event: { data?: unknown }) => void)[]> = {};
  send(data: string) {
    if (this.failSend) throw new Error('socket is closing');
    this.sent.push(data);
  }
  close() {
    this.closed++;
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

function setPlatform(value: string) {
  Object.defineProperty(process, 'platform', { value, configurable: true });
}

beforeEach(() => {
  state = mkdtempSync(join(tmpdir(), 'mesh-relay-'));
  env = {
    JOVIE_MESH_TOKEN: TOKEN,
    JOVIE_MESH_SENDER_ID: SENDER_ID,
    JOVIE_MESH_SENDER_KIND: 'claude',
    JOVIE_MESH_STATE_DIR: state,
    HOME: state,
  };
  launchctl.calls = [];
  launchctl.failBootout = false;
});
afterEach(() => {
  setPlatform(realPlatform);
  vi.useRealTimers();
  rmSync(state, { recursive: true, force: true });
});

describe('relay launchd install', () => {
  it('refuses to install outside macOS and says what to do instead', () => {
    setPlatform('linux');
    expect(() => installRelay('claude', { env })).toThrow(/macOS launchd only/);
    expect(launchctl.calls).toEqual([]);
  });

  it('writes a KeepAlive plist with escaped arguments and bootstraps it after a bootout', () => {
    setPlatform('darwin');
    const result = installRelay('claude', { env });
    expect(result).toMatchObject({
      ok: true,
      installed: true,
      label: 'ie.jov.mesh-relay.claude',
    });
    const plist = readFileSync(result.plist, 'utf8');
    expect(plist).toContain('<key>KeepAlive</key><true/>');
    expect(plist).toContain('<string>relay</string>');
    expect(plist).toContain('<string>claude</string>');
    expect(
      result.plist.startsWith(join(state, 'Library', 'LaunchAgents'))
    ).toBe(true);
    expect(result.log).toBe(join(state, 'claude', 'relay.log'));
    expect(launchctl.calls.map(call => call[0])).toEqual([
      'bootout',
      'bootstrap',
    ]);
  });

  it('still bootstraps when the agent was not loaded yet', () => {
    setPlatform('darwin');
    launchctl.failBootout = true;
    installRelay('claude', { env });
    expect(launchctl.calls.map(call => call[0])).toEqual([
      'bootout',
      'bootstrap',
    ]);
  });

  it('routes --install through hubRelay without opening a socket', async () => {
    setPlatform('darwin');
    const connect = vi.fn();
    const result = await hubRelay({ install: 'true' }, { env, connect });
    expect(result).toMatchObject({ installed: true });
    expect(connect).not.toHaveBeenCalled();
    expect(existsSync(join(state, 'Library', 'LaunchAgents'))).toBe(true);
  });
});

describe('relay socket lifecycle', () => {
  it('pings every 20s, flushes the outbox every 30s, and closes a socket that errors', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const socket = new Socket();
    const flushed: string[] = [];
    const fetchImpl: FetchImplementation = async input => {
      flushed.push(String(input));
      return new Response('{}', { status: 202 });
    };
    const run = hubRelay(
      {},
      {
        env,
        fetchImpl,
        signal: controller.signal,
        emit: () => undefined,
        sleep: async () => undefined,
        connect: () => {
          queueMicrotask(() => socket.fire('open'));
          return socket;
        },
      }
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(socket.sent.filter(s => s === 'ping')).toHaveLength(3);
    socket.failSend = true;
    await vi.advanceTimersByTimeAsync(20_000);
    socket.fire('error');
    expect(socket.closed).toBeGreaterThanOrEqual(1);
    controller.abort();
    await vi.advanceTimersByTimeAsync(1);
    await run;
  });

  it('keeps the spool and the seen-set when a receipt cannot be sent', async () => {
    const controller = new AbortController();
    const socket = new Socket();
    socket.failSend = true;
    const lines: string[] = [];
    const message = {
      id: 'grokbot:relay-receipt-1',
      from: 'grokbot',
      to: 'claude',
      kind: 'message',
      correlationId: 'relay-receipt-1',
      acceptedAt: '2026-10-31T06:00:00.000Z',
      body: 'hello',
    };
    const result = await hubRelay(
      {},
      {
        env,
        signal: controller.signal,
        emit: line => lines.push(line),
        sleep: async () => undefined,
        connect: () => {
          queueMicrotask(() => {
            socket.fire('open');
            socket.fire('message', JSON.stringify({ type: 'other' }));
            socket.fire(
              'message',
              JSON.stringify({ type: 'messages', messages: 'nope' })
            );
            socket.fire(
              'message',
              JSON.stringify({ type: 'messages', messages: [message] })
            );
            controller.abort();
          });
          return socket;
        },
      }
    );
    expect(result).toEqual({ ok: true, stopped: true, spooled: 1 });
    expect(lines.some(l => l.includes('id=relay-receipt-1'))).toBe(true);
    const spool = readFileSync(join(state, 'claude', 'inbox.jsonl'), 'utf8');
    expect(spool).toContain('relay-receipt-1');
  });
});

describe('default seams', () => {
  it('opens the stream with the bearer in the init headers, never in the URL', async () => {
    const controller = new AbortController();
    const seen: { url: string; init: { headers: Record<string, string> } }[] =
      [];
    class StubWebSocket extends Socket {
      constructor(url: string, init: { headers: Record<string, string> }) {
        super();
        seen.push({ url, init });
        queueMicrotask(() => {
          this.fire('open');
          controller.abort();
        });
      }
    }
    vi.stubGlobal('WebSocket', StubWebSocket);
    try {
      await hubRelay(
        {},
        {
          env,
          fetchImpl: async () => new Response('{}', { status: 202 }),
          signal: controller.signal,
          emit: () => undefined,
          sleep: async () => undefined,
        }
      );
    } finally {
      vi.unstubAllGlobals();
    }
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe(
      'wss://jovie-mesh-hub.tim-fd8.workers.dev/v1/stream'
    );
    expect(seen[0]?.url).not.toContain(TOKEN);
    expect(seen[0]?.init.headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
  });

  it('waits with its own jittered sleep between failed connects when no sleep is injected', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let attempts = 0;
    const run = hubRelay(
      {},
      {
        env,
        signal: controller.signal,
        emit: () => undefined,
        connect: () => {
          attempts++;
          if (attempts === 2) controller.abort();
          throw new Error('no network');
        },
      }
    );
    await vi.advanceTimersByTimeAsync(5_000);
    await run;
    expect(attempts).toBe(2);
  });

  it('watch ends its default backoff sleep as soon as the signal aborts', async () => {
    const controller = new AbortController();
    let calls = 0;
    const fetchImpl: FetchImplementation = async () => {
      calls++;
      queueMicrotask(() => setTimeout(() => controller.abort(), 5));
      return new Response(JSON.stringify({ ok: false }), { status: 503 });
    };
    const started = Date.now();
    const result = await hubWatch(
      {},
      {
        env: { ...env, JOVIE_MESH_LEGACY: '0' },
        fetchImpl,
        emit: () => undefined,
        signal: controller.signal,
      }
    );
    expect(result).toMatchObject({ stopped: true });
    expect(calls).toBe(1);
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
