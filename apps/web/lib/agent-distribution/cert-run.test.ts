import { describe, expect, it } from 'vitest';
import { normalizeBase, runCert } from './cert-run';

interface Scenario {
  claimUrl?: string;
  claimStatus?: number;
  rateLimit?: boolean;
  sse?: boolean;
  titles?: boolean;
  noCandidates?: boolean;
}

const TOOLS = [
  'artist.search_or_import',
  'workspace.create_draft',
  'release.prepare_launch',
];

function fakeMcp(scenario: Scenario = {}) {
  const seen: {
    method: string;
    name?: string;
    args?: Record<string, unknown>;
  }[] = [];
  const reply = (doc: unknown, status = 200) => {
    const text = scenario.sse
      ? `event: message\ndata: ${JSON.stringify(doc)}\n\n`
      : JSON.stringify(doc);
    return new Response(text, { status });
  };
  const fetchImpl = (async (
    url: string | URL | Request,
    init?: RequestInit
  ) => {
    if (init?.method !== 'POST') {
      return new Response('ok', { status: scenario.claimStatus ?? 200 });
    }
    const body = JSON.parse(String(init.body));
    const { method, params, id } = body;
    seen.push({ method, name: params?.name, args: params?.arguments });
    if (scenario.rateLimit && method === 'tools/call')
      return reply({ error: 'RATE_LIMITED' }, 429);
    const ok = (result: unknown) => reply({ jsonrpc: '2.0', id, result });
    const tool = (data: Record<string, unknown>) =>
      ok({ structuredContent: data, isError: data.status === 'error' });
    if (method === 'initialize') return ok({ protocolVersion: '2025-06-18' });
    if (method === 'tools/list')
      return ok({
        tools: TOOLS.map(name => ({
          name,
          description: 'Does a thing.',
          ...(scenario.titles ? { title: name } : {}),
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            openWorldHint: true,
          },
        })),
      });
    const args = params?.arguments ?? {};
    if (params?.name === 'artist.search_or_import') {
      if (!args.input) return tool({ status: 'error', code: 'INVALID_INPUT' });
      if (String(args.input).startsWith('https://'))
        return tool({
          status: 'resolved',
          artist: { artist_id: 'spotify:abc' },
          draft_token: 'tok',
          draft_id: 'd1',
        });
      return tool(
        scenario.noCandidates
          ? { status: 'needs_selection', candidates: [] }
          : {
              status: 'needs_selection',
              candidates: [
                { source_url: 'https://open.spotify.com/artist/abc' },
              ],
            }
      );
    }
    if (params?.name === 'workspace.create_draft') {
      if (args.draft_token !== 'tok' || args.artist_id !== 'spotify:abc')
        return tool({ status: 'error', code: 'DRAFT_UNAVAILABLE' });
      return tool({
        status: 'ok',
        draft_id: 'd1',
        ...(scenario.claimUrl ? { claim_url: scenario.claimUrl } : {}),
      });
    }
    if (params?.name === 'release.prepare_launch')
      return args.release_url
        ? tool({ status: 'launch_draft_ready' })
        : tool({
            status: 'error',
            code: 'INVALID_INPUT',
            field: 'release_url',
          });
    return reply({
      jsonrpc: '2.0',
      id,
      error: { code: -32602, message: 'Unknown tool' },
    });
  }) as typeof fetch;
  return { fetchImpl, seen };
}

const base = {
  base: 'https://jov.ie',
  query: 'Nova',
  releaseUrl: 'https://open.spotify.com/track/x',
  run: 'cert-test',
  now: () => new Date('2026-01-01T00:00:00Z'),
};
const statusOf = (checks: { check: string; status: string }[], name: string) =>
  checks.find(c => c.check === name)?.status;

describe('runCert', () => {
  it('normalizes the base URL', () => {
    expect(normalizeBase('https://jov.ie/')).toBe('https://jov.ie/api/mcp');
    expect(normalizeBase('https://jov.ie/api/mcp')).toBe(
      'https://jov.ie/api/mcp'
    );
  });

  it('passes the happy path, tags acquisition and reads SSE framing', async () => {
    const { fetchImpl, seen } = fakeMcp({
      claimUrl: 'https://jov.ie/claim/x',
      sse: true,
      titles: true,
    });
    const { receipt, exitCode } = await runCert({ ...base, fetchImpl });
    expect(exitCode).toBe(0);
    expect(receipt.ok).toBe(true);
    expect(receipt.checks.filter(c => c.status === 'FAIL')).toEqual([]);
    expect(receipt.passed).toBe(receipt.total);
    expect(receipt.at).toBe('2026-01-01T00:00:00.000Z');
    expect(receipt.toolsListHash).toMatch(/^[0-9a-f]{64}$/);
    const search = seen.find(s => s.name === 'artist.search_or_import');
    expect(
      (search?.args?.acquisition as { agent_source: string }).agent_source
    ).toBe('jovie-cert-harness');
    expect(
      receipt.latency['artist.search_or_import']?.count
    ).toBeGreaterThanOrEqual(3);
  });

  it('reports a missing claim_url and missing titles as FAIL without crashing', async () => {
    const { fetchImpl } = fakeMcp();
    const { receipt, exitCode } = await runCert({ ...base, fetchImpl });
    expect(exitCode).toBe(1);
    expect(receipt.ok).toBe(false);
    expect(statusOf(receipt.checks, 'claim_url present and resolves')).toBe(
      'FAIL'
    );
    expect(statusOf(receipt.checks, 'tools have titles')).toBe('FAIL');
    expect(statusOf(receipt.checks, 'create_draft is idempotent')).toBe('PASS');
    expect(
      statusOf(receipt.checks, 'token for another artist is rejected')
    ).toBe('PASS');
    expect(
      statusOf(receipt.checks, 'missing release input gives a useful error')
    ).toBe('PASS');
  });

  it('fails when the claim_url does not resolve', async () => {
    const { fetchImpl } = fakeMcp({
      claimUrl: 'https://jov.ie/claim/x',
      claimStatus: 404,
      titles: true,
    });
    const { receipt, exitCode } = await runCert({ ...base, fetchImpl });
    expect(exitCode).toBe(1);
    expect(statusOf(receipt.checks, 'claim_url resolves')).toBe('FAIL');
  });

  it('reports RATE_LIMITED distinctly and exits 75', async () => {
    const { fetchImpl } = fakeMcp({ rateLimit: true, titles: true });
    const { receipt, exitCode } = await runCert({ ...base, fetchImpl });
    expect(receipt.rateLimited).toBe(true);
    expect(
      statusOf(receipt.checks, 'search by name returns candidates or a match')
    ).toBe('RATE_LIMITED');
    expect(receipt.checks.some(c => c.status === 'SKIP')).toBe(true);
    expect(exitCode).toBe(75);
    expect(receipt.ok).toBe(false);
  });

  it('skips dependent checks when no candidates come back', async () => {
    const { fetchImpl } = fakeMcp({ noCandidates: true, titles: true });
    const { receipt } = await runCert({ ...base, fetchImpl });
    expect(
      statusOf(receipt.checks, 'create_draft / idempotency / cross-artist')
    ).toBe('SKIP');
    expect(statusOf(receipt.checks, 'prepare_launch')).toBe('SKIP');
  });
});
