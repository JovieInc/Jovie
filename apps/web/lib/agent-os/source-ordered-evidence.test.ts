import { describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '@/lib/agent-distribution/hash';
import {
  deliveryOrderSchema,
  SOURCE_ORDER_SCHEMA,
  storeOrderedEvidence,
} from './source-ordered-evidence';

type Input = Parameters<typeof storeOrderedEvidence>[0];
type Backend = Input['backend'];
const KEY = 'component-certificate:latest';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function packet(ordinal = 20, sha = 'b', runNumber = 2, runAttempt = 1) {
  return {
    headSha: sha.repeat(40),
    deliveryOrder: {
      schema: SOURCE_ORDER_SCHEMA,
      sourceOrdinal: ordinal,
      runNumber,
      runAttempt,
    },
    totals: { components: 12, certified: 4 },
  };
}

/** Model durable JSON values, never the caller's object references. */
function durableBackend(initial: unknown = null) {
  let stored = clone(initial);
  const reads: unknown[] = [];
  const backend = {
    get: vi.fn(async (_key: string): Promise<unknown> => {
      const value = clone(stored);
      reads.push(value);
      return value;
    }),
    setIfAbsent: vi.fn(
      async (_key: string, next: unknown, _ttlSeconds: number) => {
        if (stored !== null) return false;
        stored = clone(next);
        return true;
      }
    ),
    compareAndSet: vi.fn(
      async (
        _key: string,
        expected: unknown,
        next: unknown,
        _ttlSeconds: number
      ) => {
        if (canonicalJson(stored) !== canonicalJson(expected)) return false;
        stored = clone(next);
        return true;
      }
    ),
  } satisfies Backend;
  return { backend, reads, read: () => clone(stored) };
}

function noWrites(backend: ReturnType<typeof durableBackend>['backend']) {
  expect(backend.setIfAbsent).not.toHaveBeenCalled();
  expect(backend.compareAndSet).not.toHaveBeenCalled();
}

/** Both writers receive the same snapshot before either may mutate it. */
function race(
  state: ReturnType<typeof durableBackend>,
  method: 'setIfAbsent' | 'compareAndSet',
  winner: Input['packet']
) {
  const together = Promise.withResolvers<void>();
  const firstWrite = Promise.withResolvers<void>();
  const get = state.backend.get.getMockImplementation()!;
  let arrivals = 0;
  state.backend.get.mockImplementation(async key => {
    const snapshot = await get(key);
    if (arrivals < 2) {
      arrivals += 1;
      if (arrivals === 2) together.resolve();
      await together.promise;
    }
    return snapshot;
  });
  if (method === 'setIfAbsent') {
    const insert = state.backend.setIfAbsent.getMockImplementation()!;
    state.backend.setIfAbsent.mockImplementation(async (key, next, ttl) => {
      const chosen = canonicalJson(next) === canonicalJson(winner);
      if (!chosen) await firstWrite.promise;
      const result = await insert(key, next, ttl);
      if (chosen) firstWrite.resolve();
      return result;
    });
  } else {
    const update = state.backend.compareAndSet.getMockImplementation()!;
    state.backend.compareAndSet.mockImplementation(
      async (key, expected, next, ttl) => {
        const chosen = canonicalJson(next) === canonicalJson(winner);
        if (!chosen) await firstWrite.promise;
        const result = await update(key, expected, next, ttl);
        if (chosen) firstWrite.resolve();
        return result;
      }
    );
  }
}

const deliver = (backend: Backend, value: Input['packet']) =>
  storeOrderedEvidence({ backend, key: KEY, packet: value });

describe('source-ordered evidence persistence', () => {
  it('atomically inserts and updates JSON snapshots with a positive TTL', async () => {
    const state = durableBackend();
    const older = packet(10, 'a');
    const newer = packet();
    expect(await deliver(state.backend, older)).toEqual({
      accepted: true,
      reason: 'stored',
      packet: older,
    });
    expect(await deliver(state.backend, newer)).toEqual({
      accepted: true,
      reason: 'stored',
      packet: newer,
    });
    expect(state.read()).toEqual(newer);
    expect(state.backend.setIfAbsent).toHaveBeenCalledExactlyOnceWith(
      KEY,
      older,
      expect.any(Number)
    );
    const [key, expected, next, ttl] =
      state.backend.compareAndSet.mock.calls[0];
    expect(key).toBe(KEY);
    expect(expected).toBe(state.reads[1]);
    expect(expected).not.toBe(older);
    expect(next).toEqual(newer);
    expect(Number.isSafeInteger(ttl) && ttl > 0).toBe(true);
    expect(state.backend.setIfAbsent.mock.calls[0][2]).toBe(ttl);
    newer.totals.certified = 99;
    expect(state.read()).not.toEqual(newer);
  });

  for (const first of ['older', 'newer'] as const) {
    it(`retains newer source after competing first inserts, ${first} completes first`, async () => {
      const state = durableBackend();
      const older = packet(10, 'a', 99, 99);
      const newer = packet(20, 'b', 1, 1);
      race(state, 'setIfAbsent', first === 'older' ? older : newer);
      const [oldResult, newResult] = await Promise.all([
        deliver(state.backend, older),
        deliver(state.backend, newer),
      ]);
      expect(state.read()).toEqual(newer);
      expect(newResult).toMatchObject({ accepted: true, reason: 'stored' });
      expect(oldResult).toEqual(
        first === 'older'
          ? { accepted: true, reason: 'stored', packet: older }
          : { accepted: false, reason: 'stale', packet: newer }
      );
      expect(state.backend.get.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(state.backend.setIfAbsent).toHaveBeenCalledTimes(2);
    });

    it(`re-evaluates competing CAS updates, ${first} completes first`, async () => {
      const state = durableBackend(packet(5, 'c'));
      const older = packet(10, 'a', 99, 99);
      const newer = packet(20, 'b', 1, 1);
      race(state, 'compareAndSet', first === 'older' ? older : newer);
      const [oldResult, newResult] = await Promise.all([
        deliver(state.backend, older),
        deliver(state.backend, newer),
      ]);
      expect(state.read()).toEqual(newer);
      expect(newResult).toMatchObject({ accepted: true, reason: 'stored' });
      expect(oldResult).toEqual(
        first === 'older'
          ? { accepted: true, reason: 'stored', packet: older }
          : { accepted: false, reason: 'stale', packet: newer }
      );
      expect(state.backend.get.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(state.backend.setIfAbsent).not.toHaveBeenCalled();
      expect(state.backend.compareAndSet).toHaveBeenCalledTimes(
        first === 'older' ? 3 : 2
      );
    });

    it(`prevents legacy delivery from undoing ordered cutover, ${first} completes first`, async () => {
      const state = durableBackend({ headSha: 'c'.repeat(40), legacy: 'base' });
      const legacy = { headSha: 'a'.repeat(40), legacy: 'replacement' };
      const ordered = packet();
      race(state, 'compareAndSet', first === 'older' ? legacy : ordered);
      const [legacyResult, orderedResult] = await Promise.all([
        deliver(state.backend, legacy),
        deliver(state.backend, ordered),
      ]);
      expect(state.read()).toEqual(ordered);
      expect(orderedResult).toMatchObject({ accepted: true, reason: 'stored' });
      expect(legacyResult).toEqual(
        first === 'older'
          ? { accepted: true, reason: 'stored', packet: legacy }
          : { accepted: false, reason: 'legacy-after-ordered', packet: ordered }
      );
      expect(state.backend.get.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
  }

  it('allows legacy records only until the ordered cutover and never blindly sets', async () => {
    const state = durableBackend();
    const legacy = { headSha: 'a'.repeat(40), totals: { certified: 0 } };
    expect(await deliver(state.backend, legacy)).toMatchObject({
      reason: 'stored',
    });
    const replacement = { ...legacy, totals: { certified: 1 } };
    expect(await deliver(state.backend, replacement)).toMatchObject({
      reason: 'stored',
    });
    expect(state.backend.compareAndSet).toHaveBeenCalledTimes(1);
    const ordered = packet();
    await deliver(state.backend, ordered);
    state.backend.compareAndSet.mockClear();
    expect(await deliver(state.backend, legacy)).toEqual({
      accepted: false,
      reason: 'legacy-after-ordered',
      packet: ordered,
    });
    expect(state.backend.compareAndSet).not.toHaveBeenCalled();
    expect(state.read()).toEqual(ordered);
  });

  it.each([
    ['older source despite larger run', packet(19, 'a', 999, 999), 'stale'],
    ['same ordinal with another SHA', packet(20, 'a'), 'conflict'],
    ['same SHA with higher ordinal', packet(21, 'b'), 'conflict'],
    ['same SHA with lower ordinal', packet(19, 'b'), 'conflict'],
    ['older run despite larger attempt', packet(20, 'b', 1, 999), 'stale'],
    ['older attempt', packet(20, 'b', 2, 1), 'stale'],
  ])(
    'rejects %s without writes and returns the persisted packet',
    async (_name, next, reason) => {
      const current = packet(20, 'b', 2, 2);
      const state = durableBackend(current);
      expect(await deliver(state.backend, next)).toEqual({
        accepted: false,
        reason,
        packet: current,
      });
      noWrites(state.backend);
      expect(state.read()).toEqual(current);
    }
  );

  it.each([
    ['newer run with reset attempt', packet(20, 'b', 3, 1)],
    ['newer attempt in the same run', packet(20, 'b', 2, 3)],
  ])('accepts %s for the same source', async (_name, next) => {
    const state = durableBackend(packet(20, 'b', 2, 2));
    expect(await deliver(state.backend, next)).toEqual({
      accepted: true,
      reason: 'stored',
      packet: next,
    });
    expect(state.read()).toEqual(next);
    expect(state.backend.compareAndSet).toHaveBeenCalledTimes(1);
  });

  it('treats recursively reordered duplicate JSON as idempotent without writes', async () => {
    const current = packet();
    const state = durableBackend(current);
    const duplicate = {
      totals: { certified: 4, components: 12 },
      deliveryOrder: {
        runAttempt: 1,
        runNumber: 2,
        sourceOrdinal: 20,
        schema: SOURCE_ORDER_SCHEMA,
      },
      headSha: current.headSha,
    };
    expect(await deliver(state.backend, duplicate)).toEqual({
      accepted: true,
      reason: 'duplicate',
      packet: current,
    });
    noWrites(state.backend);
  });

  it('rejects different content at exactly the same order without writes', async () => {
    const current = packet();
    const state = durableBackend(current);
    expect(
      await deliver(state.backend, {
        ...current,
        totals: { components: 12, certified: 5 },
      })
    ).toEqual({
      accepted: false,
      reason: 'conflict',
      packet: current,
    });
    noWrites(state.backend);
  });

  const invalidOrders = [
    null,
    {},
    { schema: SOURCE_ORDER_SCHEMA },
    { ...packet().deliveryOrder, schema: 'jovie.source-order/v0' },
    { ...packet().deliveryOrder, extra: true },
    ...['sourceOrdinal', 'runNumber', 'runAttempt'].flatMap(key =>
      [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN].map(value => ({
        ...packet().deliveryOrder,
        [key]: value,
      }))
    ),
  ];

  it.each(invalidOrders.map((order, index) => ({ order, index })))(
    'rejects malformed incoming order $index before reading storage',
    async ({ order }) => {
      const state = durableBackend();
      expect(deliveryOrderSchema.safeParse(order).success).toBe(false);
      await expect(
        deliver(state.backend, { ...packet(), deliveryOrder: order })
      ).rejects.toThrow();
      expect(state.backend.get).not.toHaveBeenCalled();
      noWrites(state.backend);
    }
  );

  it.each(['', 'g'.repeat(40), 'a'.repeat(39), 'A'.repeat(40)])(
    'rejects malformed source SHA %s before reading storage',
    async headSha => {
      const state = durableBackend();
      await expect(
        deliver(state.backend, { ...packet(), headSha })
      ).rejects.toThrow();
      expect(state.backend.get).not.toHaveBeenCalled();
      noWrites(state.backend);
    }
  );

  it.each([null, {}, { ...packet().deliveryOrder, unexpected: true }])(
    'fails closed on malformed stored order %j',
    async deliveryOrder => {
      const state = durableBackend({ ...packet(), deliveryOrder });
      await expect(deliver(state.backend, packet(21, 'c'))).rejects.toThrow();
      expect(state.backend.get).toHaveBeenCalledTimes(1);
      noWrites(state.backend);
    }
  );

  it.each(['setIfAbsent', 'compareAndSet'] as const)(
    'bounds repeated %s conflicts to five attempts',
    async method => {
      const state = durableBackend(
        method === 'setIfAbsent' ? null : packet(10, 'a')
      );
      state.backend[method].mockResolvedValue(false);
      await expect(deliver(state.backend, packet())).rejects.toThrow(
        /compare-and-set/i
      );
      expect(state.backend.get).toHaveBeenCalledTimes(5);
      expect(state.backend[method]).toHaveBeenCalledTimes(5);
      expect(state.read()).toEqual(
        method === 'setIfAbsent' ? null : packet(10, 'a')
      );
    }
  );
});
