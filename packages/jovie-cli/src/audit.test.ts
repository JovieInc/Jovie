import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseLimit, parseSince } from './audit.js';
import { runCli } from './cli.js';
import type { FetchImplementation } from './client.js';
import { handleMcpMessage } from './mcp.js';

const EVENT = {
  id: 'e1',
  ts: '2026-10-29T10:00:00.000Z',
  actor_agent: 'claude-lane-3',
  session_id: 's1',
  host: 'gem',
  repo: 'JovieInc/Jovie',
  target: 'JovieInc/Jovie#123',
  action: 'pr.merge',
  danger: 1,
  reason: 'queue drained',
  issue: null,
  outcome: 'ok',
  before: null,
  after: null,
  source: 'gh-shim',
};
const UNATTRIBUTED = {
  id: 'c1',
  observed_at: '2026-10-29T11:00:00.000Z',
  repo: 'JovieInc/Jovie',
  target: 'JovieInc/Jovie#124',
  change: 'label.add',
  github_actor: 'itstimwhite',
  matched_event_id: null,
  status: 'unattributed',
};
const WHO = { ok: true, events: [EVENT], correlations: [UNATTRIBUTED] };
const SUMMARY = {
  ok: true,
  budget: { bytes_month: 1024, limit_bytes: 4096, pct: 25 },
  dangerous: [EVENT],
  unattributed: [UNATTRIBUTED],
  counts: { events_24h: 4, events_7d: 30 },
};

function server(body: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl: FetchImplementation = async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(JSON.stringify(body), { status });
  };
  return { calls, fetchImpl };
}

function out() {
  let value = '';
  return {
    output: {
      write(chunk: string) {
        value += chunk;
        return true;
      },
    },
    read: () => value,
  };
}

beforeEach(() => {
  vi.stubEnv('FLEET_AUDIT_READ_TOKEN', 'read-secret');
  vi.stubEnv('FLEET_AUDIT_URL', '');
});
afterEach(() => vi.unstubAllEnvs());

describe('parseSince / parseLimit', () => {
  it('parses durations and ISO, rejects junk', () => {
    const now = new Date('2026-10-29T12:00:00.000Z');
    expect(parseSince('7d', now)).toBe('2026-10-22T12:00:00.000Z');
    expect(parseSince('24h', now)).toBe('2026-10-28T12:00:00.000Z');
    expect(parseSince('2026-10-01', now)).toBe('2026-10-01T00:00:00.000Z');
    expect(() => parseSince('yesterday', now)).toThrow(/--since/);
  });

  it('bounds limit', () => {
    expect(parseLimit(undefined)).toBe(50);
    expect(parseLimit('200')).toBe(200);
    expect(() => parseLimit('201')).toThrow(/--limit/);
    expect(() => parseLimit('0')).toThrow(/--limit/);
  });
});

describe('jovie audit who', () => {
  it('queries the worker with bearer auth and prints a table with flagged unattributed', async () => {
    const api = server(WHO);
    const stdout = out();
    const code = await runCli(
      ['audit', 'who', 'Jovie#123', '--since', '7d', '--limit', '10'],
      { stdout: stdout.output, fetchImpl: api.fetchImpl }
    );
    expect(code).toBe(0);
    const url = new URL(api.calls[0]?.url ?? '');
    expect(url.origin).toBe('https://jovie-fleet-audit.tim-fd8.workers.dev');
    expect(url.pathname).toBe('/v1/who');
    expect(url.searchParams.get('target')).toBe('Jovie#123');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(Date.parse(url.searchParams.get('since') ?? '')).not.toBeNaN();
    expect(
      (api.calls[0]?.init.headers as Record<string, string>).Authorization
    ).toBe('Bearer read-secret');
    const text = stdout.read();
    expect(text).toContain('claude-lane-3');
    expect(text).toContain('! pr.merge');
    expect(text).toContain('queue drained');
    expect(text).toContain('UNATTRIBUTED (1)');
    expect(text).toContain('itstimwhite');
    expect(text).not.toContain('read-secret');
  });

  it('prints raw JSON with --json', async () => {
    const api = server(WHO);
    const stdout = out();
    await runCli(['audit', 'who', 'x', '--json'], {
      stdout: stdout.output,
      fetchImpl: api.fetchImpl,
    });
    expect(JSON.parse(stdout.read())).toEqual(WHO);
  });

  it('fails clearly when the token is missing, without a request', async () => {
    vi.stubEnv('FLEET_AUDIT_READ_TOKEN', '');
    const api = server(WHO);
    const stderr = out();
    const code = await runCli(['audit', 'who', 'x'], {
      stdout: out().output,
      stderr: stderr.output,
      fetchImpl: api.fetchImpl,
    });
    expect(code).toBe(2);
    expect(stderr.read()).toContain('FLEET_AUDIT_READ_TOKEN is not set');
    expect(api.calls).toHaveLength(0);
  });

  it('reports a rejected token and honors FLEET_AUDIT_URL', async () => {
    vi.stubEnv('FLEET_AUDIT_URL', 'http://127.0.0.1:8787');
    const api = server({ ok: false }, 401);
    const stderr = out();
    const code = await runCli(['audit', 'who', 'x'], {
      stdout: out().output,
      stderr: stderr.output,
      fetchImpl: api.fetchImpl,
    });
    expect(code).toBe(1);
    expect(api.calls[0]?.url.startsWith('http://127.0.0.1:8787/v1/who')).toBe(
      true
    );
    expect(stderr.read()).toContain('rejected FLEET_AUDIT_READ_TOKEN');
  });

  it('rejects a non-https audit URL', async () => {
    vi.stubEnv('FLEET_AUDIT_URL', 'http://audit.example.com');
    const stderr = out();
    const code = await runCli(['audit', 'who', 'x'], {
      stdout: out().output,
      stderr: stderr.output,
      fetchImpl: server(WHO).fetchImpl,
    });
    expect(code).toBe(2);
    expect(stderr.read()).toContain('FLEET_AUDIT_URL');
  });

  it('rejects an out-of-range limit before any request', async () => {
    const api = server(WHO);
    const code = await runCli(['audit', 'who', 'x', '--limit', '500'], {
      stdout: out().output,
      stderr: out().output,
      fetchImpl: api.fetchImpl,
    });
    expect(code).toBe(2);
    expect(api.calls).toHaveLength(0);
  });
});

describe('jovie audit summary', () => {
  it('prints budget, dangerous actions and unattributed changes', async () => {
    const api = server(SUMMARY);
    const stdout = out();
    const code = await runCli(['audit', 'summary'], {
      stdout: stdout.output,
      fetchImpl: api.fetchImpl,
    });
    expect(code).toBe(0);
    expect(new URL(api.calls[0]?.url ?? '').pathname).toBe('/v1/summary');
    const text = stdout.read();
    expect(text).toContain('25.0%');
    expect(text).toContain('4 in 24h');
    expect(text).toContain('DANGEROUS ACTIONS');
    expect(text).toContain('UNATTRIBUTED (1)');
  });
});

describe('MCP audit tools', () => {
  const base = (fetchImpl: FetchImplementation) => ({
    version: '0.0.0-test',
    baseUrl: 'https://jov.ie',
    fetchImpl,
  });

  it('lists audit_who and audit_summary as read-only', async () => {
    const response = await handleMcpMessage(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      base(server(WHO).fetchImpl)
    );
    const tools = (
      response?.result as {
        tools: { name: string; annotations: { readOnlyHint: boolean } }[];
      }
    ).tools;
    for (const name of ['audit_who', 'audit_summary'])
      expect(
        tools.find(tool => tool.name === name)?.annotations.readOnlyHint
      ).toBe(true);
  });

  it('audit_who returns structured events', async () => {
    const api = server(WHO);
    const response = await handleMcpMessage(
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'audit_who',
          arguments: { target: 'Jovie#123', since: '24h', limit: '5' },
        },
      },
      base(api.fetchImpl)
    );
    const result = response?.result as {
      structuredContent: typeof WHO;
      isError?: boolean;
    };
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent.events[0]?.actor_agent).toBe(
      'claude-lane-3'
    );
    expect(new URL(api.calls[0]?.url ?? '').searchParams.get('limit')).toBe(
      '5'
    );
  });

  it('audit_summary surfaces a missing token as a tool error', async () => {
    vi.stubEnv('FLEET_AUDIT_READ_TOKEN', '');
    const response = await handleMcpMessage(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'audit_summary', arguments: {} },
      },
      base(server(SUMMARY).fetchImpl)
    );
    const result = response?.result as {
      isError: boolean;
      content: { text: string }[];
    };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('FLEET_AUDIT_READ_TOKEN');
  });
});
