/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StatsigBootstrapData } from '@/lib/statsig/types';

// Mock the env module before importing the server module
vi.mock('@/lib/env-server', () => ({
  env: {
    STATSIG_SERVER_API_KEY: 'test-api-key',
  },
}));

// Mock React's cache function to pass through the function directly
vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return {
    ...actual,
    cache: <T extends Function>(fn: T) => fn,
  };
});

describe('fetchStatsigBootstrapData', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  /**
   * Helper to create a valid StatsigBootstrapData response
   */
  const createValidBootstrapData = (
    overrides?: Partial<StatsigBootstrapData>
  ): StatsigBootstrapData => ({
    feature_gates: {
      test_gate_hash: {
        name: 'test_gate',
        value: true,
        rule_id: 'rule_123',
      },
    },
    dynamic_configs: {
      test_config_hash: {
        name: 'test_config',
        rule_id: 'config_rule_456',
        value: { setting: 'enabled' },
      },
    },
    layer_configs: {},
    has_updates: true,
    generator: 'statsig-server',
    time: Date.now(),
    company_lcut: Date.now(),
    evaluated_keys: {
      userID: 'test-user-123',
    },
    hash_used: 'djb2',
    ...overrides,
  });

  describe('successful API responses', () => {
    it('returns bootstrap data on successful API response', async () => {
      const mockData = createValidBootstrapData();

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockData),
      } as Response);

      const { fetchStatsigBootstrapData } = await import(
        '@/lib/statsig/server'
      );
      const result = await fetchStatsigBootstrapData('test-user-123');

      expect(result).toEqual(mockData);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.statsig.com/v1/initialize',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'statsig-api-key': 'test-api-key',
          },
          body: JSON.stringify({
            user: { userID: 'test-user-123' },
            hash: 'djb2',
          }),
          cache: 'no-store',
        })
      );
    });

    it('returns data with feature gates and dynamic configs', async () => {
      const mockData = createValidBootstrapData({
        feature_gates: {
          feature_a: { name: 'feature_a', value: true, rule_id: 'rule_a' },
          feature_b: { name: 'feature_b', value: false, rule_id: 'rule_b' },
        },
        dynamic_configs: {
          config_x: {
            name: 'config_x',
            rule_id: 'config_rule_x',
            value: { key: 'value' },
          },
        },
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockData),
      } as Response);

      const { fetchStatsigBootstrapData } = await import(
        '@/lib/statsig/server'
      );
      const result = await fetchStatsigBootstrapData('user-456');

      expect(result?.feature_gates).toHaveProperty('feature_a');
      expect(result?.feature_gates).toHaveProperty('feature_b');
      expect(result?.dynamic_configs).toHaveProperty('config_x');
    });

    it('sends correct user ID in request body', async () => {
      const mockData = createValidBootstrapData();

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockData),
      } as Response);

      const { fetchStatsigBootstrapData } = await import(
        '@/lib/statsig/server'
      );
      await fetchStatsigBootstrapData('specific-user-id-789');

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            user: { userID: 'specific-user-id-789' },
            hash: 'djb2',
          }),
        })
      );
    });
  });

  describe('error handling', () => {
    it('returns null on non-ok response status', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      const { fetchStatsigBootstrapData } = await import(
        '@/lib/statsig/server'
      );
      const result = await fetchStatsigBootstrapData('test-user');

      expect(result).toBeNull();
    });

    it('returns null on 401 unauthorized', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      } as Response);

      const { fetchStatsigBootstrapData } = await import(
        '@/lib/statsig/server'
      );
      const result = await fetchStatsigBootstrapData('test-user');

      expect(result).toBeNull();
    });

    it('returns null on 403 forbidden', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      } as Response);

      const { fetchStatsigBootstrapData } = await import(
        '@/lib/statsig/server'
      );
      const result = await fetchStatsigBootstrapData('test-user');

      expect(result).toBeNull();
    });

    it('returns null on 429 rate limit', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      } as Response);

      const { fetchStatsigBootstrapData } = await import(
        '@/lib/statsig/server'
      );
      const result = await fetchStatsigBootstrapData('test-user');

      expect(result).toBeNull();
    });

    it('returns null on network error (fetch throws)', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      const { fetchStatsigBootstrapData } = await import(
        '@/lib/statsig/server'
      );
      const result = await fetchStatsigBootstrapData('test-user');

      expect(result).toBeNull();
    });

    it('returns null on timeout error', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(
        new DOMException('The operation was aborted', 'AbortError')
      );

      const { fetchStatsigBootstrapData } = await import(
        '@/lib/statsig/server'
      );
      const result = await fetchStatsigBootstrapData('test-user');

      expect(result).toBeNull();
    });

    it('returns null when JSON parsing fails', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('Invalid JSON')),
      } as Response);

      const { fetchStatsigBootstrapData } = await import(
        '@/lib/statsig/server'
      );
      const result = await fetchStatsigBootstrapData('test-user');

      expect(result).toBeNull();
    });
  });

  describe('missing API key scenario', () => {
    it('returns null when STATSIG_SERVER_API_KEY is missing', async () => {
      // Reset modules to clear cached imports
      vi.resetModules();

      // Re-mock with no API key
      vi.doMock('@/lib/env-server', () => ({
        env: {
          STATSIG_SERVER_API_KEY: undefined,
        },
      }));

      // Re-mock React cache
      vi.doMock('react', async () => {
        const actual = await vi.importActual('react');
        return {
          ...actual,
          cache: <T extends Function>(fn: T) => fn,
        };
      });

      const { fetchStatsigBootstrapData } = await import(
        '@/lib/statsig/server'
      );
      const result = await fetchStatsigBootstrapData('test-user');

      expect(result).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    });

    it('returns null when STATSIG_SERVER_API_KEY is empty string', async () => {
      vi.resetModules();

      vi.doMock('@/lib/env-server', () => ({
        env: {
          STATSIG_SERVER_API_KEY: '',
        },
      }));

      vi.doMock('react', async () => {
        const actual = await vi.importActual('react');
        return {
          ...actual,
          cache: <T extends Function>(fn: T) => fn,
        };
      });

      const { fetchStatsigBootstrapData } = await import(
        '@/lib/statsig/server'
      );
      const result = await fetchStatsigBootstrapData('test-user');

      expect(result).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('response validation', () => {
    it('returns null when response is missing feature_gates', async () => {
      const invalidData = {
        dynamic_configs: {},
        layer_configs: {},
        has_updates: true,
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(invalidData),
      } as Response);

      const { fetchStatsigBootstrapData } = await import(
        '@/lib/statsig/server'
      );
      const result = await fetchStatsigBootstrapData('test-user');

      expect(result).toBeNull();
    });

    it('returns null when response is missing dynamic_configs', async () => {
      const invalidData = {
        feature_gates: {},
        layer_configs: {},
        has_updates: true,
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(invalidData),
      } as Response);

      const { fetchStatsigBootstrapData } = await import(
        '@/lib/statsig/server'
      );
      const result = await fetchStatsigBootstrapData('test-user');

      expect(result).toBeNull();
    });

    it('returns null when response is null', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(null),
      } as Response);

      const { fetchStatsigBootstrapData } = await import(
        '@/lib/statsig/server'
      );
      const result = await fetchStatsigBootstrapData('test-user');

      expect(result).toBeNull();
    });

    it('returns null when response is not an object', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve('not an object'),
      } as Response);

      const { fetchStatsigBootstrapData } = await import(
        '@/lib/statsig/server'
      );
      const result = await fetchStatsigBootstrapData('test-user');

      expect(result).toBeNull();
    });

    it('returns null when response is an array', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
      } as Response);

      const { fetchStatsigBootstrapData } = await import(
        '@/lib/statsig/server'
      );
      const result = await fetchStatsigBootstrapData('test-user');

      expect(result).toBeNull();
    });

    it('accepts response with empty feature_gates and dynamic_configs', async () => {
      const minimalData = createValidBootstrapData({
        feature_gates: {},
        dynamic_configs: {},
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(minimalData),
      } as Response);

      const { fetchStatsigBootstrapData } = await import(
        '@/lib/statsig/server'
      );
      const result = await fetchStatsigBootstrapData('test-user');

      expect(result).toEqual(minimalData);
    });
  });

  describe('response type matching', () => {
    it('returns data with correct StatsigBootstrapData structure', async () => {
      const mockData = createValidBootstrapData();

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockData),
      } as Response);

      const { fetchStatsigBootstrapData } = await import(
        '@/lib/statsig/server'
      );
      const result = await fetchStatsigBootstrapData('test-user');

      // Verify the structure matches StatsigBootstrapData type
      expect(result).toHaveProperty('feature_gates');
      expect(result).toHaveProperty('dynamic_configs');
      expect(result).toHaveProperty('layer_configs');
      expect(result).toHaveProperty('has_updates');
      expect(result).toHaveProperty('generator');
      expect(result).toHaveProperty('time');
      expect(result).toHaveProperty('company_lcut');
      expect(result).toHaveProperty('evaluated_keys');
      expect(result).toHaveProperty('hash_used');
    });

    it('returns feature gate with correct structure', async () => {
      const mockData = createValidBootstrapData({
        feature_gates: {
          my_gate: {
            name: 'my_gate',
            value: true,
            rule_id: 'rule_abc',
            secondary_exposures: [
              {
                gate: 'parent_gate',
                gateValue: 'true',
                ruleID: 'parent_rule',
              },
            ],
          },
        },
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockData),
      } as Response);

      const { fetchStatsigBootstrapData } = await import(
        '@/lib/statsig/server'
      );
      const result = await fetchStatsigBootstrapData('test-user');

      const gate = result?.feature_gates.my_gate;
      expect(gate).toHaveProperty('name', 'my_gate');
      expect(gate).toHaveProperty('value', true);
      expect(gate).toHaveProperty('rule_id', 'rule_abc');
      expect(gate?.secondary_exposures).toHaveLength(1);
    });

    it('returns dynamic config with correct structure', async () => {
      const mockData = createValidBootstrapData({
        dynamic_configs: {
          my_config: {
            name: 'my_config',
            rule_id: 'config_rule',
            value: { theme: 'dark', maxItems: 10 },
            group: 'test_group',
            is_experiment_active: true,
            is_user_in_experiment: true,
          },
        },
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockData),
      } as Response);

      const { fetchStatsigBootstrapData } = await import(
        '@/lib/statsig/server'
      );
      const result = await fetchStatsigBootstrapData('test-user');

      const config = result?.dynamic_configs.my_config;
      expect(config).toHaveProperty('name', 'my_config');
      expect(config).toHaveProperty('rule_id', 'config_rule');
      expect(config?.value).toEqual({ theme: 'dark', maxItems: 10 });
      expect(config).toHaveProperty('group', 'test_group');
      expect(config).toHaveProperty('is_experiment_active', true);
      expect(config).toHaveProperty('is_user_in_experiment', true);
    });

    it('returns evaluated_keys with correct structure', async () => {
      const mockData = createValidBootstrapData({
        evaluated_keys: {
          userID: 'user-123',
          stableID: 'stable-456',
          customIDs: { orgID: 'org-789' },
        },
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockData),
      } as Response);

      const { fetchStatsigBootstrapData } = await import(
        '@/lib/statsig/server'
      );
      const result = await fetchStatsigBootstrapData('test-user');

      expect(result?.evaluated_keys).toEqual({
        userID: 'user-123',
        stableID: 'stable-456',
        customIDs: { orgID: 'org-789' },
      });
    });
  });
});
