import {
  __internal__testDataStore,
  type DataStore,
} from '@statsig/statsig-node-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getRedisMock, redisGet, redisSet } = vi.hoisted(() => ({
  getRedisMock: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({ getRedis: getRedisMock }));
vi.mock('@/lib/env-server', () => ({ env: {} }));
vi.mock('@/lib/env-public', () => ({ publicEnv: {} }));
vi.mock('@/lib/error-tracking', () => ({ captureWarning: vi.fn() }));

async function createStore(): Promise<DataStore> {
  const { createSpecsDataStore } = await import('@/lib/flags/statsig');
  const store = createSpecsDataStore();
  if (!store) throw new Error('Expected a configured Statsig specs store');
  return store;
}

describe('Statsig specs data store SDK contract', () => {
  beforeEach(() => {
    vi.resetModules();
    redisGet.mockReset().mockResolvedValue(null);
    redisSet.mockReset().mockResolvedValue(undefined);
    getRedisMock.mockReset().mockReturnValue({ get: redisGet, set: redisSet });
  });

  it('exposes the initialize method required by the native SDK adapter', async () => {
    const store = await createStore();

    // Keep this explicit: the native test helper logs initialization errors
    // and continues, so a successful round trip alone cannot catch JOV-10537.
    expect(typeof store.initialize).toBe('function');
    await expect(store.initialize?.()).resolves.toBeUndefined();
    expect(typeof store.get).toBe('function');
    expect(typeof store.set).toBe('function');

    const initialize = vi.spyOn(store, 'initialize');
    redisGet.mockResolvedValue('{"feature_gates":[]}');

    // The pinned SDK's native helper exercises the actual adapter without
    // constructing a client, using credentials, or starting network requests.
    await expect(
      __internal__testDataStore(
        { ...store, shutdown: async () => {} },
        '/v2/download_config_specs',
        '{"feature_gates":[]}'
      )
    ).resolves.toEqual([{ result: '{"feature_gates":[]}' }, false]);
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(redisGet).toHaveBeenCalledWith('statsig:/v2/download_config_specs');
    expect(redisSet).toHaveBeenCalledWith(
      'statsig:/v2/download_config_specs',
      '{"feature_gates":[]}',
      { ex: 86_400 }
    );
  });

  it('leaves the SDK store unset when Redis is unavailable', async () => {
    getRedisMock.mockReturnValue(null);
    const { createSpecsDataStore } = await import('@/lib/flags/statsig');

    expect(createSpecsDataStore()).toBeUndefined();
  });

  it('serializes specs that Redis has already decoded', async () => {
    redisGet.mockResolvedValue({ feature_gates: [] });
    const store = await createStore();

    await expect(store.get?.('specs')).resolves.toEqual({
      result: '{"feature_gates":[]}',
    });
    expect(redisGet).toHaveBeenCalledWith('statsig:specs');
  });

  it('returns an empty response for missing specs and failed reads', async () => {
    const store = await createStore();

    await expect(store.get?.('specs')).resolves.toEqual({});
    redisGet.mockRejectedValueOnce(new Error('store unavailable'));
    await expect(store.get?.('specs')).resolves.toEqual({});
  });

  it('keeps writes best effort and disables polling', async () => {
    redisSet.mockRejectedValueOnce(new Error('store unavailable'));
    const store = await createStore();

    await expect(store.set?.('specs', 'value')).resolves.toBeUndefined();
    await expect(store.supportPollingUpdatesFor?.('specs')).resolves.toBe(
      false
    );
  });
});
