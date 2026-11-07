import { beforeEach, describe, expect, it, vi } from 'vitest';

const { limit, evalScript, redis } = vi.hoisted(() => ({
  limit: vi.fn(),
  evalScript: vi.fn(),
  redis: { available: true },
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit/rate-limiter', () => ({
  RateLimiter: class {
    limit = limit;
  },
}));
vi.mock('@/lib/redis', () => ({
  getRedis: () => (redis.available ? { eval: evalScript } : null),
}));

import {
  checkDictationMintLimit,
  RESERVE_AUDIO_SCRIPT,
  reserveDictationAudio,
} from './quota.server';

beforeEach(() => {
  vi.resetAllMocks();
  redis.available = true;
  limit.mockResolvedValue({ success: true });
  evalScript.mockResolvedValue(1);
});
describe('dictation quota', () => {
  it('uses shared rate-limit infra and fails closed on backend failures', async () => {
    expect(await checkDictationMintLimit('account')).toBeNull();
    expect(limit).toHaveBeenCalledWith('account');
    limit.mockResolvedValue({ success: false });
    expect(await checkDictationMintLimit('account')).toBe('rate_limited');
    limit.mockResolvedValue({ unavailable: true });
    expect(await checkDictationMintLimit('account')).toBe('provider-down');
    limit.mockResolvedValue({ degraded: true });
    expect(await checkDictationMintLimit('account')).toBe('provider-down');
  });
  it('atomically reserves bounded audio seconds in the account UTC-day bucket', async () => {
    expect(await reserveDictationAudio('account', 600, 86400001)).toBeNull();
    expect(evalScript).toHaveBeenCalledWith(
      RESERVE_AUDIO_SCRIPT,
      ['dictation:audio:account:1'],
      [600, 3600, 172800]
    );
    evalScript.mockResolvedValue(0);
    expect(await reserveDictationAudio('account', 1)).toBe(
      'dictation_cap_reached'
    );
    evalScript.mockRejectedValue(new Error('offline'));
    expect(await reserveDictationAudio('account', 1)).toBe('provider-down');
    redis.available = false;
    expect(await reserveDictationAudio('account', 1)).toBe('provider-down');
  });
  it.each([0, -1, 601, NaN, Infinity, 0.1])(
    'rejects invalid reservation %s without accessing Redis',
    async seconds => {
      expect(await reserveDictationAudio('account', seconds)).toBe(
        'dictation_cap_reached'
      );
      expect(evalScript).not.toHaveBeenCalled();
    }
  );
  it('allows exactly 3600 reserved seconds across concurrent streaming and batch', async () => {
    let used = 0;
    evalScript.mockImplementation(async (_script, _keys, args: number[]) => {
      if (used + args[0] > args[1]) return 0;
      used += args[0];
      return 1;
    });
    const results = await Promise.all(
      Array.from({ length: 7 }, () => reserveDictationAudio('account', 600))
    );
    expect(results.filter(x => x === null)).toHaveLength(6);
    expect(results[6]).toBe('dictation_cap_reached');
  });
});
