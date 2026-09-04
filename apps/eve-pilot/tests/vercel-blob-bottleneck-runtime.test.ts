import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type {
  SummerBottleneckRecord,
  SummerBottleneckStore,
  SymphonyRepairTask,
} from '../agent/lib/summer-bottleneck-loop';
import {
  createVercelBlobBottleneckDependencies,
  type SummerBottleneckRuntimeSecurity,
  signSymphonyRepairOutcome,
} from '../agent/lib/vercel-blob-bottleneck-runtime';

const KEY = 'a'.repeat(64);
const EVE_RECEIPT_KEY = 'r'.repeat(64);
const eveKeys = generateKeyPairSync('ed25519');
const symphonyKeys = generateKeyPairSync('ed25519');
const producerKeys = generateKeyPairSync('ed25519');
const EVE_OUTBOX_PRIVATE_KEY = eveKeys.privateKey
  .export({
    format: 'pem',
    type: 'pkcs8',
  })
  .toString();
const EVE_OUTBOX_PUBLIC_KEY = eveKeys.publicKey
  .export({
    format: 'pem',
    type: 'spki',
  })
  .toString();
const SYMPHONY_PRIVATE_KEY = symphonyKeys.privateKey
  .export({
    format: 'pem',
    type: 'pkcs8',
  })
  .toString();
const SYMPHONY_PUBLIC_KEY = symphonyKeys.publicKey
  .export({
    format: 'pem',
    type: 'spki',
  })
  .toString();
const PRODUCER_PUBLIC_KEY = producerKeys.publicKey
  .export({
    format: 'pem',
    type: 'spki',
  })
  .toString();
const security: SummerBottleneckRuntimeSecurity = {
  receiptSigningKey: EVE_RECEIPT_KEY,
  receiptSigningKeyId: 'eve-receipt-2026-09',
  producerVerificationKeys: new Map([
    ['jovie-production-2026-09', PRODUCER_PUBLIC_KEY],
  ]),
  eveOutboxSigningPrivateKey: EVE_OUTBOX_PRIVATE_KEY,
  eveOutboxSigningKeyId: 'eve-outbox-2026-09',
  eveOutboxVerificationKeys: new Map([
    ['eve-outbox-2026-09', EVE_OUTBOX_PUBLIC_KEY],
  ]),
  symphonyOutcomeVerificationKeys: new Map([
    ['symphony-outcome-2026-09', SYMPHONY_PUBLIC_KEY],
  ]),
};
const task: SymphonyRepairTask = {
  schema: 'jovie-symphony-repair-task/v1',
  taskKey: KEY,
  createdAt: '2026-09-02T08:00:00.000Z',
  owner: 'symphony',
  route: 'symphony',
  authority: 'source-repair-only-no-direct-pr-queue-or-deploy-mutation',
  action: 'remediate-selected-ci-audit-class',
  issue: 'JOV-5853',
  safety: 'exact-source-ci-native-queue-production-gates-remain-required',
  selected: {
    id: 'merge-group-flake-baseline-ratchet',
    sourceRevision: 'b'.repeat(40),
    sourceDigest: 'd'.repeat(64),
    owner: 'ci-reliability',
    handle: 'audit:merge-group-flakes',
  },
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
    async list(prefix, options) {
      const entries = [...records.entries()]
        .filter(([pathname]) => pathname.startsWith(prefix))
        .map(([pathname, record]) => ({ pathname, record }));
      return {
        entries: entries.slice(0, options.limit),
        hasMore: false,
        scanned: Math.min(entries.length, options.limit),
      };
    },
    async write(pathname, record) {
      records.set(pathname, record);
    },
  };
  return { records, store };
}

function signedOutcome(overrides: SummerBottleneckRecord = {}) {
  return signSymphonyRepairOutcome(
    {
      schema: 'jovie.symphony-repair-outcome/v1',
      taskKey: KEY,
      status: 'succeeded',
      detail: 'release certification recovered',
      completedAt: '2026-09-02T08:01:00.000Z',
      source: {
        action: task.action,
        sourceVersion: task.source.sourceVersion,
        snapshotDigest: task.source.snapshotDigest,
      },
      ...overrides,
    },
    SYMPHONY_PRIVATE_KEY,
    'symphony-outcome-2026-09'
  );
}

describe('Vercel Blob Summer bottleneck runtime', () => {
  it('fails closed without distinct dedicated signing authorities', () => {
    expect(() => createVercelBlobBottleneckDependencies()).toThrow(
      'dedicated Summer and Symphony signing authority is unavailable'
    );
    expect(() =>
      createVercelBlobBottleneckDependencies(storeHarness().store, {
        ...security,
        eveOutboxVerificationKeys: new Map([
          ['eve-outbox-2026-09', SYMPHONY_PUBLIC_KEY],
        ]),
      })
    ).toThrow('dedicated Summer and Symphony signing authority is unavailable');
    expect(() =>
      createVercelBlobBottleneckDependencies(storeHarness().store, {
        ...security,
        producerVerificationKeys: new Map([
          ['jovie-production-2026-09', SYMPHONY_PUBLIC_KEY],
        ]),
      })
    ).toThrow('dedicated Summer and Symphony signing authority is unavailable');
  });

  it('idempotently persists one signed source-bound Symphony outbox item', async () => {
    const proof = storeHarness();
    const runtime = createVercelBlobBottleneckDependencies(
      proof.store,
      security
    );

    await expect(
      runtime.dispatchToSymphony(task, { idempotencyKey: KEY })
    ).resolves.toEqual({ handle: `symphony:${KEY}` });
    await expect(
      runtime.dispatchToSymphony(task, { idempotencyKey: KEY })
    ).resolves.toEqual({ handle: `symphony:${KEY}` });
    expect(
      proof.records.get(`summer-bottleneck/symphony-outbox/${KEY}.json`)
    ).toMatchObject({
      signature: expect.stringMatching(/^ed25519=[A-Za-z0-9_-]{86}$/u),
      signatureKeyId: 'eve-outbox-2026-09',
      task,
    });
  });

  it('rejects a mismatched task key and a conflicting outbox record', async () => {
    const proof = storeHarness();
    const runtime = createVercelBlobBottleneckDependencies(
      proof.store,
      security
    );
    await expect(
      runtime.dispatchToSymphony(task, { idempotencyKey: 'd'.repeat(64) })
    ).rejects.toThrow('Symphony task key does not match idempotency key');
    proof.records.set(`summer-bottleneck/symphony-outbox/${KEY}.json`, {
      schema: 'forged',
    });
    await expect(
      runtime.dispatchToSymphony(task, { idempotencyKey: KEY })
    ).rejects.toThrow('Symphony outbox conflict');
  });

  it('rejects a task whose bounded action is cross-bound to its selected class', async () => {
    const runtime = createVercelBlobBottleneckDependencies(
      storeHarness().store,
      security
    );
    const crossBound = {
      ...task,
      action: 'reconcile-release-certification-starvation',
    } as unknown as SymphonyRepairTask;

    await expect(
      runtime.dispatchToSymphony(crossBound, { idempotencyKey: KEY })
    ).rejects.toThrow('Symphony repair task is outside the bounded contract');
  });

  it('accepts only a separately signed, exact-task-bound Symphony outcome', async () => {
    const proof = storeHarness();
    const runtime = createVercelBlobBottleneckDependencies(
      proof.store,
      security
    );
    await runtime.dispatchToSymphony(task, { idempotencyKey: KEY });
    await expect(
      runtime.observeSymphonyOutcome({
        handle: `symphony:${KEY}`,
        idempotencyKey: KEY,
      })
    ).resolves.toEqual({ status: 'pending', detail: 'awaiting-symphony' });
    proof.records.set(
      `summer-bottleneck/symphony-terminal/${KEY}.json`,
      signedOutcome()
    );
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

  it.each([
    ['unsigned', { schema: 'jovie.symphony-repair-outcome/v1' }],
    [
      'cross-bound',
      signedOutcome({
        source: { ...task.source, action: 'different-action' },
      }),
    ],
    ['cross-task', signedOutcome({ taskKey: 'e'.repeat(64) })],
  ])('rejects an %s Symphony outcome', async (_name, outcome) => {
    const proof = storeHarness();
    const runtime = createVercelBlobBottleneckDependencies(
      proof.store,
      security
    );
    await runtime.dispatchToSymphony(task, { idempotencyKey: KEY });
    proof.records.set(
      `summer-bottleneck/symphony-terminal/${KEY}.json`,
      outcome
    );
    await expect(
      runtime.observeSymphonyOutcome({
        handle: `symphony:${KEY}`,
        idempotencyKey: KEY,
      })
    ).rejects.toThrow(
      'Symphony outcome is malformed, unauthenticated, or cross-bound'
    );
  });

  it('rejects a cross-bound handle or forged outbox', async () => {
    const proof = storeHarness();
    const runtime = createVercelBlobBottleneckDependencies(
      proof.store,
      security
    );
    await expect(
      runtime.observeSymphonyOutcome({
        handle: 'symphony:wrong',
        idempotencyKey: KEY,
      })
    ).rejects.toThrow('Symphony handle is not source-bound');
    proof.records.set(`summer-bottleneck/symphony-outbox/${KEY}.json`, {
      schema: 'forged',
    });
    await expect(
      runtime.observeSymphonyOutcome({
        handle: `symphony:${KEY}`,
        idempotencyKey: KEY,
      })
    ).rejects.toThrow('Symphony outbox is unavailable or unauthenticated');
  });
});
