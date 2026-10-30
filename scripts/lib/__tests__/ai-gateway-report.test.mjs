import { describe, expect, it } from 'vitest';
import { fetchRows, main, summarize } from '../../ai-gateway-report.mjs';

const rows = [
  {
    api_key_name: 'cheap',
    total_cost: 1,
    request_count: 10,
    input_tokens: 80,
    cached_input_tokens: 20,
    reasoning_tokens: 50,
  },
  {
    tag: 'big',
    total_cost: 7,
    request_count: 2,
    input_tokens: 0,
    cached_input_tokens: 0,
  },
  { total_cost: 0, request_count: 0 },
];

describe('ai-gateway-report', () => {
  it('summarizes cost per day, cache hit and reasoning per request, largest first', () => {
    const out = summarize(rows, 7);
    expect(out.map(r => r.key)).toEqual(['big', 'cheap', '']);
    expect(out[1]).toMatchObject({
      usdPerDay: 1 / 7,
      requests: 10,
      promptTokensPerRequest: 10,
      reasoningTokensPerRequest: 5,
      cacheHit: 0.2,
    });
    expect(out[0].cacheHit).toBeNull();
    expect(out[2].promptTokensPerRequest).toBeNull();
    expect(out[2].reasoningTokensPerRequest).toBeNull();
  });

  it('reads rows through the shared client with the key as a bearer token', async () => {
    const seen = [];
    const fetchImpl = async (url, init) => {
      seen.push({
        url: String(url),
        auth: new Headers(init.headers).get('authorization'),
      });
      return new Response(JSON.stringify({ results: rows }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const out = await fetchRows('tag', 3, 'secret-key', fetchImpl);
    expect(out).toHaveLength(3);
    expect(seen[0].url).toContain('group_by=tag');
    expect(seen[0].auth).toBe('Bearer secret-key');
  });

  it('fails clearly when the key is missing and never prints it', async () => {
    const errors = [];
    const original = console.error;
    console.error = message => errors.push(String(message));
    try {
      expect(await main([], {})).toBe(1);
    } finally {
      console.error = original;
    }
    expect(errors.join('\n')).toContain('AI_GATEWAY_API_KEY is not set');
  });
});
