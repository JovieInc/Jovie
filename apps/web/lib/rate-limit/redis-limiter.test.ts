import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCaptureMessage,
  mockFixedWindow,
  mockGetRedis,
  mockRatelimitConstructor,
  mockSlidingWindow,
} = vi.hoisted(() => ({
  mockCaptureMessage: vi.fn(),
  mockFixedWindow: vi.fn(),
  mockGetRedis: vi.fn(),
  mockRatelimitConstructor: vi.fn(),
  mockSlidingWindow: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: mockCaptureMessage,
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

const mockEnv = vi.hoisted(() => ({ NODE_ENV: 'test' }));

vi.mock('@/lib/env-server', () => ({ env: mockEnv }));

vi.mock('@/lib/redis', () => ({
  getRedis: mockGetRedis,
}));

import {
  createRedisRateLimiter,
  resetRedisFallbackWarningForTests,
} from './redis-limiter';

const baseConfig = {
  name: 'Public Test',
  limit: 50,
  window: '1 m',
  prefix: 'public:test',
  analytics: false as const,
  algorithm: 'fixed-window' as const,
  trafficClass: 'internal' as const,
};

describe('createRedisRateLimiter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.NODE_ENV = 'test';
    resetRedisFallbackWarningForTests();
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

  it('captures one name-agnostic production fallback with limiter context', () => {
    mockEnv.NODE_ENV = 'production';
    mockGetRedis.mockReturnValue(null);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    createRedisRateLimiter(baseConfig);
    createRedisRateLimiter({ ...baseConfig, name: 'Another Limiter' });

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'Rate limiter falling back to in-memory store — Redis unconfigured',
      expect.objectContaining({
        level: 'error',
        tags: {
          limiter: 'Public Test',
          'rate_limit.prefix': 'public:test',
        },
      })
    );
    consoleError.mockRestore();
  });
});
