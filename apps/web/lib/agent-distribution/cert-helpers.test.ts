import { describe, expect, it } from 'vitest';
import {
  findKey,
  isRateLimited,
  latencyByTool,
  parseMcpBody,
  percentile,
} from './cert-helpers';

describe('cert helpers', () => {
  it('parses plain JSON and SSE data framing', () => {
    expect(parseMcpBody('{"id":1,"result":{}}')).toEqual({ id: 1, result: {} });
    expect(
      parseMcpBody('event: message\ndata: {"id":2,"result":{"ok":true}}\n\n')
    ).toEqual({ id: 2, result: { ok: true } });
    expect(parseMcpBody('data: {"a":1}\n\ndata: {"a":2}\n')).toEqual({ a: 2 });
  });

  it('returns a raw excerpt for non-JSON bodies', () => {
    expect(parseMcpBody('<html>oops</html>')).toEqual({
      _raw: '<html>oops</html>',
    });
  });

  it('finds nested keys and skips empty values', () => {
    const doc = { a: { draft_id: '' }, b: [{ x: { draft_id: 'd1' } }] };
    expect(findKey(doc, ['draft_id'])).toBe('d1');
    expect(findKey(doc, ['missing'])).toBeUndefined();
  });

  it('computes percentiles and per-tool latency', () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(20);
    expect(percentile([], 95)).toBeNull();
    expect(
      latencyByTool([
        { tool: 'a', ms: 5 },
        { tool: 'a', ms: 15 },
      ]).a
    ).toEqual({ count: 2, p50: 5, p95: 15 });
  });

  it('distinguishes rate limiting from failures', () => {
    expect(isRateLimited(429, {})).toBe(true);
    expect(isRateLimited(200, { error: 'RATE_LIMITED' })).toBe(true);
    expect(isRateLimited(400, { error: 'INVALID_INPUT' })).toBe(false);
  });
});
