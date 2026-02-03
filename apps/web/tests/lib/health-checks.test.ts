/**
 * Health Checks Tests - Fully mocked for speed
 *
 * These tests verify the structure and behavior of health check functions
 * without making real database connections.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

declare global {
  var jovieDevCleanupRegistered: boolean | undefined;
}

// Mock the entire @neondatabase/serverless module
vi.mock('@neondatabase/serverless', () => {
  // Use a class to properly support `new Pool()` constructor calls
  class MockPool {
    end = vi.fn().mockReturnValue(Promise.resolve());
  }
  // Mock neon HTTP client function
  const mockNeon = vi.fn().mockReturnValue(() => Promise.resolve({ rows: [] }));
  return {
    neonConfig: { webSocketConstructor: undefined },
    Pool: MockPool,
    neon: mockNeon,
  };
});

// Mock drizzle-orm (WebSocket driver - used in tests)
vi.mock('drizzle-orm/neon-serverless', () => {
  const mockExecute = vi
    .fn()
    .mockResolvedValue({ rows: [{ health_check: 1 }] });
  const mockTransaction = vi
    .fn()
    .mockImplementation(async (cb: Function) => cb());

  return {
    drizzle: vi.fn().mockReturnValue({
      execute: mockExecute,
      transaction: mockTransaction,
    }),
    __mockExecute: mockExecute,
    __mockTransaction: mockTransaction,
  };
});

// Mock drizzle-orm HTTP driver (used by health.ts validateDbConnection)
vi.mock('drizzle-orm/neon-http', () => {
  const mockExecute = vi
    .fn()
    .mockResolvedValue({ rows: [{ health_check: 1 }] });

  return {
    drizzle: vi.fn().mockReturnValue({
      execute: mockExecute,
    }),
  };
});

// Mock the env module with a getter that reads from process.env
vi.mock('@/lib/env-server', () => ({
  env: {
    get DATABASE_URL() {
      return process.env.DATABASE_URL;
    },
  },
}));

// Set default DATABASE_URL for tests
process.env.DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';

import {
  checkDbHealth,
  checkDbPerformance,
  getDbConfig,
  validateDbConnection,
} from '@/lib/db';

describe('Health Checks', () => {
  beforeAll(() => {
    // Prevent cleanup handlers from being registered
    globalThis.jovieDevCleanupRegistered = true;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.resetModules();
  });

  describe('Database Health Checks', () => {
    it('should return health check structure', async () => {
      const result = await checkDbHealth();

      expect(result).toHaveProperty('healthy');
      expect(result).toHaveProperty('latency');
      expect(result).toHaveProperty('details');
      expect(typeof result.healthy).toBe('boolean');
      expect(typeof result.latency).toBe('number');

      if (result.details) {
        expect(result.details).toHaveProperty('connection');
        expect(result.details).toHaveProperty('query');
        expect(result.details).toHaveProperty('transaction');
        expect(result.details).toHaveProperty('schemaAccess');
      }
    });

    it('should validate database connection structure', async () => {
      const result = await validateDbConnection();

      expect(result).toHaveProperty('connected');
      expect(typeof result.connected).toBe('boolean');

      if (result.connected) {
        expect(result).toHaveProperty('latency');
        expect(typeof result.latency).toBe('number');
      }
    });

    it('should return performance metrics structure', async () => {
      const result = await checkDbPerformance();

      expect(result).toHaveProperty('healthy');
      expect(result).toHaveProperty('metrics');
      expect(typeof result.healthy).toBe('boolean');
      expect(typeof result.metrics).toBe('object');
    });

    it('should return database configuration', () => {
      const config = getDbConfig();

      expect(config).toHaveProperty('config');
      expect(config).toHaveProperty('status');
      expect(config.status).toHaveProperty('initialized');
      expect(config.status).toHaveProperty('environment');
      expect(config.status).toHaveProperty('hasUrl');
    });

    it('should handle missing DATABASE_URL gracefully', async () => {
      // Temporarily override env
      const originalUrl = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;

      try {
        const result = await validateDbConnection();
        expect(result.connected).toBe(false);
        expect(result.error).toBe('DATABASE_URL not configured');
      } finally {
        if (originalUrl) {
          process.env.DATABASE_URL = originalUrl;
        }
      }
    });
  });

  describe('Health Check Performance', () => {
    it('should complete health checks quickly with mocked DB', async () => {
      const startTime = Date.now();
      const result = await validateDbConnection();
      const duration = Date.now() - startTime;

      // Mocked checks should be very fast
      expect(duration).toBeLessThan(100);
      expect(result).toHaveProperty('connected');
      expect(typeof result.connected).toBe('boolean');
    });

    it('should handle concurrent health checks', async () => {
      const promises = Array.from({ length: 3 }, () => validateDbConnection());
      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result).toHaveProperty('connected');
        expect(typeof result.connected).toBe('boolean');
      });

      // All results should be consistent
      const connectionStatuses = results.map(r => r.connected);
      expect(new Set(connectionStatuses).size).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors without crashing', async () => {
      let result: Awaited<ReturnType<typeof checkDbHealth>>;
      let threwError = false;

      try {
        result = await checkDbHealth();
      } catch {
        threwError = true;
        result = { healthy: false, error: 'caught' };
      }

      expect(threwError).toBe(false);
      expect(result).toHaveProperty('healthy');
      expect(typeof result.healthy).toBe('boolean');
    });
  });
});
