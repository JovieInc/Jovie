import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockFixedWindow,
  mockGetRedis,
  mockRatelimitConstructor,
  mockSlidingWindow,
} = vi.hoisted(() => ({
  mockFixedWindow: vi.fn(),
  mockGetRedis: vi.fn(),
  mockRatelimitConstructor: vi.fn(),
  mockSlidingWindow: vi.fn(),
}));

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class MockRatelimit {
    static fixedWindow = mockFixedWindow;
    static slidingWindow = mockSlidingWindow;

    constructor(options: unknown) {
      mockRatelimitConstructor(options);
    }
  },
}));

vi.mock('@/lib/env-server', () => ({
  env: { NODE_ENV: 'test' },
}));

vi.mock('@/lib/redis', () => ({
  getRedis: mockGetRedis,
}));

import { createRedisRateLimiter } from './redis-limiter';

const baseConfig = {
  name: 'Public Test',
  limit: 50,
  window: '1 m',
  prefix: 'public:test',
  analytics: false,
  algorithm: 'fixed-window' as const,
  trafficClass: 'internal' as const,
};

describe('createRedisRateLimiter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRedis.mockReturnValue({});
    mockFixedWindow.mockReturnValue('fixed-window-limiter');
    mockSlidingWindow.mockReturnValue('sliding-window-limiter');
  });

  it('uses fixed-window enforcement when the lower-command policy is selected', () => {
    createRedisRateLimiter({ ...baseConfig, algorithm: 'fixed-window' });

    expect(mockFixedWindow).toHaveBeenCalledWith(50, '1 m');
    expect(mockSlidingWindow).not.toHaveBeenCalled();
    expect(mockRatelimitConstructor).toHaveBeenCalledWith({
      redis: {},
      limiter: 'fixed-window-limiter',
      analytics: false,
      prefix: 'public:test',
    });
  });

  it('uses sliding-window enforcement only when explicitly selected', () => {
    createRedisRateLimiter({ ...baseConfig, algorithm: 'sliding-window' });

    expect(mockSlidingWindow).toHaveBeenCalledWith(50, '1 m');
    expect(mockFixedWindow).not.toHaveBeenCalled();
  });
});
