import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockClient, mockCreateClient } = vi.hoisted(() => {
  const mockClient = {
    connect: vi.fn(async () => undefined),
    on: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    getDel: vi.fn(),
    sAdd: vi.fn(),
    mGet: vi.fn(),
    eval: vi.fn(),
    evalSha: vi.fn(),
  };
  return {
    mockClient,
    mockCreateClient: vi.fn(() => mockClient),
  };
});

vi.mock('redis', () => ({
  createClient: mockCreateClient,
}));

import {
  createLocalRedisClient,
  resetLocalRedisClientForTests,
} from './redis-local-client';

describe('createLocalRedisClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetLocalRedisClientForTests();
    mockClient.connect.mockResolvedValue(undefined);
    mockCreateClient.mockReturnValue(mockClient);
  });

  it('connects to the localhost URL and forwards rate-limit evalsha calls', async () => {
    mockClient.evalSha.mockResolvedValue([1, 2, 3]);
    const client = createLocalRedisClient('redis://127.0.0.1:6379');

    await expect(client.evalsha('abc', ['key'], [5, '60000'])).resolves.toEqual(
      [1, 2, 3]
    );

    expect(mockCreateClient).toHaveBeenCalledWith({
      url: 'redis://127.0.0.1:6379',
    });
    expect(mockClient.evalSha).toHaveBeenCalledWith('abc', {
      keys: ['key'],
      arguments: ['5', '60000'],
    });
  });

  it('rewrites a missing script error so Upstash ratelimit can fall back to eval', async () => {
    mockClient.evalSha.mockRejectedValue(
      new Error('NOSCRIPT No matching script. Please use EVAL.')
    );
    const client = createLocalRedisClient('redis://localhost:6379');

    await expect(client.evalsha('missing', [], [])).rejects.toThrow(/NOSCRIPT/);
  });

  it('uses one redis import and one connection for concurrent first calls', async () => {
    let resolveConnect: (() => void) | undefined;
    mockClient.connect.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveConnect = () => resolve(undefined);
        })
    );
    mockClient.get.mockResolvedValue('value');
    const client = createLocalRedisClient('redis://127.0.0.1:6379');

    const first = client.get('one');
    const second = client.get('two');

    await vi.waitFor(() => {
      expect(mockCreateClient).toHaveBeenCalledTimes(1);
    });
    expect(mockClient.connect).toHaveBeenCalledTimes(1);

    resolveConnect?.();
    await expect(first).resolves.toBe('value');
    await expect(second).resolves.toBe('value');
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    expect(mockClient.connect).toHaveBeenCalledTimes(1);
    expect(mockClient.get).toHaveBeenCalledTimes(2);
  });

  it('opens a new connection after the first attempt fails', async () => {
    mockClient.connect
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce(undefined);
    mockClient.get.mockResolvedValue('ok');
    const client = createLocalRedisClient('redis://127.0.0.1:6379');

    await expect(client.get('cache')).rejects.toThrow('connection refused');
    await expect(client.get('cache')).resolves.toBe('ok');

    expect(mockCreateClient).toHaveBeenCalledTimes(2);
    expect(mockClient.connect).toHaveBeenCalledTimes(2);
  });

  it('maps Upstash set options and JSON values onto node-redis', async () => {
    mockClient.set.mockResolvedValue('OK');
    mockClient.get.mockResolvedValue('{"ok":true}');
    const client = createLocalRedisClient('redis://127.0.0.1:6379');

    await expect(
      client.set('cache', { ok: true }, { ex: 60, nx: true })
    ).resolves.toBe('OK');
    await expect(client.get('cache')).resolves.toEqual({ ok: true });

    expect(mockClient.set).toHaveBeenCalledWith('cache', '{"ok":true}', {
      EX: 60,
      NX: true,
    });
  });
});
