import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateTextMock = vi.fn();
const getRedisMock = vi.fn();

vi.mock('@/lib/ai/sdk', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
  gateway: (modelId: string) => modelId,
}));

vi.mock('@/lib/redis', () => ({
  getRedis: () => getRedisMock(),
}));

import {
  humanizedPrTitleCacheKey,
  humanizePrTitle,
} from '@/lib/hud/humanize-pr-title';

interface RedisStub {
  readonly get: ReturnType<typeof vi.fn>;
  readonly set: ReturnType<typeof vi.fn>;
}

function stubRedis(overrides: Partial<RedisStub> = {}): RedisStub {
  const redis: RedisStub = {
    get: overrides.get ?? vi.fn().mockResolvedValue(null),
    set: overrides.set ?? vi.fn().mockResolvedValue('OK'),
  };
  getRedisMock.mockReturnValue(redis);
  return redis;
}

describe('humanizedPrTitleCacheKey', () => {
  it('keys the cache by PR number', () => {
    expect(humanizedPrTitleCacheKey(12895)).toBe('hud:pr-title:v1:12895');
  });
});

describe('humanizePrTitle', () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    getRedisMock.mockReset();
  });

  it('returns the cached title without calling the model', async () => {
    const redis = stubRedis({
      get: vi.fn().mockResolvedValue('🚀 Shipped the new merch page'),
    });

    const result = await humanizePrTitle({
      number: 12895,
      title: 'feat(merch): add merch page',
    });

    expect(result).toEqual({
      title: '🚀 Shipped the new merch page',
      source: 'cache',
    });
    expect(redis.get).toHaveBeenCalledWith('hud:pr-title:v1:12895');
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('calls the model on cache miss and caches the result with no expiry', async () => {
    const redis = stubRedis();
    generateTextMock.mockResolvedValue({
      text: '  "✨ Made release setup faster"  ',
    });

    const result = await humanizePrTitle({
      number: 42,
      title: 'perf(release): speed up setup flow',
    });

    expect(result).toEqual({
      title: '✨ Made release setup faster',
      source: 'model',
    });
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(
      'hud:pr-title:v1:42',
      '✨ Made release setup faster'
    );
  });

  it('falls back to the raw title when the model call fails', async () => {
    const redis = stubRedis();
    generateTextMock.mockRejectedValue(new Error('gateway timeout'));

    const result = await humanizePrTitle({
      number: 7,
      title: 'fix(auth): resolve login redirect loop',
    });

    expect(result).toEqual({
      title: 'fix(auth): resolve login redirect loop',
      source: 'fallback',
    });
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('falls back without caching when the model returns empty text', async () => {
    const redis = stubRedis();
    generateTextMock.mockResolvedValue({ text: '   ' });

    const result = await humanizePrTitle({
      number: 9,
      title: 'chore: bump dependencies',
    });

    expect(result).toEqual({
      title: 'chore: bump dependencies',
      source: 'fallback',
    });
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('still humanizes when Redis is unavailable', async () => {
    getRedisMock.mockReturnValue(null);
    generateTextMock.mockResolvedValue({ text: '🧹 Cleaned up old scripts' });

    const result = await humanizePrTitle({
      number: 11,
      title: 'chore(scripts): remove dead code',
    });

    expect(result).toEqual({
      title: '🧹 Cleaned up old scripts',
      source: 'model',
    });
  });
});
