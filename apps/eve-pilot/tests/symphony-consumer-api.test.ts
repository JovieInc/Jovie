import {
  generateKeyPairSync,
  createHash as nodeCreateHash,
  sign as nodeSign,
} from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  handleSymphonyClaimRequest,
  handleSymphonyTerminalRequest,
} from '../agent/channels/summer-bottleneck';
import type {
  SummerBottleneckRecord,
  SummerBottleneckStore,
  SymphonyRepairTask,
} from '../agent/lib/summer-bottleneck-loop';
import {
  claimNextSymphonyTask,
  persistSymphonyTerminal,
  type SymphonyConsumerApiRuntime,
  verifySymphonyConsumerRequest,
} from '../agent/lib/symphony-consumer-api';
import {
  canonicalSummerBottleneckRecord,
  type SummerBottleneckRuntimeSecurity,
  signSymphonyRepairOutcome,
} from '../agent/lib/vercel-blob-bottleneck-runtime';

const NOW = new Date('2026-09-04T18:00:00.000Z');
const KEY = 'a'.repeat(64);
const SOURCE = 'b'.repeat(40);
const DIGEST = 'c'.repeat(64);
const eve = generateKeyPairSync('ed25519');
const symphony = generateKeyPairSync('ed25519');
const producer = generateKeyPairSync('ed25519');
const pem = {
  evePrivate: eve.privateKey
    .export({ format: 'pem', type: 'pkcs8' })
    .toString(),
  evePublic: eve.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
  symphonyPrivate: symphony.privateKey
    .export({ format: 'pem', type: 'pkcs8' })
    .toString(),
  symphonyPublic: symphony.publicKey
    .export({ format: 'pem', type: 'spki' })
    .toString(),
  producerPublic: producer.publicKey
    .export({ format: 'pem', type: 'spki' })
    .toString(),
};
const task: SymphonyRepairTask = {
  schema: 'jovie-symphony-repair-task/v1',
  taskKey: KEY,
  createdAt: '2026-09-04T17:59:00.000Z',
  owner: 'symphony',
  route: 'symphony',
  authority: 'source-repair-only-no-direct-pr-queue-or-deploy-mutation',
  action: 'remediate-selected-ci-audit-class',
  issue: 'JOV-5853',
  safety: 'exact-source-ci-native-queue-production-gates-remain-required',
  selected: {
    id: 'controller-cascade-coalescing',
    sourceRevision: SOURCE,
    sourceDigest: DIGEST,
    owner: 'ci-owner',
    handle: 'audit:controller-cascade',
  },
  source: { sourceVersion: SOURCE, snapshotDigest: DIGEST },
};

function signRecord(
  domain: string,
  record: SummerBottleneckRecord,
  privateKey: string,
  keyId: string
) {
  const unsigned = { ...record, signatureKeyId: keyId };
  return {
    ...unsigned,
    signature: `ed25519=${nodeSign(
      null,
      Buffer.from(`${domain}\0${canonicalSummerBottleneckRecord(unsigned)}`),
      privateKey
    ).toString('base64url')}`,
  };
}

function harness() {
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
      const entries = [...records]
        .filter(([pathname]) => pathname.startsWith(prefix))
        .map(([pathname, record]) => ({ pathname, record }));
      return {
        entries: entries.slice(0, options.limit),
        hasMore: entries.length > options.limit,
        scanned: Math.min(entries.length, options.limit),
      };
    },
    async write(pathname, record) {
      records.set(pathname, record);
    },
  };
  const security: SummerBottleneckRuntimeSecurity = {
    eveOutboxSigningPrivateKey: pem.evePrivate,
    eveOutboxSigningKeyId: 'eve-outbox-r2',
    eveOutboxVerificationKeys: new Map([['eve-outbox-r2', pem.evePublic]]),
    producerVerificationKeys: new Map([['producer-r1', pem.producerPublic]]),
    receiptSigningKey: 'r'.repeat(64),
    receiptSigningKeyId: 'receipt-r1',
    symphonyOutcomeVerificationKeys: new Map([
      ['symphony-outcome-r2', pem.symphonyPublic],
    ]),
  };
  const runtime: SymphonyConsumerApiRuntime = {
    now: () => NOW,
    security,
    store,
  };
  const outbox = signRecord(
    'jovie.eve.symphony-repair-outbox/v1',
    {
      schema: 'jovie.eve.symphony-repair-outbox/v1',
      destination: 'symphony',
      idempotencyKey: KEY,
      status: 'ready',
      task,
    },
    pem.evePrivate,
    'eve-outbox-r2'
  );
  return { records, runtime, outbox };
}

function signedOutcome(detail = 'bounded repair completed') {
  return signSymphonyRepairOutcome(
    {
      schema: 'jovie.symphony-repair-outcome/v1',
      taskKey: KEY,
      status: 'succeeded',
      detail,
      completedAt: NOW.toISOString(),
      source: {
        action: task.action,
        sourceVersion: task.source.sourceVersion,
        snapshotDigest: task.source.snapshotDigest,
      },
    },
    pem.symphonyPrivate,
    'symphony-outcome-r2'
  );
}

describe('Symphony consumer API runtime', () => {
  it('authenticates a fresh request bound to method, path, body, and key', () => {
    const { runtime } = harness();
    const request = new Request(
      'https://eve.example.com/ovie/v1/summer-bottleneck/symphony/claim',
      {
        headers: signedRequestHeaders(
          'GET',
          '/ovie/v1/summer-bottleneck/symphony/claim',
          ''
        ),
      }
    );
    expect(verifySymphonyConsumerRequest(request, '', runtime)).toBe(
      'symphony-outcome-r2'
    );
    expect(
      verifySymphonyConsumerRequest(request, '', {
        ...runtime,
        now: () => new Date(NOW.getTime() + 61_000),
      })
    ).toBeNull();
  });

  it('claims one authenticated outbox item and recovers it after restart', async () => {
    const { records, runtime, outbox } = harness();
    records.set(`summer-bottleneck/symphony-outbox/${KEY}.json`, outbox);
    await expect(
      claimNextSymphonyTask(runtime, 'symphony-outcome-r2')
    ).resolves.toEqual(outbox);
    await expect(
      claimNextSymphonyTask(runtime, 'symphony-outcome-r2')
    ).resolves.toEqual(outbox);
    expect(
      records.get(`summer-bottleneck/symphony-claims/${KEY}.json`)
    ).toMatchObject({ taskKey: KEY, claimantKeyId: 'symphony-outcome-r2' });
  });

  it('rejects an outbox whose signed task key disagrees with its storage key', async () => {
    const { records, runtime } = harness();
    const mismatched = signRecord(
      'jovie.eve.symphony-repair-outbox/v1',
      {
        schema: 'jovie.eve.symphony-repair-outbox/v1',
        destination: 'symphony',
        idempotencyKey: KEY,
        status: 'ready',
        task: { ...task, taskKey: 'd'.repeat(64) },
      },
      pem.evePrivate,
      'eve-outbox-r2'
    );
    records.set(`summer-bottleneck/symphony-outbox/${KEY}.json`, mismatched);
    await expect(
      claimNextSymphonyTask(runtime, 'symphony-outcome-r2')
    ).resolves.toBeNull();
  });

  it('does not recover a claim whose durable outbox no longer verifies', async () => {
    const { records, runtime, outbox } = harness();
    records.set(`summer-bottleneck/symphony-outbox/${KEY}.json`, outbox);
    await claimNextSymphonyTask(runtime, 'symphony-outcome-r2');
    records.set(`summer-bottleneck/symphony-outbox/${KEY}.json`, {
      ...outbox,
      status: 'tampered',
    });
    await expect(
      claimNextSymphonyTask(runtime, 'symphony-outcome-r2')
    ).resolves.toBeNull();
  });

  it('persists one exact-task-bound terminal and rejects conflicting replay', async () => {
    const { records, runtime, outbox } = harness();
    records.set(`summer-bottleneck/symphony-outbox/${KEY}.json`, outbox);
    await claimNextSymphonyTask(runtime, 'symphony-outcome-r2');
    const outcome = signedOutcome();
    await expect(
      persistSymphonyTerminal(runtime, 'symphony-outcome-r2', outcome)
    ).resolves.toBe('created');
    await expect(
      persistSymphonyTerminal(runtime, 'symphony-outcome-r2', outcome)
    ).resolves.toBe('exists');
    await expect(
      persistSymphonyTerminal(
        runtime,
        'symphony-outcome-r2',
        signedOutcome('different result')
      )
    ).rejects.toThrow('conflicting Symphony terminal');
  });

  it('rejects a signed terminal timestamp too far in the future', async () => {
    const { records, runtime, outbox } = harness();
    records.set(`summer-bottleneck/symphony-outbox/${KEY}.json`, outbox);
    await claimNextSymphonyTask(runtime, 'symphony-outcome-r2');
    const future = signSymphonyRepairOutcome(
      {
        schema: 'jovie.symphony-repair-outcome/v1',
        taskKey: KEY,
        status: 'succeeded',
        detail: 'future result',
        completedAt: new Date(NOW.getTime() + 61_000).toISOString(),
        source: {
          action: task.action,
          sourceVersion: task.source.sourceVersion,
          snapshotDigest: task.source.snapshotDigest,
        },
      },
      pem.symphonyPrivate,
      'symphony-outcome-r2'
    );
    await expect(
      persistSymphonyTerminal(runtime, 'symphony-outcome-r2', future)
    ).rejects.toThrow('cross-bound Symphony terminal');
  });

  it('authenticates claim and terminal handlers against the exact raw body', async () => {
    const { records, runtime, outbox } = harness();
    records.set(`summer-bottleneck/symphony-outbox/${KEY}.json`, outbox);
    const claimPath = '/ovie/v1/summer-bottleneck/symphony/claim';
    const claimResponse = await handleSymphonyClaimRequest(
      new Request(`https://eve.example.com${claimPath}`, {
        headers: signedRequestHeaders('GET', claimPath, ''),
      }),
      { createRuntime: () => runtime }
    );
    expect(claimResponse.status).toBe(200);

    const terminalPath = '/ovie/v1/summer-bottleneck/symphony/terminal';
    const body = JSON.stringify(signedOutcome(), null, 2);
    const terminalResponse = await handleSymphonyTerminalRequest(
      new Request(`https://eve.example.com${terminalPath}`, {
        method: 'POST',
        headers: signedRequestHeaders('POST', terminalPath, body),
        body,
      }),
      { createRuntime: () => runtime }
    );
    expect(terminalResponse.status).toBe(200);
    await expect(terminalResponse.json()).resolves.toMatchObject({
      ok: true,
      result: 'created',
    });
  });

  it('authenticates a malformed terminal body before parsing it', async () => {
    const { runtime } = harness();
    const pathname = '/ovie/v1/summer-bottleneck/symphony/terminal';
    const body = '{';
    const authenticated = await handleSymphonyTerminalRequest(
      new Request(`https://eve.example.com${pathname}`, {
        method: 'POST',
        headers: signedRequestHeaders('POST', pathname, body),
        body,
      }),
      { createRuntime: () => runtime }
    );
    expect(authenticated.status).toBe(400);
    await expect(authenticated.json()).resolves.toMatchObject({
      code: 'invalid_json',
    });

    const unauthenticated = await handleSymphonyTerminalRequest(
      new Request(`https://eve.example.com${pathname}`, {
        method: 'POST',
        body,
      }),
      { createRuntime: () => runtime }
    );
    expect(unauthenticated.status).toBe(401);
  });
});

function signedRequestHeaders(method: string, pathname: string, body: string) {
  const timestamp = NOW.toISOString();
  const payload = {
    bodySha256: nodeCreateHash('sha256').update(body).digest('hex'),
    method,
    pathname,
    timestamp,
  };
  const signature = nodeSign(
    null,
    Buffer.from(
      `jovie.symphony-consumer-request/v1\0${canonicalSummerBottleneckRecord(payload)}`
    ),
    pem.symphonyPrivate
  ).toString('base64url');
  return {
    'x-symphony-key-id': 'symphony-outcome-r2',
    'x-symphony-signature': `ed25519=${signature}`,
    'x-symphony-timestamp': timestamp,
  };
}
