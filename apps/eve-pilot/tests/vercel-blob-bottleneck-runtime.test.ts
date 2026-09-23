import { createHash, generateKeyPairSync, sign as nodeSign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type {
  SummerBottleneckRecord,
  SummerBottleneckStore,
  SymphonyRepairTask,
} from '../agent/lib/summer-bottleneck-loop';
import {
  createVercelBlobBottleneckDependencies,
  SUMMER_BOTTLENECK_SECURITY_ENV,
  type SummerBottleneckRuntimeSecurity,
  signSymphonyRepairOutcome,
  summerBottleneckSecurityFromEnvironment,
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
const securityEnvironment = {
  [SUMMER_BOTTLENECK_SECURITY_ENV.eveOutboxSigningPrivateKey]:
    EVE_OUTBOX_PRIVATE_KEY,
  [SUMMER_BOTTLENECK_SECURITY_ENV.eveOutboxSigningKeyId]:
    security.eveOutboxSigningKeyId,
  [SUMMER_BOTTLENECK_SECURITY_ENV.eveOutboxVerificationKeys]: JSON.stringify({
    [security.eveOutboxSigningKeyId]: EVE_OUTBOX_PUBLIC_KEY,
  }),
  [SUMMER_BOTTLENECK_SECURITY_ENV.producerVerificationKeys]: JSON.stringify({
    'jovie-production-2026-09': PRODUCER_PUBLIC_KEY,
  }),
  [SUMMER_BOTTLENECK_SECURITY_ENV.receiptSigningKey]: EVE_RECEIPT_KEY,
  [SUMMER_BOTTLENECK_SECURITY_ENV.receiptSigningKeyId]:
    security.receiptSigningKeyId,
  [SUMMER_BOTTLENECK_SECURITY_ENV.symphonyOutcomeVerificationKeys]:
    JSON.stringify({ 'symphony-outcome-2026-09': SYMPHONY_PUBLIC_KEY }),
};
const SOURCE_VERSION = 'b'.repeat(40);
const SNAPSHOT_DIGEST = 'c'.repeat(64);
const ASSIGNMENT = {
  mode: 'isolated-cli' as const,
  identifier: 'JOV-5800',
  issueId: '11111111-1111-4111-8111-111111111111',
  ownerId: '22222222-2222-4222-8222-222222222222',
  issueRevision: '2026-09-02T07:59:00.000Z',
  repository: 'JovieInc/Jovie' as const,
  pr: 17005,
  head: SOURCE_VERSION,
  workspace: '/Users/gem/worktrees/jovie-repair',
  writerUnit: 'symphony-gem.service',
  assignmentDigest: 'd'.repeat(64),
  expiresAt: '2026-09-02T09:00:00.000Z',
};
const task: SymphonyRepairTask = {
  schema: 'jovie-symphony-repair-task/v3',
  taskKey: KEY,
  decisionFingerprint: KEY,
  createdAt: '2026-09-02T08:00:00.000Z',
  owner: 'symphony',
  route: 'symphony',
  authority: 'host-assigned-isolated-repair-only',
  action: 'execute-existing-owned-repair',
  existingRepair: ASSIGNMENT,
  safety: 'exact-source-ci-native-queue-production-gates-remain-required',
  selected: {
    id: 'merge-group-flake-baseline-ratchet',
    sourceRevision: SOURCE_VERSION,
    sourceDigest: SNAPSHOT_DIGEST,
    owner: 'ci-reliability',
    handle: 'audit:merge-group-flakes',
  },
  source: {
    sourceVersion: SOURCE_VERSION,
    snapshotDigest: SNAPSHOT_DIGEST,
  },
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function v3Outcome(): SummerBottleneckRecord {
  const source = { ...task.source, action: task.action };
  const sourceEvaluationBody: SummerBottleneckRecord = {
    schema: 'symphony-existing-repair-source-evaluation/v1',
    taskKey: KEY,
    taskSelectionDigest: digest({
      taskKey: KEY,
      action: task.action,
      selected: task.selected,
      source: task.source,
    }),
    sourceVersion: task.source.sourceVersion,
    snapshotDigest: task.source.snapshotDigest,
    targetDigest: digest(ASSIGNMENT),
    identifier: ASSIGNMENT.identifier,
    issueId: ASSIGNMENT.issueId,
    repository: ASSIGNMENT.repository,
    pr: ASSIGNMENT.pr,
    baseHead: SOURCE_VERSION,
    finalHead: 'e'.repeat(40),
    targetObserved: true,
    observedIssueId: ASSIGNMENT.issueId,
    observedIssueRevision: ASSIGNMENT.issueRevision,
    observedPrNumber: ASSIGNMENT.pr,
    observedPrHead: 'e'.repeat(40),
    observedRepository: ASSIGNMENT.repository,
    prMergeStateStatus: 'CLEAN',
    mergeable: 'MERGEABLE',
    workerAttested: true,
    selectedEvidence: {
      id: task.selected.id,
      handle: task.selected.handle,
      check: task.selected.id,
      result: 'SUCCESS',
      source: 'github-status-check-rollup',
    },
    taskResolved: true,
    reason: 'task-check-passed',
  };
  const sourceEvaluation: SummerBottleneckRecord = {
    ...sourceEvaluationBody,
    digest: digest({
      schema: 'symphony-existing-repair-source-evaluation/v1',
      ...sourceEvaluationBody,
    }),
  };
  const executionBody: SummerBottleneckRecord = {
    runId: 'run-0001',
    provider: 'grok',
    model: 'grok-4',
    authPoolIdentity: '1'.repeat(64),
    leaseIdentity: '2'.repeat(64),
    assignmentDigest: ASSIGNMENT.assignmentDigest,
    providerGrantDigest: '3'.repeat(64),
    acceptanceDigest: '4'.repeat(64),
    runDigest: '5'.repeat(64),
    taskAcceptanceDigest: digest({
      schema: 'symphony-existing-repair-task-acceptance/v1',
      taskKey: KEY,
      assignmentDigest: ASSIGNMENT.assignmentDigest,
      existingRepair: ASSIGNMENT,
    }),
    baseHead: SOURCE_VERSION,
    finalHead: 'e'.repeat(40),
    outputDigest: '6'.repeat(64),
    sourceEvaluation,
    verification: {
      schema: 'symphony-existing-repair-evidence/v1',
      claimRecorded: true,
      acceptanceRecorded: true,
      runStarted: true,
      runTerminal: true,
      resultPersisted: true,
      leaseHeld: true,
      workspaceBound: true,
      headObserved: true,
      headChanged: true,
      taskAccepted: true,
    },
  };
  const execution: SummerBottleneckRecord = {
    ...executionBody,
    evidenceDigest: digest({
      schema: 'symphony-existing-repair-evidence/v1',
      ...executionBody,
    }),
  };
  return signSymphonyRepairOutcome(
    {
      schema: 'jovie.symphony-repair-outcome/v3',
      taskKey: KEY,
      decisionFingerprint: KEY,
      status: 'succeeded',
      detail: 'assigned CI repair completed with verified source evidence',
      completedAt: '2026-09-02T08:01:00.000Z',
      source,
      existingRepair: ASSIGNMENT,
      execution,
    },
    SYMPHONY_PRIVATE_KEY,
    'symphony-outcome-2026-09'
  );
}

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
    { ...v3Outcome(), ...overrides },
    SYMPHONY_PRIVATE_KEY,
    'symphony-outcome-2026-09'
  );
}

function signedOutcomeWithUnacceptedTask() {
  const outcome = v3Outcome();
  const execution = { ...(outcome.execution as Record<string, unknown>) };
  const verification = execution.verification as Record<string, unknown>;
  delete execution.evidenceDigest;
  execution.verification = { ...verification, taskAccepted: false };
  execution.evidenceDigest = digest({
    schema: 'symphony-existing-repair-evidence/v1',
    ...execution,
  });
  return signSymphonyRepairOutcome(
    { ...outcome, execution },
    SYMPHONY_PRIVATE_KEY,
    'symphony-outcome-2026-09'
  );
}

describe('Vercel Blob Summer bottleneck runtime', () => {
  it('loads only a complete, typed security bundle from the environment', () => {
    expect(summerBottleneckSecurityFromEnvironment({})).toBeUndefined();
    expect(
      summerBottleneckSecurityFromEnvironment(securityEnvironment)
    ).toMatchObject({
      eveOutboxSigningKeyId: 'eve-outbox-2026-09',
      receiptSigningKeyId: 'eve-receipt-2026-09',
    });
  });

  it('rejects malformed or incomplete verification-key bindings', () => {
    expect(
      summerBottleneckSecurityFromEnvironment({
        ...securityEnvironment,
        [SUMMER_BOTTLENECK_SECURITY_ENV.producerVerificationKeys]: '{',
      })
    ).toBeUndefined();
    expect(
      summerBottleneckSecurityFromEnvironment({
        ...securityEnvironment,
        [SUMMER_BOTTLENECK_SECURITY_ENV.producerVerificationKeys]: '{}',
      })
    ).toBeUndefined();
  });

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
      schema: 'jovie.eve.symphony-repair-outbox/v3',
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

  it('accepts only a signed v3 execution outcome bound to the exact assignment', async () => {
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
    ).resolves.toMatchObject({
      status: 'succeeded',
      detail: 'assigned CI repair completed with verified source evidence',
      terminalOutcome: {
        schema: 'jovie.symphony-repair-outcome/v3',
        decisionFingerprint: KEY,
        existingRepair: ASSIGNMENT,
        execution: { assignmentDigest: ASSIGNMENT.assignmentDigest },
      },
    });
  });

  it('rejects a correctly signed success without accepted task evidence', async () => {
    const proof = storeHarness();
    const runtime = createVercelBlobBottleneckDependencies(
      proof.store,
      security
    );
    await runtime.dispatchToSymphony(task, { idempotencyKey: KEY });
    proof.records.set(
      `summer-bottleneck/symphony-terminal/${KEY}.json`,
      signedOutcomeWithUnacceptedTask()
    );

    await expect(
      runtime.observeSymphonyOutcome({
        handle: `symphony:${KEY}`,
        idempotencyKey: KEY,
      })
    ).rejects.toThrow(
      'Symphony outcome execution evidence is invalid or cross-bound'
    );
  });

  it.each([
    ['unsigned', { schema: 'jovie.symphony-repair-outcome/v3' }],
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

  it('refuses new v1 dispatch and keeps authenticated historical v1 outboxes held', async () => {
    const proof = storeHarness();
    const runtime = createVercelBlobBottleneckDependencies(
      proof.store,
      security
    );
    const legacyTask = {
      schema: 'jovie-symphony-repair-task/v1',
      taskKey: KEY,
      createdAt: task.createdAt,
      owner: 'symphony',
      route: 'symphony',
      authority: 'source-repair-only-no-direct-pr-queue-or-deploy-mutation',
      action: 'remediate-selected-ci-audit-class',
      issue: 'JOV-5853',
      safety: 'exact-source-ci-native-queue-production-gates-remain-required',
      selected: task.selected,
      source: task.source,
    };
    await expect(
      runtime.dispatchToSymphony(legacyTask as unknown as SymphonyRepairTask, {
        idempotencyKey: KEY,
      })
    ).rejects.toThrow('historical v1 tasks remain held');

    const unsignedOutbox: SummerBottleneckRecord = {
      schema: 'jovie.eve.symphony-repair-outbox/v1',
      destination: 'symphony',
      idempotencyKey: KEY,
      status: 'ready',
      task: legacyTask,
      signatureKeyId: security.eveOutboxSigningKeyId,
    };
    const signature = nodeSign(
      null,
      Buffer.from(
        `jovie.eve.symphony-repair-outbox/v1\0${canonical(unsignedOutbox)}`
      ),
      EVE_OUTBOX_PRIVATE_KEY
    ).toString('base64url');
    proof.records.set(`summer-bottleneck/symphony-outbox/${KEY}.json`, {
      ...unsignedOutbox,
      signature: `ed25519=${signature}`,
    });
    proof.records.set(`summer-bottleneck/symphony-terminal/${KEY}.json`, {
      ...signedOutcome({ schema: 'jovie.symphony-repair-outcome/v1' }),
    });
    await expect(
      runtime.observeSymphonyOutcome({
        handle: `symphony:${KEY}`,
        idempotencyKey: KEY,
      })
    ).resolves.toEqual({
      status: 'pending',
      detail: 'historical-v1-outbox-held',
    });
  });
});
