import { afterEach, describe, expect, it } from 'vitest';
import type {
  SummerBottleneckRecord,
  SummerBottleneckStore,
  SymphonyRepairTask,
} from '../agent/lib/summer-bottleneck-loop';
import { createVercelBlobBottleneckDependencies } from '../agent/lib/vercel-blob-bottleneck-runtime';

const KEY = 'a'.repeat(64);
const task: SymphonyRepairTask = {
  schema: 'jovie-symphony-repair-task/v1',
  taskKey: KEY,
  createdAt: '2026-09-02T08:00:00.000Z',
  owner: 'symphony',
  route: 'symphony',
  action: 'reconcile-release-certification-starvation',
  issue: 'JOV-5853',
  safety: 'exact-source-ci-native-queue-production-gates-remain-required',
  source: {
    sourceVersion: 'b'.repeat(40),
    snapshotDigest: 'c'.repeat(64),
  },
};

function storeHarness() {
  const records = new Map<string, SummerBottleneckRecord>();
  const store: SummerBottleneckStore = {
    async create(pathname, record) {
      if (records.has(pathname)) return 'exists';
      records.set(pathname, record);
      return 'created';
    },
    async read(pathname) {
      return records.get(pathname) ?? null;
    },
    async list(prefix) {
      return [...records.entries()]
        .filter(([pathname]) => pathname.startsWith(prefix))
        .map(([pathname, record]) => ({ pathname, record }));
    },
  };
  return { records, store };
}

describe('Vercel Blob Summer bottleneck runtime', () => {
  afterEach(() => {
    delete process.env.EVE_CORE_CHAT_AUTH_TOKEN;
  });

  it('fails closed without existing Eve signing authority', () => {
    expect(() => createVercelBlobBottleneckDependencies()).toThrow(
      'Eve receipt signing authority is unavailable'
    );
  });

  it('idempotently routes one source-bound task to the Symphony outbox', async () => {
    process.env.EVE_CORE_CHAT_AUTH_TOKEN = 'existing-eve-auth-token-for-test';
    const proof = storeHarness();
    const runtime = createVercelBlobBottleneckDependencies(proof.store);

    await expect(
      runtime.dispatchToSymphony(task, { idempotencyKey: KEY })
    ).resolves.toEqual({ handle: `symphony:${KEY}` });
    await expect(
      runtime.dispatchToSymphony(task, { idempotencyKey: KEY })
    ).resolves.toEqual({ handle: `symphony:${KEY}` });
    expect(
      [...proof.records.keys()].filter(path =>
        path.includes('/symphony-outbox/')
      )
    ).toHaveLength(1);
  });

  it('rejects a task whose key does not match the idempotency envelope', async () => {
    process.env.EVE_CORE_CHAT_AUTH_TOKEN = 'existing-eve-auth-token-for-test';
    const runtime = createVercelBlobBottleneckDependencies(
      storeHarness().store
    );

    await expect(
      runtime.dispatchToSymphony(task, { idempotencyKey: 'd'.repeat(64) })
    ).rejects.toThrow('Symphony task key does not match idempotency key');
  });

  it('rejects a conflicting durable task at the same outbox key', async () => {
    process.env.EVE_CORE_CHAT_AUTH_TOKEN = 'existing-eve-auth-token-for-test';
    const proof = storeHarness();
    proof.records.set(`summer-bottleneck/symphony-outbox/${KEY}.json`, {
      schema: 'jovie.eve.symphony-repair-outbox/v1',
      destination: 'symphony',
      idempotencyKey: KEY,
      status: 'ready',
      task: {
        ...task,
        source: { ...task.source, snapshotDigest: 'd'.repeat(64) },
      },
    });
    const runtime = createVercelBlobBottleneckDependencies(proof.store);

    await expect(
      runtime.dispatchToSymphony(task, { idempotencyKey: KEY })
    ).rejects.toThrow('Symphony outbox conflict');
  });

  it('observes only a cross-bound terminal Symphony outcome', async () => {
    process.env.EVE_CORE_CHAT_AUTH_TOKEN = 'existing-eve-auth-token-for-test';
    const proof = storeHarness();
    const runtime = createVercelBlobBottleneckDependencies(proof.store);
    await expect(
      runtime.observeSymphonyOutcome({
        handle: `symphony:${KEY}`,
        idempotencyKey: KEY,
      })
    ).resolves.toEqual({ status: 'pending', detail: 'awaiting-symphony' });

    proof.records.set(`summer-bottleneck/symphony-terminal/${KEY}.json`, {
      schema: 'jovie.symphony-repair-outcome/v1',
      taskKey: KEY,
      status: 'succeeded',
      detail: 'release certification recovered',
    });
    await expect(
      runtime.observeSymphonyOutcome({
        handle: `symphony:${KEY}`,
        idempotencyKey: KEY,
      })
    ).resolves.toEqual({
      status: 'succeeded',
      detail: 'release certification recovered',
    });
  });

  it('rejects a cross-bound Symphony handle', async () => {
    process.env.EVE_CORE_CHAT_AUTH_TOKEN = 'existing-eve-auth-token-for-test';
    const runtime = createVercelBlobBottleneckDependencies(
      storeHarness().store
    );

    await expect(
      runtime.observeSymphonyOutcome({
        handle: `symphony:${'d'.repeat(64)}`,
        idempotencyKey: KEY,
      })
    ).rejects.toThrow('Symphony handle is not source-bound');
  });

  it('rejects malformed and cross-bound terminal outcomes', async () => {
    process.env.EVE_CORE_CHAT_AUTH_TOKEN = 'existing-eve-auth-token-for-test';
    const proof = storeHarness();
    proof.records.set(`summer-bottleneck/symphony-terminal/${KEY}.json`, {
      schema: 'jovie.symphony-repair-outcome/v1',
      taskKey: 'd'.repeat(64),
      status: 'succeeded',
      detail: 'wrong task',
    });
    const runtime = createVercelBlobBottleneckDependencies(proof.store);

    await expect(
      runtime.observeSymphonyOutcome({
        handle: `symphony:${KEY}`,
        idempotencyKey: KEY,
      })
    ).rejects.toThrow('Symphony outcome is malformed or cross-bound');
  });
});
