import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/redis', () => ({ getRedis: () => null }));
vi.mock('@/lib/ovie/shipping-state/configured.server', () => ({
  configuredGithubOwner: () => 'JovieInc',
  readConfiguredSearchCounts: vi.fn(),
}));

import { companyHistoryCronJob } from './configured.server';

describe('companyHistoryCronJob', () => {
  it('runs in the hourly slot only, as its own sub-job', async () => {
    const sync = vi.fn(async () => ({ status: 'ok', requests: 1 }));
    const run = vi.fn(
      async (name: string, fn: () => Promise<Record<string, unknown>>) => ({
        success: true,
        name,
        data: await fn(),
      })
    );
    await expect(companyHistoryCronJob(0, run, sync)).resolves.toEqual({
      success: true,
      name: 'companyHistory',
      data: { status: 'ok', requests: 1 },
    });
    await expect(companyHistoryCronJob(30, run, sync)).resolves.toEqual({
      success: true,
      skipped: true,
    });
    expect(run).toHaveBeenCalledOnce();
    expect(sync).toHaveBeenCalledOnce();
  });

  it('throws a merged-PR sync that wrote nothing so the sub-job reports it', async () => {
    const run = vi.fn(
      async (_name: string, fn: () => Promise<Record<string, unknown>>) => fn()
    );
    const sync = vi.fn(async () => ({
      status: 'unavailable',
      reason: 'github-unavailable',
      metrics: {},
    }));
    await expect(companyHistoryCronJob(0, run, sync)).rejects.toThrow(
      'company history sync unavailable: github-unavailable'
    );
    const noOwner = vi.fn(async () => ({
      status: 'unavailable',
      reason: 'github-owner-unconfigured',
    }));
    await expect(companyHistoryCronJob(0, run, noOwner)).resolves.toEqual({
      status: 'unavailable',
      reason: 'github-owner-unconfigured',
    });
    const partial = vi.fn(async () => ({ status: 'partial', reason: 'x' }));
    await expect(companyHistoryCronJob(0, run, partial)).resolves.toEqual({
      status: 'partial',
      reason: 'x',
    });
  });

  it('fails closed without Redis on the configured path', async () => {
    const run = vi.fn(
      async (_name: string, fn: () => Promise<Record<string, unknown>>) => fn()
    );
    await expect(companyHistoryCronJob(5, run)).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'redis-unavailable',
    });
  });
});
