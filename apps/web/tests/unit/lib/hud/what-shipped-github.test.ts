import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WHAT_SHIPPED_FEED_CACHE_TTL_SECONDS } from '@/lib/hud/what-shipped-policy';

const mocks = vi.hoisted(() => ({
  captureError: vi.fn(),
  getRedis: vi.fn(),
  humanizePrTitle: vi.fn(),
  loggerError: vi.fn(),
  serverFetch: vi.fn(),
}));

vi.mock('@/lib/env-server', () => ({
  env: {
    HUD_GITHUB_TOKEN: 'test-token',
    HUD_GITHUB_OWNER: 'JovieInc',
    HUD_GITHUB_REPO: 'Jovie',
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mocks.captureError,
}));

vi.mock('@/lib/http/server-fetch', () => ({
  serverFetch: mocks.serverFetch,
}));

vi.mock('@/lib/hud/humanize-pr-title', () => ({
  humanizePrTitle: mocks.humanizePrTitle,
}));

vi.mock('@/lib/redis', () => ({
  getRedis: mocks.getRedis,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: mocks.loggerError },
}));

import {
  readWhatShippedFromGitHub,
  resetWhatShippedProcessCacheForTests,
} from '@/lib/hud/what-shipped-github';

const NOW = new Date('2026-09-05T12:00:00.000Z');
const QUOTA_ERROR = new Error('ERR max requests limit exceeded. Limit: 500000');

interface RedisStub {
  readonly get: ReturnType<typeof vi.fn>;
  readonly set: ReturnType<typeof vi.fn>;
}

function githubResponse(number: number, title: string): Response {
  return new Response(
    JSON.stringify([
      {
        number,
        title,
        merged_at: '2026-09-05T11:00:00.000Z',
        html_url: `https://github.com/JovieInc/Jovie/pull/${number}`,
      },
    ]),
    { status: 200 }
  );
}

function stubQuotaExhaustedRedis(): RedisStub {
  const redis = {
    get: vi.fn().mockRejectedValue(QUOTA_ERROR),
    set: vi.fn().mockRejectedValue(QUOTA_ERROR),
  };
  mocks.getRedis.mockReturnValue(redis);
  return redis;
}

describe('readWhatShippedFromGitHub process fallback cache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mocks.captureError.mockReset();
    mocks.getRedis.mockReset();
    mocks.humanizePrTitle.mockReset();
    mocks.loggerError.mockReset();
    mocks.serverFetch.mockReset();
    resetWhatShippedProcessCacheForTests();
    mocks.humanizePrTitle.mockImplementation(
      async ({ title }: { title: string }) => ({
        title: `✨ ${title}`,
        source: 'model',
      })
    );
  });

  afterEach(() => {
    resetWhatShippedProcessCacheForTests();
    vi.useRealTimers();
  });

  it('keeps the GitHub feed available when Redis rejects reads and writes for quota', async () => {
    const redis = stubQuotaExhaustedRedis();
    mocks.serverFetch.mockResolvedValue(
      githubResponse(17290, 'Serialize lease tombstone transactions')
    );

    const result = await readWhatShippedFromGitHub();

    expect(result).toMatchObject({
      available: true,
      observation: 'ok',
      generatedAt: NOW.toISOString(),
      items: [
        {
          number: 17290,
          title: '✨ Serialize lease tombstone transactions',
        },
      ],
    });
    expect(redis.get).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledTimes(1);
    expect(mocks.serverFetch).toHaveBeenCalledTimes(1);
    expect(mocks.humanizePrTitle).toHaveBeenCalledTimes(1);
  });

  it('reuses a successful process-cached feed within the bounded TTL', async () => {
    const redis = stubQuotaExhaustedRedis();
    mocks.serverFetch.mockResolvedValue(
      githubResponse(17290, 'Serialize lease tombstone transactions')
    );

    const first = await readWhatShippedFromGitHub();
    vi.advanceTimersByTime(WHAT_SHIPPED_FEED_CACHE_TTL_SECONDS * 1_000 - 1);
    const second = await readWhatShippedFromGitHub();

    expect(second).toEqual(first);
    expect(redis.get).toHaveBeenCalledTimes(1);
    expect(mocks.serverFetch).toHaveBeenCalledTimes(1);
    expect(mocks.humanizePrTitle).toHaveBeenCalledTimes(1);
  });

  it('expires the process cache and refetches GitHub at the TTL boundary', async () => {
    const redis = stubQuotaExhaustedRedis();
    mocks.serverFetch
      .mockResolvedValueOnce(githubResponse(17290, 'First feed'))
      .mockResolvedValueOnce(githubResponse(17291, 'Refreshed feed'));

    const first = await readWhatShippedFromGitHub();
    vi.advanceTimersByTime(WHAT_SHIPPED_FEED_CACHE_TTL_SECONDS * 1_000);
    const second = await readWhatShippedFromGitHub();

    expect(first.items[0]?.number).toBe(17290);
    expect(second.items[0]?.number).toBe(17291);
    expect(second.generatedAt).toBe(
      new Date(
        NOW.getTime() + WHAT_SHIPPED_FEED_CACHE_TTL_SECONDS * 1_000
      ).toISOString()
    );
    expect(redis.get).toHaveBeenCalledTimes(2);
    expect(mocks.serverFetch).toHaveBeenCalledTimes(2);
    expect(mocks.humanizePrTitle).toHaveBeenCalledTimes(2);
  });

  it('does not serve expired success as fresh or permanently cache a refresh failure', async () => {
    stubQuotaExhaustedRedis();
    mocks.serverFetch
      .mockResolvedValueOnce(githubResponse(17290, 'First feed'))
      .mockRejectedValueOnce(new Error('GitHub unavailable'))
      .mockResolvedValueOnce(githubResponse(17291, 'Recovered feed'));

    await readWhatShippedFromGitHub();
    vi.advanceTimersByTime(WHAT_SHIPPED_FEED_CACHE_TTL_SECONDS * 1_000);

    const unavailable = await readWhatShippedFromGitHub();
    expect(unavailable).toMatchObject({
      available: false,
      observation: 'unavailable',
      generatedAt: null,
      items: [],
      errorMessage: 'GitHub unavailable',
    });

    const recovered = await readWhatShippedFromGitHub();
    expect(recovered).toMatchObject({
      available: true,
      observation: 'ok',
      items: [{ number: 17291 }],
    });
    expect(mocks.serverFetch).toHaveBeenCalledTimes(3);
    expect(mocks.captureError).toHaveBeenCalledTimes(1);
  });
});
