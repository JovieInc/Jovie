import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { type ApiClientOptions, ApiError, createApiClient } from './client.ts';
import {
  createFakeProvider,
  FakeClock,
  type FakeStyle,
} from './fake-provider.ts';
import { FileLedgerStore, MemoryLedgerStore } from './store.ts';

const GH = 'https://api.github.com';

function setup(
  style: FakeStyle = 'github',
  extra: Partial<ApiClientOptions> = {}
) {
  const clock = new FakeClock();
  const fake = createFakeProvider({ style, clock });
  const events: Record<string, unknown>[] = [];
  const store = extra.store ?? new MemoryLedgerStore();
  const make = (more: Partial<ApiClientOptions> = {}) =>
    createApiClient({
      provider:
        style === 'linear'
          ? 'linear'
          : style === 'github'
            ? 'github'
            : 'vercel',
      credential: 'cred-a',
      store,
      fetch: fake.fetch,
      now: clock.read,
      sleep: clock.sleep,
      random: () => 0.5,
      log: e => events.push(e),
      ...extra,
      ...more,
    });
  return { clock, fake, events, store, client: make(), make };
}

describe('createApiClient against a fake provider', () => {
  it('sheds polling below its reserve while merge calls still land', async () => {
    const { fake, client } = setup();
    fake.setRemaining('core', 1300); // limit 5000, poll floor 1250
    await client.request({ url: `${GH}/repos/o/r/pulls`, priority: 'poll' });
    fake.setRemaining('core', 1200);
    await client.request({ url: `${GH}/repos/o/r/pulls/1`, priority: 'merge' });
    await expect(
      client.request({ url: `${GH}/repos/o/r/pulls/2`, priority: 'poll' })
    ).rejects.toMatchObject({
      kind: 'shed',
      exitCode: 75,
    });
    const merged = await client.request({
      url: `${GH}/repos/o/r/pulls/3/merge`,
      method: 'PUT',
      priority: 'merge',
    });
    expect(merged.status).toBe(200);
    expect(fake.calls.filter(c => c.path.endsWith('/pulls/2'))).toHaveLength(0);
  });

  it('honors Retry-After on a 429 before retrying', async () => {
    const { clock, fake, client } = setup('generic');
    fake.fault({ kind: 'status', status: 429, retryAfterS: 7 });
    const start = clock.now;
    const res = await client.request({
      url: 'https://api.vercel.com/v6/deployments',
    });
    expect(res.status).toBe(200);
    expect(res.attempts).toBe(2);
    expect(clock.now - start).toBeGreaterThanOrEqual(7000);
  });

  it('opens the breaker on a secondary limit, blocks everyone, then closes on a good probe', async () => {
    const { clock, fake, client, events } = setup();
    fake.fault({ kind: 'secondary', retryAfterS: 60 });
    await expect(
      client.request({ url: `${GH}/repos/o/r`, maxWaitMs: 0 })
    ).rejects.toBeInstanceOf(ApiError);
    expect(events.at(-1)).toMatchObject({
      schema: 'jovie.api-client.breaker/v1',
      from: 'closed',
      to: 'open',
      reason: 'secondary-rate-limit',
    });
    await expect(
      client.request({ url: `${GH}/repos/o/r/issues`, priority: 'poll' })
    ).rejects.toMatchObject({ kind: 'shed' });
    clock.now += 61_000;
    await client.request({ url: `${GH}/repos/o/r/issues` });
    expect(events.map(e => `${e.from}->${e.to}`)).toEqual([
      'closed->open',
      'open->half-open',
      'half-open->closed',
    ]);
    expect(fake.calls).toHaveLength(2);
  });

  it('retries idempotent reads on 5xx with backoff, but never re-sends a failed POST', async () => {
    const { fake, client } = setup();
    fake.fault({ kind: 'status', status: 502 }, { kind: 'network' });
    expect((await client.request({ url: `${GH}/repos/o/r` })).attempts).toBe(3);
    fake.fault({ kind: 'status', status: 502 });
    await expect(
      client.request({
        url: `${GH}/repos/o/r/issues`,
        method: 'POST',
        body: { title: 't' },
      })
    ).rejects.toMatchObject({ kind: 'exhausted', status: 502 });
    expect(fake.calls.filter(c => c.method === 'POST')).toHaveLength(1);
  });

  it('waits out an exhausted bucket for critical work, and defers normal work past its budget', async () => {
    const { clock, fake, client } = setup();
    fake.setRemaining('graphql', 0);
    const query = { query: '{ viewer { login } }' };
    await expect(
      client.request({ url: `${GH}/graphql`, method: 'POST', body: query })
    ).rejects.toMatchObject({
      kind: 'exhausted',
      failure: 'primary',
    });
    // The ledger now knows the bucket is empty: no second network call.
    await expect(
      client.request({
        url: `${GH}/graphql`,
        method: 'POST',
        body: { query: '{ a }' },
      })
    ).rejects.toMatchObject({
      kind: 'budget',
    });
    expect(fake.calls).toHaveLength(1);
    const reset = fake.budget('graphql').resetAt;
    expect(reset - clock.now).toBeGreaterThan(30_000);
    const res = await client.request({
      url: `${GH}/graphql`,
      method: 'POST',
      body: query,
      priority: 'merge',
      maxWaitMs: 3_600_000,
    });
    expect(res.status).toBe(200);
    expect(clock.now).toBeGreaterThanOrEqual(reset);
  });

  it('serves repeated GETs from the ETag cache without spending budget', async () => {
    const { fake, client } = setup();
    await client.request({ url: `${GH}/repos/o/r/pulls` });
    const before = fake.budget('core').remaining;
    const again = await client.request({ url: `${GH}/repos/o/r/pulls` });
    expect(again.fromCache).toBe('etag');
    expect(again.json()).toEqual({ ok: true, path: '/repos/o/r/pulls' });
    expect(fake.budget('core').remaining).toBe(before);
    expect(fake.calls.map(c => c.status)).toEqual([200, 304]);
  });

  it('serves TTL hits with no network call and coalesces identical in-flight reads', async () => {
    const { fake, client } = setup();
    await Promise.all(
      Array.from({ length: 5 }, () =>
        client.request({ url: `${GH}/repos/o/r`, cacheTtlMs: 60_000 })
      )
    );
    expect(fake.calls).toHaveLength(1);
    const hit = await client.request({
      url: `${GH}/repos/o/r`,
      cacheTtlMs: 60_000,
    });
    expect(hit.fromCache).toBe('ttl');
    expect(fake.calls).toHaveLength(1);
    const state = await client.state();
    const usage = Object.values(state?.usage ?? {})[0]?.default;
    expect(usage).toMatchObject({ attempts: 1, ok: 1, cacheHits: 1 });
  });

  it('treats a Linear RATELIMITED 400 as an empty bucket until the reset', async () => {
    const { fake, client } = setup('linear');
    fake.setRemaining('requests', 0);
    const body = { query: '{ viewer { id } }' };
    await expect(
      client.request({
        url: 'https://api.linear.app/graphql',
        method: 'POST',
        body,
        maxWaitMs: 0,
      })
    ).rejects.toMatchObject({
      failure: 'primary',
    });
    await expect(
      client.request({
        url: 'https://api.linear.app/graphql',
        method: 'POST',
        body: { query: '{ a }' },
        priority: 'poll',
      })
    ).rejects.toMatchObject({ kind: 'shed' });
    expect(fake.calls).toHaveLength(1);
  });

  it('shares one budget across processes through the file ledger', async () => {
    const root = await mkdtemp(join(tmpdir(), 'api-ledger-'));
    const clock = new FakeClock();
    const first = setup('github', {
      store: new FileLedgerStore(root, clock.read),
      now: clock.read,
      sleep: clock.sleep,
    });
    first.fake.setRemaining('core', 1000);
    await first.client.request({ url: `${GH}/repos/o/r` });
    const second = createApiClient({
      provider: 'github',
      credential: 'cred-a',
      store: new FileLedgerStore(root, clock.read),
      fetch: first.fake.fetch,
      now: clock.read,
      sleep: clock.sleep,
    });
    await expect(
      second.request({ url: `${GH}/repos/o/r/pulls`, priority: 'poll' })
    ).rejects.toMatchObject({ kind: 'shed' });
    expect((await second.state())?.buckets.core?.remaining).toBe(999);
  });

  it('spaces writes by the provider interval', async () => {
    const { clock, client } = setup();
    const start = clock.now;
    await client.request({
      url: `${GH}/repos/o/r/issues`,
      method: 'POST',
      body: {},
      priority: 'repair',
    });
    await client.request({
      url: `${GH}/repos/o/r/issues`,
      method: 'POST',
      body: {},
      priority: 'repair',
    });
    expect(clock.now - start).toBeGreaterThanOrEqual(1000);
  });
});
