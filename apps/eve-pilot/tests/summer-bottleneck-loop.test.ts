import { createHash, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  ingestSummerBottleneckSnapshot,
  rankSummerBottlenecks,
  reconcileMissedSummerBottleneckEvents,
  type SummerBottleneckDependencies,
  type SummerBottleneckRecord,
  type SummerBottleneckStore,
  type SummerCiImprovementClassId,
  signSummerBottleneckProducerAttestation,
  summerCiImprovementClassIds,
  verifySummerBottleneckReceipt,
} from '../agent/lib/summer-bottleneck-loop';

const NOW = new Date('2026-09-02T08:00:00.000Z');
const SOURCE = 'a'.repeat(40);
const KEY = 'synthetic-summer-receipt-signing-key';
const KEY_ID = 'eve-receipts-2026-09';
const producerKeys = generateKeyPairSync('ed25519');
const PRODUCER_PRIVATE_KEY = producerKeys.privateKey
  .export({
    format: 'pem',
    type: 'pkcs8',
  })
  .toString();
const PRODUCER_PUBLIC_KEY = producerKeys.publicKey
  .export({
    format: 'pem',
    type: 'spki',
  })
  .toString();
const PRODUCER_KEY_ID = 'jovie-production-2026-09';

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

function existingRepair(observedAt: string, sourceVersion = SOURCE) {
  const observedMs = Date.parse(observedAt);
  return {
    mode: 'isolated-cli' as const,
    identifier: 'JOV-5800',
    issueId: '11111111-1111-4111-8111-111111111111',
    ownerId: '22222222-2222-4222-8222-222222222222',
    issueRevision: new Date(observedMs - 60_000).toISOString(),
    repository: 'JovieInc/Jovie' as const,
    pr: 17005,
    head: sourceVersion,
    workspace: '/Users/gem/worktrees/jovie-repair',
    writerUnit: 'symphony-gem.service',
    assignmentDigest: 'a'.repeat(64),
    expiresAt: new Date(observedMs + 60 * 60_000).toISOString(),
  };
}

function taskAdmissions(
  selectedId: SummerCiImprovementClassId,
  observedAt: string,
  sourceVersion: string,
  assignment: ReturnType<typeof existingRepair>
) {
  const providerObservation = {
    providerGrantDigest: '1'.repeat(64),
    provider: 'grok',
    model: 'grok-4',
    accountUserId: 'account-1',
    authPoolIdentity: '2'.repeat(64),
    executableDigest: '3'.repeat(64),
    routerDigest: '4'.repeat(64),
    outputDigest: '5'.repeat(64),
    quotaObservedAt: observedAt,
    quotaSourceDigest: '6'.repeat(64),
    includedRemainingPercent: 75,
  };
  const expiresAt = assignment.expiresAt;
  return {
    schema: 'jovie.eve.summer-task-admissions/v1',
    assignmentDigest: assignment.assignmentDigest,
    selectedId,
    sourceRevision: sourceVersion,
    runtimeRevision: sourceVersion,
    runtimeGeneration: '7'.repeat(64),
    runtimeInvocationId: '8'.repeat(32),
    providerEligibility: {
      state: 'ALLOWED',
      observedAt,
      expiresAt,
      sourceDigest: digest(providerObservation),
      reason: 'provider-included-allowance-observed',
    },
    downstreamHealth: {
      state: 'ALLOWED',
      observedAt,
      expiresAt,
      sourceDigest: '9'.repeat(64),
      reason: 'observed-target-available',
    },
    providerObservation,
  };
}

function snapshot(
  overrides: {
    eventId?: string;
    observedAt?: string;
    sourceVersion?: string;
    closure?: Record<string, unknown>;
    queue?: Record<string, unknown>;
    release?: Record<string, unknown>;
    runner?: Record<string, unknown>;
    ciAudit?: Record<string, unknown> | null;
    existingRepair?: Record<string, unknown> | null;
    taskAdmissions?: Record<string, unknown> | null;
  } = {}
) {
  const source = overrides.sourceVersion ?? SOURCE;
  const observedAt = overrides.observedAt ?? NOW.toISOString();
  const assignment = existingRepair(observedAt, source);
  const admissions = taskAdmissions(
    'merge-group-flake-baseline-ratchet',
    observedAt,
    source,
    assignment
  );
  const body = {
    schema: 'jovie.eve.summer-bottleneck-snapshot/v1',
    eventId: overrides.eventId ?? 'evt_bottleneck_0001',
    observedAt,
    sourceVersion: source,
    signals: {
      closure: {
        schema: 'jovie.eve.summer-closure-projection/v1',
        sourceSchema: 'jovie-closure-health/v1',
        observedAt,
        sourceDigest: '1'.repeat(64),
        sourceRevision: source,
        status: 'healthy',
        blockedSince: null,
        openPullRequests: 12,
        ...overrides.closure,
      },
      queue: {
        schema: 'jovie.eve.summer-queue-projection/v1',
        sourceSchema: 'github-merge-queue-entry/v1',
        observedAt,
        sourceDigest: '2'.repeat(64),
        sourceRevision: source,
        blockedSince: null,
        eligibleCleanPrs: 0,
        queuedPrs: 0,
        ...overrides.queue,
      },
      release: {
        schema: 'jovie.eve.summer-release-projection/v1',
        sourceSchema: 'jovie-controller-snapshot/v1',
        observedAt,
        sourceDigest: '3'.repeat(64),
        sourceRevision: source,
        blockedSince: null,
        mainSha: source,
        productionSha: source,
        unverifiedMerges: 0,
        ...overrides.release,
      },
      runner: {
        schema: 'jovie.eve.summer-runner-projection/v1',
        sourceSchema: 'symphony-runner-projection/v1',
        observedAt,
        sourceDigest: '4'.repeat(64),
        sourceRevision: source,
        blockedSince: null,
        capacitySource: {
          schema: 'symphony-lease-guard-report/v1',
          observedAt,
          sourceDigest: '6'.repeat(64),
          sourceRevision: source,
        },
        workSource: {
          schema: 'symphony-runtime-state/v1',
          observedAt,
          sourceDigest: '7'.repeat(64),
          sourceRevision: source,
        },
        capacityAvailable: 2,
        queuedWork: 0,
        runtimeGeneration: '7'.repeat(64),
        runtimeInvocationId: '8'.repeat(32),
        ...overrides.runner,
      },
      ...(overrides.existingRepair === null
        ? {}
        : { existingRepair: overrides.existingRepair ?? assignment }),
      ...(overrides.taskAdmissions === null
        ? {}
        : { taskAdmissions: overrides.taskAdmissions ?? admissions }),
      admissions: {},
      ciAudit: {
        schema: 'jovie-ci-bottleneck-audit/v1',
        observedAt,
        sourceDigest: '5'.repeat(64),
        sourceRevision: source,
        classes: [
          {
            id: 'merge-group-flake-baseline-ratchet',
            state: 'open',
            blockedSince: '2026-09-02T07:59:00.000Z',
            impact: 6,
            owner: 'ci-reliability',
            handle: 'audit:merge-group-flakes',
          },
          {
            id: 'controller-cascade-coalescing',
            state: 'open',
            blockedSince: '2026-09-02T07:59:00.000Z',
            impact: 5,
            owner: 'production-controller',
            handle: 'audit:controller-cascade',
          },
          {
            id: 'auto-enroll-self-cancel-churn',
            state: 'partial',
            blockedSince: '2026-09-02T07:59:00.000Z',
            impact: 4,
            owner: 'gem',
            handle: 'PR#16976',
          },
          {
            id: 'controller-check-run-pagination-cap',
            state: 'open',
            blockedSince: '2026-09-02T07:59:00.000Z',
            impact: 3,
            owner: 'production-controller',
            handle: 'audit:check-run-pagination',
          },
          {
            id: 'obsolete-unaffected-native-lanes',
            state: 'open',
            blockedSince: '2026-09-02T07:59:00.000Z',
            impact: 2,
            owner: 'JOV-5800',
            handle: 'PR#17005',
          },
          {
            id: 'affected-only-unit-selection',
            state: 'open',
            blockedSince: '2026-09-02T07:59:00.000Z',
            impact: 1,
            owner: 'ci-risk-classifier',
            handle: 'audit:affected-only-units',
          },
        ],
        ...(overrides.ciAudit ?? {}),
      },
    },
  };
  const signedBody =
    overrides.ciAudit === null
      ? { ...body, signals: { ...body.signals, ciAudit: null } }
      : body;
  return {
    ...signedBody,
    producerAttestation: signSummerBottleneckProducerAttestation(
      signedBody,
      PRODUCER_PRIVATE_KEY,
      PRODUCER_KEY_ID
    ),
  };
}

function ciAuditBottleneckSnapshot(
  overrides: {
    readonly eventId?: string;
    readonly selectedId?: SummerCiImprovementClassId;
    readonly selectedState?: 'open' | 'partial';
    readonly sourceVersion?: string;
    readonly observedAt?: string;
    readonly existingRepair?: Record<string, unknown> | null;
    readonly taskAdmissions?: Record<string, unknown> | null;
    readonly runner?: Record<string, unknown>;
  } = {}
) {
  const {
    selectedId = 'merge-group-flake-baseline-ratchet',
    selectedState = 'open',
    ...snapshotOverrides
  } = overrides;
  const baseline = snapshot(snapshotOverrides);
  const observedAt = overrides.observedAt ?? NOW.toISOString();
  const sourceVersion = overrides.sourceVersion ?? SOURCE;
  const assignment = Object.hasOwn(overrides, 'existingRepair')
    ? overrides.existingRepair
    : existingRepair(observedAt, sourceVersion);
  const assignmentForAdmissions =
    assignment ?? existingRepair(observedAt, sourceVersion);
  const selectedTaskAdmissions = Object.hasOwn(overrides, 'taskAdmissions')
    ? overrides.taskAdmissions
    : taskAdmissions(
        selectedId,
        observedAt,
        sourceVersion,
        assignmentForAdmissions as ReturnType<typeof existingRepair>
      );
  return snapshot({
    ...snapshotOverrides,
    observedAt,
    existingRepair: assignment,
    taskAdmissions: selectedTaskAdmissions,
    runner: {
      ...overrides.runner,
      runtimeGeneration: '7'.repeat(64),
      runtimeInvocationId: '8'.repeat(32),
    },
    release: {
      blockedSince: null,
      productionSha: overrides.sourceVersion ?? SOURCE,
      unverifiedMerges: 0,
    },
    ciAudit: {
      classes: baseline.signals.ciAudit.classes.map(item => ({
        ...item,
        state: item.id === selectedId ? selectedState : 'implemented',
      })),
    },
  });
}

function memoryStore(records = new Map<string, SummerBottleneckRecord>()) {
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
      const matching = [...records.entries()]
        .filter(([pathname]) => pathname.startsWith(prefix))
        .sort(([left], [right]) => left.localeCompare(right));
      const start = Number(options.cursor ?? 0);
      const end = Math.min(start + options.limit, matching.length);
      return {
        ...(end < matching.length ? { cursor: String(end) } : {}),
        entries: matching
          .slice(start, end)
          .map(([pathname, record]) => ({ pathname, record })),
        hasMore: end < matching.length,
        scanned: end - start,
      };
    },
    async write(pathname, record) {
      records.set(pathname, record);
    },
  };
  return { records, store };
}

function harness(
  store = memoryStore(),
  overrides: Partial<SummerBottleneckDependencies> = {}
) {
  let dispatchedTask:
    | import('../agent/lib/summer-bottleneck-loop').SymphonyRepairTask
    | undefined;
  const dispatchToSymphony = vi.fn(
    async (
      task: import('../agent/lib/summer-bottleneck-loop').SymphonyRepairTask
    ) => {
      dispatchedTask = task;
      return { handle: 'symphony:task_0001' };
    }
  );
  const defaultObserve: SummerBottleneckDependencies['observeSymphonyOutcome'] =
    async () => ({
      status: 'succeeded',
      detail: 'assigned CI repair completed',
    });
  const observeImplementation =
    overrides.observeSymphonyOutcome ?? defaultObserve;
  const observeSymphonyOutcome = vi.fn(
    async (input: {
      readonly handle: string;
      readonly idempotencyKey: string;
    }) => {
      const observed = await observeImplementation(input);
      const persistedTask = [...store.records.values()]
        .map(record => record.task)
        .find(
          candidate =>
            candidate !== null &&
            typeof candidate === 'object' &&
            (candidate as { taskKey?: unknown }).taskKey ===
              input.idempotencyKey &&
            (candidate as { schema?: unknown }).schema ===
              'jovie-symphony-repair-task/v3'
        );
      const task =
        dispatchedTask?.taskKey === input.idempotencyKey
          ? dispatchedTask
          : (persistedTask as typeof dispatchedTask);
      if (
        observed.status === 'pending' ||
        observed.terminalOutcome ||
        !task ||
        task.schema !== 'jovie-symphony-repair-task/v3'
      ) {
        return observed;
      }
      const status = observed.status;
      const detail = observed.detail;
      return {
        ...observed,
        terminalOutcome: {
          schema: 'jovie.symphony-repair-outcome/v3',
          taskKey: input.idempotencyKey,
          decisionFingerprint: task.decisionFingerprint,
          status,
          detail,
          completedAt: '2026-09-02T08:01:00.000Z',
          source: { ...task.source, action: task.action },
          existingRepair: task.existingRepair,
          execution: {
            assignmentDigest: task.existingRepair.assignmentDigest,
            baseHead: task.existingRepair.head,
            finalHead:
              status === 'succeeded'
                ? 'b'.repeat(40)
                : task.existingRepair.head,
            verification: {
              headChanged: status === 'succeeded',
              taskAccepted: status === 'succeeded',
            },
          },
          signatureKeyId: 'symphony-outcome-2026-09',
          signature: `ed25519=${'a'.repeat(86)}`,
        },
      };
    }
  );
  const dependencies: SummerBottleneckDependencies = {
    dispatchToSymphony,
    now: () => NOW,
    producerVerificationKeys: new Map([[PRODUCER_KEY_ID, PRODUCER_PUBLIC_KEY]]),
    receiptSigningKey: KEY,
    receiptSigningKeyId: KEY_ID,
    store: store.store,
    ...overrides,
    observeSymphonyOutcome,
  };
  return { ...store, dependencies, dispatchToSymphony, observeSymphonyOutcome };
}

describe('Summer bottleneck loop', () => {
  it('deterministically ranks one bottleneck by blocked time, impact, then id', () => {
    const input = snapshot({
      closure: {
        status: 'red',
        blockedSince: '2026-09-02T07:30:00.000Z',
        openPullRequests: 100,
      },
      queue: {
        blockedSince: '2026-09-02T06:00:00.000Z',
        eligibleCleanPrs: 1,
        queuedPrs: 0,
      },
      runner: {
        blockedSince: '2026-09-02T07:30:00.000Z',
        capacityAvailable: 0,
        queuedWork: 1,
      },
      release: {
        blockedSince: '2026-09-02T07:00:00.000Z',
        mainSha: 'b'.repeat(40),
        productionSha: SOURCE,
        unverifiedMerges: 1,
      },
    });

    const ranking = rankSummerBottlenecks(input, NOW);
    expect(ranking.map(item => item.id)).toEqual([
      'native-queue-starvation',
      'release-certification-starvation',
      'closure-health-red',
      'runner-capacity-starvation',
      'merge-group-flake-baseline-ratchet',
      'controller-cascade-coalescing',
      'auto-enroll-self-cancel-churn',
      'controller-check-run-pagination-cap',
      'obsolete-unaffected-native-lanes',
      'affected-only-unit-selection',
    ]);
    expect(
      ranking
        .filter(item => summerCiImprovementClassIds.some(id => id === item.id))
        .every(item => item.inEnvelope)
    ).toBe(true);
    expect(
      ranking.find(item => item.id === 'native-queue-starvation')
    ).toMatchObject({
      inEnvelope: true,
      owner: 'Summer',
      handle: 'symphony',
    });
    expect(
      ranking.find(item => item.id === 'closure-health-red')
    ).toMatchObject({
      inEnvelope: true,
      owner: 'Summer',
      handle: 'symphony',
    });
    expect(
      ranking.find(item => item.id === 'runner-capacity-starvation')
    ).toMatchObject({
      inEnvelope: true,
      owner: 'Summer',
      handle: 'symphony',
    });
    expect(
      ranking
        .filter(item => !summerCiImprovementClassIds.some(id => id === item.id))
        .filter(item => item.id !== 'native-queue-starvation')
        .filter(item => item.id !== 'release-certification-starvation')
        .filter(item => item.id !== 'closure-health-red')
        .filter(item => item.id !== 'runner-capacity-starvation')
        .every(item => !item.inEnvelope)
    ).toBe(true);
  });

  it.each([
    { capacityAvailable: 0, queuedWork: null },
    { capacityAvailable: null, queuedWork: 1 },
  ])(
    'does not infer runner starvation from an unknown runner signal: %o',
    runner => {
      const ranking = rankSummerBottlenecks(
        snapshot({
          runner: {
            ...runner,
            blockedSince: '2026-09-02T04:00:00.000Z',
          },
        }),
        NOW
      );

      expect(ranking.map(item => item.id)).not.toContain(
        'runner-capacity-starvation'
      );
    }
  );

  it('suppresses CI and runner repair when their source authorities are unknown', () => {
    const ranking = rankSummerBottlenecks(
      snapshot({
        ciAudit: null,
        runner: {
          sourceRevision: null,
          queuedWork: null,
          blockedSince: '2026-09-02T04:00:00.000Z',
          workSource: {
            schema: 'symphony-runtime-state/v1',
            observedAt: NOW.toISOString(),
            sourceDigest: '7'.repeat(64),
            sourceRevision: null,
          },
        },
      }),
      NOW
    );

    expect(ranking.map(item => item.id)).not.toContain(
      'runner-capacity-starvation'
    );
    expect(
      ranking.filter(item =>
        summerCiImprovementClassIds.some(id => id === item.id)
      )
    ).toEqual([]);
  });

  it.each(summerCiImprovementClassIds)(
    'admits only the host-assigned v3 task for CI class %s',
    async selectedId => {
      const proof = harness();
      const expected = snapshot().signals.ciAudit.classes.find(
        item => item.id === selectedId
      );
      if (!expected) throw new Error(`missing CI audit fixture ${selectedId}`);
      await expect(
        ingestSummerBottleneckSnapshot(
          ciAuditBottleneckSnapshot({
            selectedId,
            selectedState:
              selectedId === 'auto-enroll-self-cancel-churn'
                ? 'partial'
                : 'open',
          }),
          proof.dependencies
        )
      ).resolves.toMatchObject({
        decision: 'symphony-succeeded',
        selected: { id: selectedId, inEnvelope: true },
      });
      expect(proof.dispatchToSymphony).toHaveBeenCalledWith(
        expect.objectContaining({
          schema: 'jovie-symphony-repair-task/v3',
          action: 'execute-existing-owned-repair',
          authority: 'host-assigned-isolated-repair-only',
          decisionFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u),
          existingRepair: expect.objectContaining({
            assignmentDigest: 'a'.repeat(64),
          }),
          selected: {
            id: selectedId,
            sourceRevision: SOURCE,
            sourceDigest: '5'.repeat(64),
            owner: expected.owner,
            handle: expected.handle,
          },
        }),
        { idempotencyKey: expect.stringMatching(/^[a-f0-9]{64}$/u) }
      );
    }
  );

  it('requires a fresh assignment and exact provider, target, selection, source, and runtime admission join', async () => {
    const assignment = existingRepair(NOW.toISOString());
    const staleAt = new Date(NOW.getTime() - 11 * 60_000).toISOString();
    const admitted = (
      target = assignment,
      selectedId: SummerCiImprovementClassId = 'merge-group-flake-baseline-ratchet',
      observedAt = NOW.toISOString()
    ) => taskAdmissions(selectedId, observedAt, SOURCE, target);
    const expiredAssignment = {
      ...assignment,
      expiresAt: new Date(NOW.getTime() - 60_000).toISOString(),
    };
    const unknownProvider = {
      ...admitted(),
      providerEligibility: {
        state: 'UNKNOWN',
        observedAt: null,
        expiresAt: null,
        sourceDigest: null,
        reason: 'provider-included-allowance-unavailable',
      },
      providerObservation: null,
    };
    const cases = [
      {
        reason: 'existing-repair-assignment-missing',
        overrides: { existingRepair: null },
      },
      {
        reason: 'selection-bound-task-admissions-missing',
        overrides: { taskAdmissions: null },
      },
      {
        reason: 'task-admission-assignment-or-selection-mismatch',
        overrides: {
          taskAdmissions: admitted(assignment, 'controller-cascade-coalescing'),
        },
      },
      {
        reason: 'existing-repair-assignment-expired-or-stale',
        overrides: {
          existingRepair: expiredAssignment,
          taskAdmissions: admitted(expiredAssignment),
        },
      },
      {
        reason: 'task-admission-provider-eligibility-unavailable-or-stale',
        overrides: { taskAdmissions: unknownProvider },
      },
      {
        reason: 'task-admission-provider-eligibility-unavailable-or-stale',
        overrides: {
          taskAdmissions: admitted(assignment, undefined, staleAt),
        },
      },
      {
        reason: 'task-admission-runtime-mismatch',
        overrides: {
          taskAdmissions: {
            ...admitted(),
            runtimeInvocationId: 'f'.repeat(32),
          },
        },
      },
    ] as const;

    for (const [index, testCase] of cases.entries()) {
      const proof = harness();
      const receipt = await ingestSummerBottleneckSnapshot(
        ciAuditBottleneckSnapshot({
          eventId: `evt_hold_case_${index + 1}`,
          ...testCase.overrides,
        }),
        proof.dependencies
      );
      expect(receipt).toMatchObject({
        decision: 'held-host-assignment',
        executionHold: {
          kind: 'host-assignment',
          reason: testCase.reason,
        },
        terminal: true,
      });
      expect(proof.dispatchToSymphony).not.toHaveBeenCalled();
      expect(proof.observeSymphonyOutcome).not.toHaveBeenCalled();
    }
  });

  it('holds a release bottleneck outside the selection-bound CI task policy', async () => {
    const proof = harness();
    const receipt = await ingestSummerBottleneckSnapshot(
      snapshot({
        ciAudit: null,
        release: {
          blockedSince: '2026-09-02T07:00:00.000Z',
          productionSha: 'b'.repeat(40),
          unverifiedMerges: 3,
        },
      }),
      proof.dependencies
    );

    expect(receipt).toMatchObject({
      schema: 'jovie.eve.summer-bottleneck-outcome/v1',
      decision: 'held-host-assignment',
      owner: 'Summer',
      handle: 'symphony',
      selected: { id: 'release-certification-starvation' },
      executionHold: {
        kind: 'host-assignment',
        reason: 'selection-outside-task-admission-allowlist',
      },
      terminal: true,
    });
    expect(verifySummerBottleneckReceipt(receipt, KEY)).toBe(true);
    expect(proof.dispatchToSymphony).not.toHaveBeenCalled();
  });

  it('dispatches the selected CI audit class with its exact source and owner binding', async () => {
    const proof = harness();
    const first = await ingestSummerBottleneckSnapshot(
      ciAuditBottleneckSnapshot(),
      proof.dependencies
    );
    const unchanged = await ingestSummerBottleneckSnapshot(
      ciAuditBottleneckSnapshot({ eventId: 'evt_ci_audit_0002' }),
      proof.dependencies
    );
    const duplicate = await ingestSummerBottleneckSnapshot(
      ciAuditBottleneckSnapshot(),
      proof.dependencies
    );

    expect(first).toMatchObject({
      decision: 'symphony-succeeded',
      selected: {
        id: 'merge-group-flake-baseline-ratchet',
        inEnvelope: true,
        owner: 'ci-reliability',
        handle: 'audit:merge-group-flakes',
        sourceRevision: SOURCE,
        sourceDigest: '5'.repeat(64),
      },
      terminal: true,
      symphony: {
        terminalOutcome: {
          schema: 'jovie.symphony-repair-outcome/v3',
          decisionFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u),
          existingRepair: expect.objectContaining({
            assignmentDigest: 'a'.repeat(64),
          }),
        },
      },
    });
    expect(unchanged).toMatchObject({
      decision: 'unchanged-noop',
      terminal: true,
    });
    expect(duplicate).toMatchObject({
      decision: 'duplicate-replay-rejected',
      terminal: true,
    });
    expect(proof.dispatchToSymphony).toHaveBeenCalledTimes(1);
    expect(proof.observeSymphonyOutcome).toHaveBeenCalledTimes(1);
    expect(proof.dispatchToSymphony).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: 'jovie-symphony-repair-task/v3',
        action: 'execute-existing-owned-repair',
        authority: 'host-assigned-isolated-repair-only',
        decisionFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u),
        existingRepair: expect.objectContaining({
          assignmentDigest: 'a'.repeat(64),
        }),
        selected: {
          id: 'merge-group-flake-baseline-ratchet',
          sourceRevision: SOURCE,
          sourceDigest: '5'.repeat(64),
          owner: 'ci-reliability',
          handle: 'audit:merge-group-flakes',
        },
        source: {
          sourceVersion: SOURCE,
          snapshotDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
        },
      }),
      { idempotencyKey: expect.stringMatching(/^[a-f0-9]{64}$/u) }
    );
  });

  it('recovers a pending CI audit dispatch after restart without redispatching', async () => {
    const shared = memoryStore();
    const first = harness(shared, {
      observeSymphonyOutcome: vi.fn(async () => ({
        status: 'pending' as const,
        detail: 'running',
      })),
    });
    await expect(
      ingestSummerBottleneckSnapshot(
        ciAuditBottleneckSnapshot(),
        first.dependencies
      )
    ).resolves.toMatchObject({
      decision: 'pending-symphony',
      selected: { id: 'merge-group-flake-baseline-ratchet' },
    });

    const restarted = harness(shared);
    await expect(
      reconcileMissedSummerBottleneckEvents(restarted.dependencies)
    ).resolves.toEqual([
      expect.objectContaining({
        decision: 'symphony-succeeded',
        selected: expect.objectContaining({
          id: 'merge-group-flake-baseline-ratchet',
        }),
      }),
    ]);
    expect(restarted.dispatchToSymphony).not.toHaveBeenCalled();
    expect(restarted.observeSymphonyOutcome).toHaveBeenCalledTimes(1);
  });

  it('dispatches once when only freshness metadata changes on a later cadence', async () => {
    const shared = memoryStore();
    const first = harness(shared);
    const original = snapshot();
    await ingestSummerBottleneckSnapshot(original, first.dependencies);
    const later = new Date(NOW.getTime() + 60_000);
    const second = harness(shared, { now: () => later });
    const replay = await ingestSummerBottleneckSnapshot(
      snapshot({
        observedAt: later.toISOString(),
        existingRepair: original.signals.existingRepair,
        taskAdmissions: original.signals.taskAdmissions,
      }),
      second.dependencies
    );
    const unchanged = await ingestSummerBottleneckSnapshot(
      snapshot({
        eventId: 'evt_bottleneck_0002',
        observedAt: later.toISOString(),
        existingRepair: original.signals.existingRepair,
        taskAdmissions: original.signals.taskAdmissions,
      }),
      second.dependencies
    );

    expect(replay).toMatchObject({
      decision: 'duplicate-replay-rejected',
      terminal: true,
    });
    expect(unchanged).toMatchObject({
      decision: 'unchanged-noop',
      terminal: true,
    });
    expect(first.dispatchToSymphony).toHaveBeenCalledTimes(1);
    expect(second.dispatchToSymphony).not.toHaveBeenCalled();
    expect(first.observeSymphonyOutcome).toHaveBeenCalledTimes(1);
    expect(second.observeSymphonyOutcome).not.toHaveBeenCalled();
  });

  it('holds closure-health repair even when it ranks first outside the CI admission policy', async () => {
    const proof = harness();
    const receipt = await ingestSummerBottleneckSnapshot(
      snapshot({
        closure: {
          status: 'red',
          blockedSince: '2026-09-02T03:00:00.000Z',
          openPullRequests: 100,
        },
        queue: {
          blockedSince: '2026-09-02T05:00:00.000Z',
          eligibleCleanPrs: 8,
          queuedPrs: 0,
        },
      }),
      proof.dependencies
    );

    expect(receipt).toMatchObject({
      decision: 'held-host-assignment',
      selected: { id: 'closure-health-red', inEnvelope: true },
      terminal: true,
    });
    expect(receipt).toMatchObject({
      executionHold: {
        kind: 'host-assignment',
        reason: 'selection-outside-task-admission-allowlist',
      },
    });
    expect(proof.dispatchToSymphony).not.toHaveBeenCalled();
  });

  it('keeps the selection-bound CI repair when the queue is healthy', async () => {
    const proof = harness();
    const receipt = await ingestSummerBottleneckSnapshot(
      snapshot({
        queue: {
          blockedSince: null,
          eligibleCleanPrs: 0,
          queuedPrs: 0,
        },
      }),
      proof.dependencies
    );

    expect(receipt).toMatchObject({
      decision: 'symphony-succeeded',
      selected: { id: 'merge-group-flake-baseline-ratchet', inEnvelope: true },
      terminal: true,
    });
    expect(proof.dispatchToSymphony.mock.calls[0][0]).toMatchObject({
      schema: 'jovie-symphony-repair-task/v3',
      action: 'execute-existing-owned-repair',
      selected: { id: 'merge-group-flake-baseline-ratchet' },
    });
  });

  it('holds a closure-health-only bottleneck without matching CI task evidence', async () => {
    const proof = harness();
    const receipt = await ingestSummerBottleneckSnapshot(
      snapshot({
        closure: {
          status: 'red',
          blockedSince: '2026-09-02T05:00:00.000Z',
          openPullRequests: 8,
        },
        queue: {
          blockedSince: null,
          eligibleCleanPrs: 0,
          queuedPrs: 0,
        },
        release: {
          blockedSince: null,
          unverifiedMerges: 0,
          productionSha: SOURCE,
        },
        ciAudit: null,
      }),
      proof.dependencies
    );

    expect(receipt).toMatchObject({
      decision: 'held-host-assignment',
      selected: { id: 'closure-health-red', inEnvelope: true },
      handle: 'symphony',
      terminal: true,
    });
    expect(receipt).toMatchObject({
      executionHold: {
        reason: 'selection-outside-task-admission-allowlist',
      },
    });
    expect(proof.dispatchToSymphony).not.toHaveBeenCalled();
  });

  it('rejects a duplicate event before a second dispatch or observation', async () => {
    const proof = harness();
    await ingestSummerBottleneckSnapshot(snapshot(), proof.dependencies);
    const duplicate = await ingestSummerBottleneckSnapshot(
      snapshot(),
      proof.dependencies
    );

    expect(duplicate).toMatchObject({
      decision: 'duplicate-replay-rejected',
      terminal: true,
    });
    expect(proof.dispatchToSymphony).toHaveBeenCalledTimes(1);
    expect(proof.observeSymphonyOutcome).toHaveBeenCalledTimes(1);
  });

  it('rejects a conflicting record at the deterministic event key', async () => {
    const shared = memoryStore();
    const proof = harness(shared);
    await ingestSummerBottleneckSnapshot(snapshot(), proof.dependencies);
    const eventPath = [...shared.records.keys()].find(path =>
      path.includes('/events/')
    );
    expect(eventPath).toBeDefined();
    shared.records.set(eventPath!, { schema: 'forged-event' });

    await expect(
      ingestSummerBottleneckSnapshot(snapshot(), proof.dependencies)
    ).rejects.toThrow('bottleneck event conflict');
  });

  it('survives restart and observes a pending dispatch without dispatching twice', async () => {
    const shared = memoryStore();
    const first = harness(shared, {
      observeSymphonyOutcome: vi.fn(async () => ({
        status: 'pending' as const,
        detail: 'running',
      })),
    });
    const pending = await ingestSummerBottleneckSnapshot(
      snapshot(),
      first.dependencies
    );
    expect(pending).toMatchObject({ decision: 'pending-symphony' });

    const restarted = harness(shared);
    const reconciled = await reconcileMissedSummerBottleneckEvents(
      restarted.dependencies
    );

    expect(reconciled).toHaveLength(1);
    expect(reconciled[0]).toMatchObject({ decision: 'symphony-succeeded' });
    expect(restarted.dispatchToSymphony).not.toHaveBeenCalled();
    expect(restarted.observeSymphonyOutcome).toHaveBeenCalledTimes(1);
  });

  it('keeps an observation transport failure nonterminal for heartbeat recovery', async () => {
    const proof = harness(memoryStore(), {
      observeSymphonyOutcome: vi.fn(async () => {
        throw new Error('outcome source unavailable');
      }),
    });
    const receipt = await ingestSummerBottleneckSnapshot(
      snapshot(),
      proof.dependencies
    );

    expect(receipt).toMatchObject({
      decision: 'pending-observation',
      terminal: false,
    });
    expect(verifySummerBottleneckReceipt(receipt, KEY)).toBe(true);
  });

  it('records a terminal failed Symphony outcome without widening authority', async () => {
    const proof = harness(memoryStore(), {
      observeSymphonyOutcome: vi.fn(async () => ({
        status: 'failed' as const,
        detail: 'exact-head gate remained red',
      })),
    });
    const receipt = await ingestSummerBottleneckSnapshot(
      snapshot(),
      proof.dependencies
    );

    expect(receipt).toMatchObject({
      decision: 'symphony-failed',
      terminal: true,
      symphony: { detail: 'exact-head gate remained red' },
    });
  });

  it('rejects an invalid Symphony handle before persisting dispatch', async () => {
    const proof = harness(memoryStore(), {
      dispatchToSymphony: vi.fn(async () => ({ handle: 'bad' })),
    });
    await expect(
      ingestSummerBottleneckSnapshot(snapshot(), proof.dependencies)
    ).rejects.toThrow('Symphony returned an invalid handle');
  });

  it('rejects a corrupted durable claim during restart recovery', async () => {
    const shared = memoryStore();
    const failed = harness(shared, {
      dispatchToSymphony: vi.fn(async () => {
        throw new Error('dispatch unavailable');
      }),
    });
    await expect(
      ingestSummerBottleneckSnapshot(snapshot(), failed.dependencies)
    ).rejects.toThrow('dispatch unavailable');
    const claimPath = [...shared.records.keys()].find(path =>
      path.includes('/claims/')
    );
    expect(claimPath).toBeDefined();
    shared.records.set(claimPath!, { fingerprint: 'corrupted' });

    await expect(
      reconcileMissedSummerBottleneckEvents(harness(shared).dependencies)
    ).resolves.toEqual([
      expect.objectContaining({
        decision: 'recovery-processing-failed',
        terminal: false,
      }),
    ]);
  });

  it('accepts an atomic dispatch-receipt race only when the stored receipt is valid', async () => {
    const shared = memoryStore();
    const baseCreate = shared.store.create.bind(shared.store);
    shared.store.create = async (pathname, record) => {
      if (pathname.includes('/dispatch/')) {
        shared.records.set(pathname, record);
        return 'exists';
      }
      return baseCreate(pathname, record);
    };
    const proof = harness(shared);

    const receipt = await ingestSummerBottleneckSnapshot(
      snapshot(),
      proof.dependencies
    );
    expect(receipt).toMatchObject({ decision: 'symphony-succeeded' });
    expect(proof.dispatchToSymphony).toHaveBeenCalledTimes(1);
  });

  it('rejects a forged durable dispatch receipt during restart recovery', async () => {
    const shared = memoryStore();
    const pending = harness(shared, {
      observeSymphonyOutcome: vi.fn(async () => ({
        status: 'pending' as const,
        detail: 'running',
      })),
    });
    await ingestSummerBottleneckSnapshot(snapshot(), pending.dependencies);
    const dispatchPath = [...shared.records.keys()].find(path =>
      path.includes('/dispatch/')
    );
    expect(dispatchPath).toBeDefined();
    shared.records.set(dispatchPath!, {
      fingerprint: 'forged',
      symphony: { handle: 'symphony:forged_0001' },
    });

    await expect(
      reconcileMissedSummerBottleneckEvents(harness(shared).dependencies)
    ).resolves.toEqual([
      expect.objectContaining({
        decision: 'recovery-processing-failed',
        terminal: false,
      }),
    ]);
  });

  it('rejects a signed claim copied into the outcome path', async () => {
    const shared = memoryStore();
    const pending = harness(shared, {
      dispatchToSymphony: vi.fn(async () => {
        throw new Error('leave pending');
      }),
    });
    await expect(
      ingestSummerBottleneckSnapshot(snapshot(), pending.dependencies)
    ).rejects.toThrow();
    const claim = [...shared.records.values()].find(
      record => record.schema === 'jovie.eve.summer-bottleneck-claim/v1'
    );
    expect(claim).toBeDefined();
    shared.records.set(
      `summer-bottleneck/outcomes/${String(claim?.fingerprint)}.json`,
      claim!
    );

    await expect(
      reconcileMissedSummerBottleneckEvents(harness(shared).dependencies)
    ).resolves.toEqual([
      expect.objectContaining({ decision: 'recovery-processing-failed' }),
    ]);
  });

  it('reconciles one missed event after a transient dispatch failure', async () => {
    const shared = memoryStore();
    const failed = harness(shared, {
      dispatchToSymphony: vi.fn(async () => {
        throw new Error('dispatch transport unavailable');
      }),
    });
    await expect(
      ingestSummerBottleneckSnapshot(snapshot(), failed.dependencies)
    ).rejects.toThrow('dispatch transport unavailable');

    const heartbeat = harness(shared);
    const first = await reconcileMissedSummerBottleneckEvents(
      heartbeat.dependencies
    );
    const second = await reconcileMissedSummerBottleneckEvents(
      heartbeat.dependencies
    );

    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ decision: 'symphony-succeeded' });
    expect(second).toEqual([]);
    expect(heartbeat.dispatchToSymphony).toHaveBeenCalledTimes(1);
  });

  it('reconciles a freshness-admitted event after a delayed heartbeat', async () => {
    const shared = memoryStore();
    const failedDispatch = vi.fn(async () => {
      throw new Error('dispatch transport unavailable');
    });
    const failed = harness(shared, {
      dispatchToSymphony: failedDispatch,
    });
    await expect(
      ingestSummerBottleneckSnapshot(snapshot(), failed.dependencies)
    ).rejects.toThrow('dispatch transport unavailable');

    const delayed = harness(shared, {
      now: () => new Date(NOW.getTime() + 16 * 60 * 1000),
    });
    await expect(
      reconcileMissedSummerBottleneckEvents(delayed.dependencies)
    ).resolves.toEqual([
      expect.objectContaining({
        decision: 'held-host-assignment',
        executionHold: {
          kind: 'host-assignment',
          reason: 'task-admission-provider-eligibility-unavailable-or-stale',
        },
        terminal: true,
      }),
    ]);
    expect(failedDispatch).toHaveBeenCalledTimes(1);
    expect(delayed.dispatchToSymphony).not.toHaveBeenCalled();
  });

  it('does not strand a pending event behind more than 25 terminal events', async () => {
    const shared = memoryStore();
    const proof = harness(shared);
    for (let index = 0; index < 26; index += 1) {
      const baseline = snapshot({
        eventId: `evt_terminal_${String(index).padStart(4, '0')}`,
      });
      await ingestSummerBottleneckSnapshot(
        snapshot({
          eventId: baseline.eventId,
          release: {
            blockedSince: null,
            productionSha: SOURCE,
            unverifiedMerges: 0,
          },
          ciAudit: {
            classes: baseline.signals.ciAudit.classes.map(item => ({
              ...item,
              state: 'implemented',
            })),
          },
        }),
        proof.dependencies
      );
    }
    const terminalPaths = [...shared.records.keys()].filter(path =>
      path.includes('/terminal/')
    );
    expect(terminalPaths).toHaveLength(26);
    shared.records.delete(terminalPaths[25]!);

    await expect(
      reconcileMissedSummerBottleneckEvents(proof.dependencies)
    ).resolves.toEqual([
      expect.objectContaining({ decision: 'healthy-noop', terminal: true }),
    ]);
  });

  it('continues recovery after an earlier durable event is corrupted', async () => {
    const shared = memoryStore();
    const first = harness(shared, {
      dispatchToSymphony: vi.fn(async () => {
        throw new Error('leave first pending');
      }),
    });
    await expect(
      ingestSummerBottleneckSnapshot(
        snapshot({ eventId: 'evt_poison_0001' }),
        first.dependencies
      )
    ).rejects.toThrow();
    const firstClaim = [...shared.records.keys()].find(path =>
      path.includes('/claims/')
    );
    expect(firstClaim).toBeDefined();
    shared.records.set(firstClaim!, { fingerprint: 'corrupted' });

    const second = harness(shared, {
      dispatchToSymphony: vi.fn(async () => {
        throw new Error('leave second pending');
      }),
    });
    await expect(
      ingestSummerBottleneckSnapshot(
        snapshot({
          eventId: 'evt_poison_0002',
          sourceVersion: 'c'.repeat(40),
        }),
        second.dependencies
      )
    ).rejects.toThrow();

    const recovered = await reconcileMissedSummerBottleneckEvents(
      harness(shared).dependencies
    );
    expect(recovered).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ decision: 'recovery-processing-failed' }),
        expect.objectContaining({ decision: 'symphony-succeeded' }),
      ])
    );
  });

  it('advances the durable cursor past 25 poison events', async () => {
    const shared = memoryStore();
    for (let index = 0; index < 26; index += 1) {
      const failed = harness(shared, {
        dispatchToSymphony: vi.fn(async () => {
          throw new Error('leave pending');
        }),
      });
      await expect(
        ingestSummerBottleneckSnapshot(
          snapshot({
            eventId: `evt_cursor_${String(index).padStart(4, '0')}`,
            sourceVersion: index.toString(16).padStart(40, '0'),
          }),
          failed.dependencies
        )
      ).rejects.toThrow();
    }
    const sortedEvents = [...shared.records.entries()]
      .filter(([path]) => path.includes('/events/'))
      .sort(([left], [right]) => left.localeCompare(right));
    const lastEventId = (
      sortedEvents[25]?.[1].snapshot as { eventId?: unknown } | undefined
    )?.eventId;
    expect(lastEventId).toBeTypeOf('string');
    for (const [path, record] of shared.records) {
      if (path.includes('/claims/') && record.eventId !== lastEventId) {
        shared.records.set(path, { fingerprint: 'corrupted' });
      }
    }

    const heartbeat = harness(shared);
    const first = await reconcileMissedSummerBottleneckEvents(
      heartbeat.dependencies
    );
    expect(first).toHaveLength(25);
    expect(
      first.every(item => item.decision === 'recovery-processing-failed')
    ).toBe(true);
    const second = await reconcileMissedSummerBottleneckEvents(
      heartbeat.dependencies
    );
    expect(second).toEqual([
      expect.objectContaining({ decision: 'symphony-succeeded' }),
    ]);
  });

  it('isolates a terminal read failure and still recovers the next event', async () => {
    const shared = memoryStore();
    for (const [eventId, sourceVersion] of [
      ['evt_terminal_read_0001', 'd'.repeat(40)],
      ['evt_terminal_read_0002', 'e'.repeat(40)],
    ] as const) {
      const failed = harness(shared, {
        dispatchToSymphony: vi.fn(async () => {
          throw new Error('leave pending');
        }),
      });
      await expect(
        ingestSummerBottleneckSnapshot(
          snapshot({ eventId, sourceVersion }),
          failed.dependencies
        )
      ).rejects.toThrow();
    }
    const read = shared.store.read.bind(shared.store);
    let failedTerminalRead = false;
    shared.store.read = async pathname => {
      if (!failedTerminalRead && pathname.includes('/terminal/')) {
        failedTerminalRead = true;
        throw new Error('terminal unreadable');
      }
      return read(pathname);
    };

    const recovered = await reconcileMissedSummerBottleneckEvents(
      harness(shared).dependencies
    );
    expect(recovered).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ decision: 'recovery-terminal-read-failed' }),
        expect.objectContaining({ decision: 'symphony-succeeded' }),
      ])
    );
  });

  it('resets a repeated cursor and recovers on the next heartbeat', async () => {
    const shared = memoryStore();
    const failed = harness(shared, {
      dispatchToSymphony: vi.fn(async () => {
        throw new Error('leave pending');
      }),
    });
    await expect(
      ingestSummerBottleneckSnapshot(snapshot(), failed.dependencies)
    ).rejects.toThrow();
    const list = shared.store.list.bind(shared.store);
    let calls = 0;
    shared.store.list = async (prefix, options) => {
      calls += 1;
      if (calls <= 2) {
        return { cursor: 'repeated', entries: [], hasMore: true, scanned: 1 };
      }
      return list(prefix, options);
    };

    await expect(
      reconcileMissedSummerBottleneckEvents(harness(shared).dependencies)
    ).resolves.toEqual([
      expect.objectContaining({ decision: 'recovery-cursor-conflict' }),
    ]);
    await expect(
      reconcileMissedSummerBottleneckEvents(harness(shared).dependencies)
    ).resolves.toEqual([
      expect.objectContaining({ decision: 'symphony-succeeded' }),
    ]);
  });

  it('ignores a corrupt recovery cursor and starts safely', async () => {
    const shared = memoryStore();
    const failed = harness(shared, {
      dispatchToSymphony: vi.fn(async () => {
        throw new Error('leave pending');
      }),
    });
    await expect(
      ingestSummerBottleneckSnapshot(snapshot(), failed.dependencies)
    ).rejects.toThrow();
    const read = shared.store.read.bind(shared.store);
    shared.store.read = async pathname => {
      if (pathname.endsWith('/recovery-cursor.json')) {
        throw new Error('cursor corrupt');
      }
      return read(pathname);
    };

    await expect(
      reconcileMissedSummerBottleneckEvents(harness(shared).dependencies)
    ).resolves.toEqual([
      expect.objectContaining({ decision: 'symphony-succeeded' }),
    ]);
  });

  it('terminalizes an expired recovery event without dispatching it', async () => {
    const shared = memoryStore();
    const failed = harness(shared, {
      dispatchToSymphony: vi.fn(async () => {
        throw new Error('dispatch transport unavailable');
      }),
    });
    await expect(
      ingestSummerBottleneckSnapshot(snapshot(), failed.dependencies)
    ).rejects.toThrow();
    const expired = harness(shared, {
      now: () => new Date(NOW.getTime() + 46 * 60 * 1000),
    });

    await expect(
      reconcileMissedSummerBottleneckEvents(expired.dependencies)
    ).resolves.toEqual([
      expect.objectContaining({
        decision: 'recovery-expired-noop',
        terminal: true,
      }),
    ]);
    expect(expired.dispatchToSymphony).not.toHaveBeenCalled();
  });

  it('dispatches again on a later cadence only when source-bound state changes', async () => {
    const proof = harness();
    await ingestSummerBottleneckSnapshot(snapshot(), proof.dependencies);
    await ingestSummerBottleneckSnapshot(
      snapshot({
        eventId: 'evt_bottleneck_0003',
        sourceVersion: 'c'.repeat(40),
        release: {
          sourceRevision: 'c'.repeat(40),
          mainSha: 'c'.repeat(40),
        },
      }),
      proof.dependencies
    );

    expect(proof.dispatchToSymphony).toHaveBeenCalledTimes(2);
  });

  it('returns a signed healthy no-op when no metric is blocked', async () => {
    const proof = harness();
    const baseline = snapshot();
    const receipt = await ingestSummerBottleneckSnapshot(
      snapshot({
        release: {
          blockedSince: null,
          productionSha: SOURCE,
          unverifiedMerges: 0,
        },
        ciAudit: {
          classes: baseline.signals.ciAudit.classes.map(item => ({
            ...item,
            state: 'implemented',
          })),
        },
      }),
      proof.dependencies
    );

    expect(receipt).toMatchObject({ decision: 'healthy-noop', terminal: true });
    expect(verifySummerBottleneckReceipt(receipt, KEY)).toBe(true);
    expect(proof.dispatchToSymphony).not.toHaveBeenCalled();
  });

  it.each([
    [
      'closure',
      {
        closure: {
          status: 'red',
          blockedSince: '2026-09-02T04:00:00.000Z',
          openPullRequests: 1,
        },
      },
      'closure-health-red',
    ],
    [
      'runner',
      {
        runner: {
          blockedSince: '2026-09-02T04:00:00.000Z',
          capacityAvailable: 0,
          queuedWork: 1,
        },
      },
      'runner-capacity-starvation',
    ],
  ])(
    'holds selected %s bottleneck outside the CI task admission policy',
    async (_name, change, expectedId) => {
      const proof = harness();
      const receipt = await ingestSummerBottleneckSnapshot(
        snapshot({
          ...change,
          release: {
            blockedSince: null,
            unverifiedMerges: 0,
            productionSha: SOURCE,
          },
          ciAudit: null,
        }),
        proof.dependencies
      );
      expect(receipt).toMatchObject({
        decision: 'held-host-assignment',
        selected: { id: expectedId, inEnvelope: true, handle: 'symphony' },
        executionHold: {
          kind: 'host-assignment',
          reason: 'selection-outside-task-admission-allowlist',
        },
      });
      expect(proof.dispatchToSymphony).not.toHaveBeenCalled();
    }
  );

  it('skips malformed and already-terminal events during heartbeat reconciliation', async () => {
    const shared = memoryStore();
    shared.records.set('summer-bottleneck/events/a.json', {
      schema: 'malformed',
    });
    const proof = harness(shared);
    await ingestSummerBottleneckSnapshot(snapshot(), proof.dependencies);

    await expect(
      reconcileMissedSummerBottleneckEvents(proof.dependencies)
    ).resolves.toEqual([]);
  });

  it('surfaces a forged terminal instead of treating it as complete', async () => {
    const shared = memoryStore();
    const proof = harness(shared);
    await ingestSummerBottleneckSnapshot(snapshot(), proof.dependencies);
    const terminalPath = [...shared.records.keys()].find(path =>
      path.includes('/terminal/')
    );
    expect(terminalPath).toBeDefined();
    shared.records.set(terminalPath!, { terminal: true, signature: 'forged' });

    await expect(
      reconcileMissedSummerBottleneckEvents(proof.dependencies)
    ).resolves.toEqual([
      expect.objectContaining({
        decision: 'invalid-terminal-conflict',
        terminal: false,
      }),
    ]);
    expect(
      [...shared.records.keys()].some(path => path.includes('/conflicts/'))
    ).toBe(true);
  });

  it('isolates a forged terminal with an already-conflicting conflict receipt', async () => {
    const shared = memoryStore();
    for (const [eventId, sourceVersion] of [
      ['evt_conflict_poison_0001', 'f'.repeat(40)],
      ['evt_conflict_poison_0002', '9'.repeat(40)],
    ] as const) {
      const failed = harness(shared, {
        dispatchToSymphony: vi.fn(async () => {
          throw new Error('leave pending');
        }),
      });
      await expect(
        ingestSummerBottleneckSnapshot(
          snapshot({ eventId, sourceVersion }),
          failed.dependencies
        )
      ).rejects.toThrow('leave pending');
    }

    const firstEventPath = [...shared.records.keys()]
      .filter(path => path.includes('/events/'))
      .sort((left, right) => left.localeCompare(right))[0];
    expect(firstEventPath).toBeDefined();
    shared.records.set(firstEventPath!.replace('/events/', '/terminal/'), {
      terminal: true,
      signature: 'forged',
    });
    shared.records.set(firstEventPath!.replace('/events/', '/conflicts/'), {
      decision: 'different-conflict',
      signature: 'forged',
    });

    const recovered = await reconcileMissedSummerBottleneckEvents(
      harness(shared).dependencies
    );
    expect(recovered).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ decision: 'recovery-processing-failed' }),
        expect.objectContaining({ decision: 'symphony-succeeded' }),
      ])
    );
  });

  it('skips forged or path-rebound event records during heartbeat reconciliation', async () => {
    const shared = memoryStore();
    shared.records.set('summer-bottleneck/events/forged.json', {
      schema: 'jovie.eve.summer-bottleneck-event/v1',
      snapshot: snapshot({ eventId: 'evt_bottleneck_forged' }),
      signature: `v1=${'0'.repeat(64)}`,
    });
    const valid = harness(shared, {
      dispatchToSymphony: vi.fn(async () => {
        throw new Error('leave valid event nonterminal');
      }),
    });
    await expect(
      ingestSummerBottleneckSnapshot(
        snapshot({ eventId: 'evt_bottleneck_rebound' }),
        valid.dependencies
      )
    ).rejects.toThrow('leave valid event nonterminal');
    const validEvent = [...shared.records.entries()].find(
      ([path]) =>
        path.includes('/events/') &&
        path !== 'summer-bottleneck/events/forged.json'
    );
    expect(validEvent).toBeDefined();
    shared.records.delete(validEvent![0]);
    shared.records.set('summer-bottleneck/events/rebound.json', validEvent![1]);

    await expect(
      reconcileMissedSummerBottleneckEvents(harness(shared).dependencies)
    ).resolves.toEqual([]);
  });

  it('rejects invalid or forged receipt signatures', () => {
    expect(verifySummerBottleneckReceipt({}, KEY)).toBe(false);
    expect(
      verifySummerBottleneckReceipt({ signature: `v1=${'0'.repeat(64)}` }, KEY)
    ).toBe(false);
    expect(
      verifySummerBottleneckReceipt({ signature: `v1=${'0'.repeat(64)}` }, '')
    ).toBe(false);
  });

  it('fails closed without receipt signing authority or a valid clock', async () => {
    const unsigned = harness(memoryStore(), { receiptSigningKey: '' });
    await expect(
      ingestSummerBottleneckSnapshot(snapshot(), unsigned.dependencies)
    ).rejects.toThrow('receipt signing authority is unavailable');

    const badClock = harness(memoryStore(), { now: () => new Date('invalid') });
    await expect(
      ingestSummerBottleneckSnapshot(snapshot(), badClock.dependencies)
    ).rejects.toThrow('current clock is invalid');
  });

  it.each([
    ['stale', { observedAt: '2026-09-02T07:44:59.000Z' }],
    ['future', { observedAt: '2026-09-02T08:01:01.000Z' }],
    [
      'stale CI audit',
      {
        signals: {
          ...snapshot().signals,
          ciAudit: {
            ...snapshot().signals.ciAudit,
            observedAt: '2026-09-02T07:44:59.000Z',
          },
        },
      },
    ],
    ['unbound', { sourceVersion: 'not-a-sha' }],
    [
      'cross-bound producer revision',
      { closure: { sourceRevision: 'b'.repeat(40) } },
    ],
  ])('fails closed for a %s source snapshot', async (_name, change) => {
    const proof = harness();
    await expect(
      ingestSummerBottleneckSnapshot(
        { ...snapshot(), ...change },
        proof.dependencies
      )
    ).rejects.toThrow();
    expect(proof.dispatchToSymphony).not.toHaveBeenCalled();
  });

  it('rejects projection mutation without a matching producer attestation', async () => {
    const forged = snapshot();
    forged.signals.release.unverifiedMerges = 99;
    const proof = harness();
    await expect(
      ingestSummerBottleneckSnapshot(forged, proof.dependencies)
    ).rejects.toThrow('bottleneck producer attestation is invalid');
    expect(proof.dispatchToSymphony).not.toHaveBeenCalled();
  });
});
