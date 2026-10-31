import { describe, expect, it } from 'vitest';
import { buildAiReceipt } from './receipt';

describe('buildAiReceipt', () => {
  it('computes the cache hit ratio from cache reads over input', () => {
    const r = buildAiReceipt('jovie-chat', {
      inputTokens: 10_000,
      outputTokens: 200,
      inputTokenDetails: { cacheReadTokens: 7_500, cacheWriteTokens: 0 },
    });
    expect(r).toMatchObject({
      functionId: 'jovie-chat',
      cacheHitRatio: 0.75,
      outputTokens: 200,
    });
  });

  it('is zero-safe for missing usage and unnamed callers', () => {
    expect(buildAiReceipt(undefined, undefined)).toMatchObject({
      functionId: 'untagged',
      inputTokens: 0,
      cacheHitRatio: 0,
    });
  });
});
