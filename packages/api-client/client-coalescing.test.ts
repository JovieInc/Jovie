import { describe, expect, it } from 'vitest';

import { createApiClient, type RequestOptions } from './client.ts';
import { CONTRACT } from './contract.ts';
import { createFakeProvider, FakeClock } from './fake-provider.ts';
import { credentialState } from './policy.ts';
import { MemoryLedgerStore } from './store.ts';

const url = 'https://api.github.com/repos/o/r';

function setup(handler?: Parameters<typeof createFakeProvider>[0]['handler']) {
  const clock = new FakeClock();
  const store = new MemoryLedgerStore();
  const fake = createFakeProvider({ style: 'github', clock, handler });
  const client = createApiClient({
    provider: 'github',
    credential: 'fixture',
    store,
    fetch: fake.fetch,
    now: clock.read,
    sleep: clock.sleep,
    random: () => 0,
    log: () => {},
  });
  const budget = (remaining: number, limit = 1000) =>
    store.transact('github', ledger => {
      credentialState(ledger, 'fixture', clock.now).buckets.core = {
        limit,
        remaining,
        resetAt: clock.now + 60000,
        observedAt: clock.now,
      };
    });
  return { clock, store, fake, client, budget };
}

describe('in-flight request policy isolation', () => {
  it('admits a funded repair while an identical poll is shed', async () => {
    const { client, budget, fake } = setup();
    await budget(100);
    const results = await Promise.allSettled([
      client.request({ url, priority: 'poll' }),
      client.request({ url, priority: 'repair' }),
    ]);
    expect(results[0]).toMatchObject({
      status: 'rejected',
      reason: { kind: 'shed' },
    });
    expect(results[1]).toMatchObject({
      status: 'fulfilled',
      value: { status: 200 },
    });
    expect(fake.calls).toHaveLength(1);
  });

  it('keeps a report TTL hit from satisfying a fresh repair read', async () => {
    let state = 'old';
    const { client, fake } = setup(() => ({ body: { state } }));
    await client.request({ url, cacheTtlMs: 60000 });
    state = 'new';
    const [report, repair] = await Promise.all([
      client.request({ url, priority: 'report', cacheTtlMs: 60000 }),
      client.request({ url, priority: 'repair', conditional: false }),
    ]);
    expect(report.fromCache).toBe('ttl');
    expect(report.json()).toEqual({ state: 'old' });
    expect(repair.fromCache).toBeNull();
    expect(repair.json()).toEqual({ state: 'new' });
    expect(fake.calls).toHaveLength(2);
  });

  it('gives identical reads their own wait budgets', async () => {
    const { client, budget, fake, clock } = setup();
    const started = clock.now;
    await budget(0);
    const results = await Promise.allSettled([
      client.request({ url, priority: 'repair', maxWaitMs: 0 }),
      client.request({ url, priority: 'repair', maxWaitMs: 60000 }),
    ]);
    expect(results[0]).toMatchObject({
      status: 'rejected',
      reason: { kind: 'budget' },
    });
    expect(results[1]).toMatchObject({
      status: 'fulfilled',
      value: { status: 200 },
    });
    expect(fake.calls).toHaveLength(1);
    expect(clock.now).toBe(started + 60000);
  });

  it('does not inherit an unfunded reservation from a more expensive read', async () => {
    const { client, budget, fake } = setup();
    await budget(5);
    const results = await Promise.allSettled([
      client.request({
        url,
        priority: 'repair',
        maxWaitMs: 0,
        costs: { core: 6 },
      }),
      client.request({
        url,
        priority: 'repair',
        maxWaitMs: 0,
        costs: { core: 1 },
      }),
    ]);
    expect(results[0]).toMatchObject({
      status: 'rejected',
      reason: { kind: 'budget' },
    });
    expect(results[1]).toMatchObject({
      status: 'fulfilled',
      value: { status: 200 },
    });
    expect(fake.calls).toHaveLength(1);
  });

  it('coalesces compatible funded reads into one network request', async () => {
    const { client, budget, fake } = setup();
    await budget(1);
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        client.request({ url, priority: 'repair' })
      )
    );
    expect(results.every(result => result.status === 200)).toBe(true);
    expect(fake.calls).toHaveLength(1);
  });

  it('treats omitted and explicit effective defaults as compatible', async () => {
    const { client, fake } = setup();
    await Promise.all([
      client.request({ url }),
      client.request({
        url,
        method: 'get',
        priority: 'default',
        conditional: true,
        cacheTtlMs: 0,
        costs: { core: 1 },
        idempotent: true,
        write: false,
        maxAttempts: CONTRACT.defaults.maxAttempts,
        maxWaitMs: CONTRACT.defaults.maxWaitMs.normal,
        timeoutMs: CONTRACT.defaults.timeoutMs,
        priceUsd: 0,
      }),
    ]);
    expect(fake.calls).toHaveLength(1);
  });

  it('keeps the representation cache shared across compatible freshness policies', async () => {
    const { client, fake } = setup();
    await client.request({ url, priority: 'report', cacheTtlMs: 60000 });
    const repair = await client.request({
      url,
      priority: 'repair',
      cacheTtlMs: 60000,
    });
    expect(repair.fromCache).toBe('ttl');
    expect(fake.calls).toHaveLength(1);
  });

  it('validates priority before accepting a TTL hit with an explicit wait budget', async () => {
    const { client, fake } = setup();
    await client.request({ url, cacheTtlMs: 60000 });
    const invalid = {
      url,
      priority: 'unknown',
      cacheTtlMs: 60000,
      maxWaitMs: 0,
    } as unknown as RequestOptions;
    await expect(client.request(invalid)).rejects.toThrow(
      'unknown API priority'
    );
    expect(fake.calls).toHaveLength(1);
  });

  it('honors the explicit coalescing opt-out', async () => {
    const { client, fake } = setup();
    await Promise.all([
      client.request({ url, coalesce: false }),
      client.request({ url, coalesce: false }),
    ]);
    expect(fake.calls).toHaveLength(2);
  });

  it('coalesces compatible GraphQL reads into one funded request', async () => {
    const { client, store, clock, fake } = setup();
    await store.transact('github', ledger => {
      credentialState(ledger, 'fixture', clock.now).buckets.graphql = {
        limit: 1,
        remaining: 1,
        resetAt: clock.now + 60000,
        observedAt: clock.now,
      };
    });
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        client.request({
          url: 'https://api.github.com/graphql',
          method: 'POST',
          body: { query: 'query { viewer { login } }' },
          priority: 'repair',
          maxWaitMs: 0,
        })
      )
    );
    expect(results.every(result => result.status === 200)).toBe(true);
    expect(fake.calls).toHaveLength(1);
  });

  it('reserves and executes GraphQL mutations independently', async () => {
    const { client, fake, clock } = setup();
    const started = clock.now;
    await Promise.all(
      Array.from({ length: 2 }, () =>
        client.request({
          url: 'https://api.github.com/graphql',
          method: 'POST',
          body: {
            query:
              'mutation { addStar(input: {starrableId: "fixture"}) {clientMutationId} }',
          },
          priority: 'repair',
        })
      )
    );
    expect(fake.calls).toHaveLength(2);
    const attempts = Object.values((await client.state())?.usage ?? {}).reduce(
      (sum, hour) => sum + (hour.repair?.attempts ?? 0),
      0
    );
    expect(attempts).toBe(2);
    expect(clock.now).toBe(started + 1000);
  });

  it('retains independent caller cancellation and timeout policies', async () => {
    const { client, fake } = setup();
    await Promise.all([
      client.request({ url, signal: new AbortController().signal }),
      client.request({ url, signal: new AbortController().signal }),
      client.request({ url, timeoutMs: 1000 }),
      client.request({ url, timeoutMs: 2000 }),
    ]);
    expect(fake.calls).toHaveLength(4);
  });
});
