import { createApiClient, MemoryLedgerStore } from '@jovie/api-client';
import { vi } from 'vitest';

import type { ResearchResult } from './types.ts';

export function sampleResult(
  overrides: Partial<ResearchResult> = {}
): ResearchResult {
  return {
    schema: 'jovie-research-result/v1',
    query: 'exa pricing',
    key: 'k1',
    freshness: 'month',
    mode: 'standard',
    createdAt: '2026-10-20T00:00:00.000Z',
    expiresAt: '2026-11-03T00:00:00.000Z',
    cache: 'miss',
    stoppedAtTier: 1,
    escalated: true,
    hits: [
      {
        source: 'firecrawl',
        title: 'Exa pricing',
        url: 'https://exa.ai/pricing',
        snippet: '$7 / 1k',
        score: 2.9,
      },
    ],
    dropped: 1,
    runs: [{ source: 'firecrawl', tier: 1, ok: true, hits: 2, ms: 10, usd: 0 }],
    judge: { model: 'clef-flash', usd: 0.00001, ms: 5 },
    usd: 0.00001,
    ms: 20,
    priorDecisions: [{ slug: 'decisions/research/x', title: 'X' }],
    ...overrides,
  };
}

export type Reply = {
  status?: number;
  body: unknown;
  headers?: Record<string, string>;
};
type Handler = (url: string, init: RequestInit) => Reply;

export function fakeFetch(handler: Handler) {
  const calls: { url: string; body: unknown; headers: Headers }[] = [];
  const impl = vi.fn(async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({
      url,
      body: init.body ? JSON.parse(String(init.body)) : null,
      headers: new Headers(init.headers),
    });
    const out = handler(url, init);
    const text =
      typeof out.body === 'string' ? out.body : JSON.stringify(out.body);
    return new Response(text, {
      status: out.status ?? 200,
      headers: { 'content-type': 'application/json', ...out.headers },
    });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

export const client = (provider: string, fetch: typeof globalThis.fetch) =>
  createApiClient({
    provider,
    credential: `test-${provider}`,
    authorize: h => h.set('authorization', 'Bearer t'),
    store: new MemoryLedgerStore(),
    fetch,
    log: () => undefined,
    sleep: async () => undefined,
  });
