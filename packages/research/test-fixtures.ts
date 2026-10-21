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
