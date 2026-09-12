import {
  createHash,
  createHmac,
  sign as nodeSign,
  verify as nodeVerify,
  timingSafeEqual,
} from 'node:crypto';
import { z } from 'zod';

const SHA = /^[0-9a-f]{40}$/u;
const DIGEST = /^[0-9a-f]{64}$/u;
const MAX_SIGNAL_AGE_MS = 15 * 60 * 1000;
const MAX_RECOVERY_AGE_MS = 45 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 60 * 1000;
const MAX_RECONCILED_EVENTS = 25;
const MAX_SCANNED_EVENTS = 100;
const PREFIX = 'summer-bottleneck';

const exactSha = z.string().regex(SHA);
const timestamp = z.string().datetime({ offset: true });
const sourceFields = {
  observedAt: timestamp,
  sourceDigest: z.string().regex(DIGEST),
  sourceRevision: exactSha,
};
const runtimeSourceFields = {
  observedAt: timestamp,
  sourceDigest: z.string().regex(DIGEST),
  sourceRevision: exactSha.nullable(),
};

export const summerCiImprovementClassIds = [
  'merge-group-flake-baseline-ratchet',
  'controller-cascade-coalescing',
  'auto-enroll-self-cancel-churn',
  'controller-check-run-pagination-cap',
  'obsolete-unaffected-native-lanes',
  'affected-only-unit-selection',
] as const;

export type SummerCiImprovementClassId =
  (typeof summerCiImprovementClassIds)[number];
export type SymphonyRepairAction =
  | 'reconcile-release-certification-starvation'
  | 'remediate-selected-ci-audit-class';

const ciClassId = z.enum(summerCiImprovementClassIds);
const runnerAuthority = z
  .object({
    schema: z.enum([
      'symphony-lease-guard-report/v1',
      'symphony-runtime-state/v1',
    ]),
    observedAt: timestamp,
    sourceDigest: z.string().regex(DIGEST),
    sourceRevision: exactSha.nullable(),
  })
  .strict();
const ciAuditSchema = z
  .object({
    schema: z.literal('jovie-ci-bottleneck-audit/v1'),
    ...sourceFields,
    classes: z
      .array(
        z
          .object({
            id: ciClassId,
            state: z.enum(['open', 'partial', 'implemented']),
            blockedSince: timestamp,
            impact: z.number().int().positive().max(100),
            owner: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{1,63}$/u),
            handle: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:#/_-]{1,127}$/u),
          })
          .strict()
      )
      .length(summerCiImprovementClassIds.length),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.classes.map(item => item.id);
    if (
      new Set(ids).size !== summerCiImprovementClassIds.length ||
      summerCiImprovementClassIds.some(id => !ids.includes(id))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'CI audit must contain every improvement class exactly once',
        path: ['classes'],
      });
    }
  });

export const summerBottleneckSnapshotSchema = z
  .object({
    schema: z.literal('jovie.eve.summer-bottleneck-snapshot/v1'),
    eventId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/u),
    observedAt: timestamp,
    producerAttestation: z
      .object({
        algorithm: z.literal('Ed25519'),
        keyId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u),
        signature: z.string().regex(/^[A-Za-z0-9_-]{80,100}$/u),
      })
      .strict(),
    sourceVersion: exactSha,
    signals: z
      .object({
        closure: z
          .object({
            schema: z.literal('jovie.eve.summer-closure-projection/v1'),
            sourceSchema: z.literal('jovie-closure-health/v1'),
            ...sourceFields,
            status: z.enum(['healthy', 'grace', 'red']),
            blockedSince: timestamp.nullable(),
            openPullRequests: z.number().int().nonnegative(),
          })
          .strict(),
        queue: z
          .object({
            schema: z.literal('jovie.eve.summer-queue-projection/v1'),
            sourceSchema: z.literal('github-merge-queue-entry/v1'),
            ...sourceFields,
            blockedSince: timestamp.nullable(),
            eligibleCleanPrs: z.number().int().nonnegative(),
            queuedPrs: z.number().int().nonnegative(),
          })
          .strict(),
        release: z
          .object({
            schema: z.literal('jovie.eve.summer-release-projection/v1'),
            sourceSchema: z.literal('jovie-controller-snapshot/v1'),
            ...sourceFields,
            blockedSince: timestamp.nullable(),
            mainSha: exactSha,
            productionSha: exactSha.nullable(),
            unverifiedMerges: z.number().int().nonnegative(),
          })
          .strict(),
        runner: z
          .object({
            schema: z.literal('jovie.eve.summer-runner-projection/v1'),
            sourceSchema: z.literal('symphony-runner-projection/v1'),
            ...runtimeSourceFields,
            blockedSince: timestamp.nullable(),
            capacitySource: runnerAuthority,
            workSource: runnerAuthority,
            capacityAvailable: z.number().int().nonnegative().nullable(),
            queuedWork: z.number().int().nonnegative().nullable(),
          })
          .strict(),
        ciAudit: ciAuditSchema.nullable(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    const revisions = [
      value.signals.closure.sourceRevision,
      value.signals.queue.sourceRevision,
      value.signals.release.sourceRevision,
      ...(value.signals.ciAudit ? [value.signals.ciAudit.sourceRevision] : []),
      value.signals.release.mainSha,
    ];
    if (revisions.some(revision => revision !== value.sourceVersion)) {
      context.addIssue({
        code: 'custom',
        message: 'every projection must bind to the exact snapshot source',
        path: ['sourceVersion'],
      });
    }
    if (
      value.signals.runner.workSource.sourceRevision !==
      value.signals.runner.sourceRevision
    ) {
      context.addIssue({
        code: 'custom',
        message: 'runner work must bind to the runner source revision',
        path: ['signals', 'runner', 'workSource', 'sourceRevision'],
      });
    }
    if (
      value.signals.runner.capacityAvailable !== null &&
      value.signals.runner.capacitySource.schema !==
        'symphony-lease-guard-report/v1'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'runner capacity must bind to lease authority',
        path: ['signals', 'runner', 'capacitySource', 'schema'],
      });
    }
    if (
      value.signals.runner.queuedWork !== null &&
      value.signals.runner.workSource.schema !== 'symphony-runtime-state/v1'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'runner work must bind to Symphony runtime authority',
        path: ['signals', 'runner', 'workSource', 'schema'],
      });
    }
  });

export type SummerBottleneckSnapshot = z.infer<
  typeof summerBottleneckSnapshotSchema
>;
export type SummerBottleneckRecord = Readonly<Record<string, unknown>>;

function unsignedProducerSnapshot(snapshot: SummerBottleneckRecord) {
  const { producerAttestation: _attestation, ...unsigned } = snapshot;
  return unsigned;
}

export function signSummerBottleneckProducerAttestation(
  snapshot: SummerBottleneckRecord,
  privateKey: string,
  keyId: string
) {
  return {
    algorithm: 'Ed25519' as const,
    keyId,
    signature: nodeSign(
      null,
      Buffer.from(
        `jovie.eve.summer-bottleneck-snapshot/v1\0${canonical(
          unsignedProducerSnapshot(snapshot)
        )}`
      ),
      privateKey
    ).toString('base64url'),
  };
}

export function verifySummerBottleneckProducerAttestation(
  snapshot: SummerBottleneckSnapshot,
  keys: ReadonlyMap<string, string>
): boolean {
  const publicKey = keys.get(snapshot.producerAttestation.keyId);
  if (!publicKey) return false;
  return nodeVerify(
    null,
    Buffer.from(
      `jovie.eve.summer-bottleneck-snapshot/v1\0${canonical(
        unsignedProducerSnapshot(snapshot)
      )}`
    ),
    publicKey,
    Buffer.from(snapshot.producerAttestation.signature, 'base64url')
  );
}

export type SummerBottleneckStore = {
  create(
    pathname: string,
    record: SummerBottleneckRecord
  ): Promise<'created' | 'exists'>;
  read(pathname: string): Promise<SummerBottleneckRecord | null>;
  list(
    prefix: string,
    options: { readonly cursor?: string; readonly limit: number }
  ): Promise<{
    readonly cursor?: string;
    readonly hasMore: boolean;
    readonly scanned: number;
    readonly entries: readonly {
      readonly pathname: string;
      readonly record: SummerBottleneckRecord;
    }[];
  }>;
  write(pathname: string, record: SummerBottleneckRecord): Promise<void>;
};

export const symphonyRepairTaskSchema = z
  .object({
    schema: z.literal('jovie-symphony-repair-task/v1'),
    taskKey: z.string().regex(DIGEST),
    createdAt: timestamp,
    owner: z.literal('symphony'),
    route: z.literal('symphony'),
    authority: z.literal(
      'source-repair-only-no-direct-pr-queue-or-deploy-mutation'
    ),
    action: z.enum([
      'reconcile-release-certification-starvation',
      'remediate-selected-ci-audit-class',
    ]),
    issue: z.literal('JOV-5853'),
    safety: z.literal(
      'exact-source-ci-native-queue-production-gates-remain-required'
    ),
    selected: z
      .object({
        id: z.union([z.literal('release-certification-starvation'), ciClassId]),
        sourceRevision: exactSha,
        sourceDigest: z.string().regex(DIGEST),
        owner: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{1,63}$/u),
        handle: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:#/_-]{1,127}$/u),
      })
      .strict(),
    source: z
      .object({
        sourceVersion: exactSha,
        snapshotDigest: z.string().regex(DIGEST),
      })
      .strict(),
  })
  .strict()
  .superRefine((task, context) => {
    const isRelease = task.selected.id === 'release-certification-starvation';
    if (
      (isRelease &&
        task.action !== 'reconcile-release-certification-starvation') ||
      (!isRelease && task.action !== 'remediate-selected-ci-audit-class')
    ) {
      context.addIssue({
        code: 'custom',
        message: 'repair action is not bound to the selected bottleneck',
        path: ['action'],
      });
    }
    if (task.selected.sourceRevision !== task.source.sourceVersion) {
      context.addIssue({
        code: 'custom',
        message: 'selected source revision is cross-bound',
        path: ['selected', 'sourceRevision'],
      });
    }
  });

export type SymphonyRepairTask = z.infer<typeof symphonyRepairTaskSchema>;

export type SummerBottleneckDependencies = {
  readonly dispatchToSymphony: (
    task: SymphonyRepairTask,
    options: { readonly idempotencyKey: string }
  ) => Promise<{ readonly handle: string }>;
  readonly now: () => Date;
  readonly observeSymphonyOutcome: (input: {
    readonly handle: string;
    readonly idempotencyKey: string;
  }) => Promise<{
    readonly status: 'pending' | 'succeeded' | 'failed';
    readonly detail: string;
  }>;
  readonly receiptSigningKeyId: string;
  readonly receiptSigningKey: string;
  readonly producerVerificationKeys: ReadonlyMap<string, string>;
  readonly store: SummerBottleneckStore;
};

type Candidate = {
  readonly id:
    | 'closure-health-red'
    | 'native-queue-starvation'
    | 'release-certification-starvation'
    | 'runner-capacity-starvation'
    | (typeof summerCiImprovementClassIds)[number];
  readonly blockedSince: string;
  readonly blockedMs: number;
  readonly impact: number;
  readonly inEnvelope: boolean;
  readonly sourceRevision: string;
  readonly sourceDigest: string;
  readonly owner: string;
  readonly handle: string;
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

function semanticIdentity(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(semanticIdentity);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'observedAt')
        .map(([key, child]) => [key, semanticIdentity(child)])
    );
  }
  return value;
}

function semanticSnapshotIdentity(snapshot: SummerBottleneckSnapshot): unknown {
  const { producerAttestation: _attestation, ...unsigned } = snapshot;
  return semanticIdentity(unsigned);
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function eventKey(eventId: string): string {
  return digest({ eventId });
}

function paths(snapshot: SummerBottleneckSnapshot, fingerprint?: string) {
  const key = eventKey(snapshot.eventId);
  return {
    conflict: `${PREFIX}/conflicts/${key}.json`,
    event: `${PREFIX}/events/${key}.json`,
    terminal: `${PREFIX}/terminal/${key}.json`,
    ...(fingerprint
      ? {
          claim: `${PREFIX}/claims/${fingerprint}.json`,
          dispatch: `${PREFIX}/dispatch/${fingerprint}.json`,
          outcome: `${PREFIX}/outcomes/${fingerprint}.json`,
        }
      : {}),
  };
}

function validateFreshness(
  snapshot: SummerBottleneckSnapshot,
  now: Date
): void {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) throw new Error('current clock is invalid');
  const timestamps = [
    snapshot.observedAt,
    snapshot.signals.closure.observedAt,
    snapshot.signals.queue.observedAt,
    snapshot.signals.release.observedAt,
    snapshot.signals.runner.observedAt,
    ...(snapshot.signals.ciAudit ? [snapshot.signals.ciAudit.observedAt] : []),
    snapshot.signals.runner.capacitySource.observedAt,
    snapshot.signals.runner.workSource.observedAt,
  ];
  for (const value of timestamps) {
    const ageMs = nowMs - Date.parse(value);
    if (ageMs > MAX_SIGNAL_AGE_MS || ageMs < -MAX_CLOCK_SKEW_MS) {
      throw new Error('bottleneck signal is outside the freshness window');
    }
  }
}

function candidate(
  id: Candidate['id'],
  blockedSince: string | null,
  impact: number,
  sourceRevision: string,
  sourceDigest: string,
  nowMs: number,
  inEnvelope = false,
  owner = 'Summer',
  handle = 'ovie-founder-review'
): Candidate | null {
  if (!blockedSince) return null;
  const blockedMs = nowMs - Date.parse(blockedSince);
  if (!Number.isFinite(blockedMs) || blockedMs < 0) return null;
  return {
    id,
    blockedSince,
    blockedMs,
    impact,
    sourceRevision,
    sourceDigest,
    inEnvelope,
    owner,
    handle,
  };
}

export function rankSummerBottlenecks(
  snapshot: SummerBottleneckSnapshot,
  now: Date
): readonly Candidate[] {
  const nowMs = now.getTime();
  const { ciAudit, closure, queue, release, runner } = snapshot.signals;
  const queuedWork = runner.queuedWork;
  const runnerSourceRevision = runner.sourceRevision;
  const candidates = [
    closure.status === 'red' && closure.openPullRequests > 0
      ? candidate(
          'closure-health-red',
          closure.blockedSince,
          closure.openPullRequests * 80,
          closure.sourceRevision,
          closure.sourceDigest,
          nowMs
        )
      : null,
    queue.eligibleCleanPrs > 0 && queue.queuedPrs === 0
      ? candidate(
          'native-queue-starvation',
          queue.blockedSince,
          queue.eligibleCleanPrs * 60,
          queue.sourceRevision,
          queue.sourceDigest,
          nowMs
        )
      : null,
    release.unverifiedMerges > 0 && release.mainSha !== release.productionSha
      ? candidate(
          'release-certification-starvation',
          release.blockedSince,
          release.unverifiedMerges * 100,
          release.sourceRevision,
          release.sourceDigest,
          nowMs,
          true,
          'Summer',
          'symphony'
        )
      : null,
    ...(ciAudit
      ? ciAudit.classes.map(item =>
          item.state === 'implemented'
            ? null
            : candidate(
                item.id,
                item.blockedSince,
                item.impact,
                ciAudit.sourceRevision,
                ciAudit.sourceDigest,
                nowMs,
                true,
                item.owner,
                item.handle
              )
        )
      : []),
    runner.capacityAvailable === 0 &&
    queuedWork !== null &&
    queuedWork > 0 &&
    runnerSourceRevision !== null
      ? candidate(
          'runner-capacity-starvation',
          runner.blockedSince,
          queuedWork * 40,
          runnerSourceRevision,
          runner.sourceDigest,
          nowMs
        )
      : null,
  ].filter((item): item is Candidate => item !== null);
  return candidates.sort(
    (left, right) =>
      right.blockedMs - left.blockedMs ||
      right.impact - left.impact ||
      left.id.localeCompare(right.id)
  );
}

function fingerprintFor(
  snapshot: SummerBottleneckSnapshot,
  selected: Candidate
): string {
  const signal =
    selected.id === 'closure-health-red'
      ? snapshot.signals.closure
      : selected.id === 'native-queue-starvation'
        ? snapshot.signals.queue
        : selected.id === 'release-certification-starvation'
          ? snapshot.signals.release
          : selected.id === 'runner-capacity-starvation'
            ? snapshot.signals.runner
            : snapshot.signals.ciAudit?.classes.find(
                item => item.id === selected.id
              );
  return digest({
    bottleneck: selected.id,
    blockedSince: selected.blockedSince,
    ...(summerCiImprovementClassIds.some(id => id === selected.id)
      ? { repairEnvelope: 'ci-audit-source-repair-v1' }
      : {}),
    signal: semanticIdentity(signal),
    sourceVersion: snapshot.sourceVersion,
  });
}

type RepairSelection =
  | {
      readonly id: 'release-certification-starvation';
      readonly action: 'reconcile-release-certification-starvation';
    }
  | {
      readonly id: SummerCiImprovementClassId;
      readonly action: 'remediate-selected-ci-audit-class';
    };

function isSummerCiImprovementClassId(
  id: Candidate['id']
): id is SummerCiImprovementClassId {
  return summerCiImprovementClassIds.some(knownId => knownId === id);
}

function repairSelectionFor(selected: Candidate): RepairSelection | null {
  if (selected.id === 'release-certification-starvation') {
    return {
      id: selected.id,
      action: 'reconcile-release-certification-starvation',
    };
  }
  return isSummerCiImprovementClassId(selected.id)
    ? { id: selected.id, action: 'remediate-selected-ci-audit-class' }
    : null;
}

function signedReceipt(
  receipt: SummerBottleneckRecord,
  signingKey: string,
  signingKeyId: string,
  receiptPath: string
): SummerBottleneckRecord {
  if (!signingKey || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u.test(signingKeyId)) {
    throw new Error('receipt signing authority is unavailable');
  }
  const schemaDomain = String(receipt.schema);
  const {
    signature: _existingSignature,
    receiptPath: _existingPath,
    signatureKeyId: _existingKeyId,
    ...body
  } = receipt;
  const unsigned = { ...body, receiptPath, signatureKeyId: signingKeyId };
  const signature = createHmac('sha256', signingKey)
    .update(
      `jovie.eve.summer-bottleneck-receipt/v1\0${schemaDomain}\0${receiptPath}\0${canonical(
        unsigned
      )}`
    )
    .digest('hex');
  return { ...unsigned, signature: `v1=${signature}` };
}

function signFor(
  dependencies: SummerBottleneckDependencies,
  receipt: SummerBottleneckRecord,
  receiptPath = `${PREFIX}/ephemeral/${String(receipt.eventId ?? 'runtime')}`
): SummerBottleneckRecord {
  return signedReceipt(
    receipt,
    dependencies.receiptSigningKey,
    dependencies.receiptSigningKeyId,
    receiptPath
  );
}

export function verifySummerBottleneckReceipt(
  input: SummerBottleneckRecord,
  signingKey: string,
  expectedPath = input.receiptPath
): boolean {
  if (!signingKey) return false;
  const signature = input.signature;
  if (typeof signature !== 'string' || !/^v1=[0-9a-f]{64}$/u.test(signature))
    return false;
  const keyId = input.signatureKeyId;
  if (
    typeof keyId !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u.test(keyId)
  )
    return false;
  if (
    typeof input.receiptPath !== 'string' ||
    typeof expectedPath !== 'string' ||
    input.receiptPath !== expectedPath
  )
    return false;
  const { signature: _removed, ...unsigned } = input;
  const expected = signedReceipt(
    unsigned,
    signingKey,
    keyId,
    expectedPath
  ).signature;
  if (typeof expected !== 'string') return false;
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function persistTerminal(
  dependencies: SummerBottleneckDependencies,
  snapshot: SummerBottleneckSnapshot,
  receipt: SummerBottleneckRecord
): Promise<SummerBottleneckRecord> {
  const signed = signFor(dependencies, receipt, paths(snapshot).terminal);
  const result = await dependencies.store.create(
    paths(snapshot).terminal,
    signed
  );
  if (result === 'created') return signed;
  const existing = await dependencies.store.read(paths(snapshot).terminal);
  if (!existing || digest(existing) !== digest(signed)) {
    throw new Error('terminal receipt conflict');
  }
  return existing;
}

function baseReceipt(
  snapshot: SummerBottleneckSnapshot,
  dependencies: SummerBottleneckDependencies,
  selected: Candidate | null,
  fingerprint: string | null,
  ranking: readonly Candidate[] = []
) {
  return {
    schema: 'jovie.eve.summer-bottleneck-receipt/v1',
    eventId: snapshot.eventId,
    observedAt: dependencies.now().toISOString(),
    owner: 'Summer',
    handle: selected?.inEnvelope ? 'symphony' : 'summer',
    source: {
      sourceVersion: snapshot.sourceVersion,
      snapshotDigest: digest(snapshot),
    },
    selected,
    ranking,
    fingerprint,
  };
}

async function processStoredSnapshot(
  snapshot: SummerBottleneckSnapshot,
  dependencies: SummerBottleneckDependencies
): Promise<SummerBottleneckRecord> {
  const now = dependencies.now();
  const ranking = rankSummerBottlenecks(snapshot, now);
  const selected = ranking[0] ?? null;
  if (!selected) {
    return persistTerminal(dependencies, snapshot, {
      ...baseReceipt(snapshot, dependencies, null, null, ranking),
      decision: 'healthy-noop',
      terminal: true,
    });
  }

  const fingerprint = fingerprintFor(snapshot, selected);
  const repairSelection = repairSelectionFor(selected);
  const recordPaths = paths(snapshot, fingerprint);
  const completed = await dependencies.store.read(recordPaths.outcome!);
  if (completed) {
    if (
      completed.schema !== 'jovie.eve.summer-bottleneck-outcome/v1' ||
      completed.terminal !== true ||
      ![
        'held-out-of-envelope',
        'symphony-failed',
        'symphony-succeeded',
      ].includes(String(completed.decision)) ||
      completed.fingerprint !== fingerprint ||
      !verifySummerBottleneckReceipt(
        completed,
        dependencies.receiptSigningKey,
        recordPaths.outcome
      )
    ) {
      throw new Error('bottleneck outcome conflict');
    }
    return persistTerminal(dependencies, snapshot, {
      ...baseReceipt(snapshot, dependencies, selected, fingerprint, ranking),
      decision: 'unchanged-noop',
      priorOutcomeDigest: digest(completed),
      terminal: true,
    });
  }

  const claim = signFor(
    dependencies,
    {
      ...baseReceipt(snapshot, dependencies, selected, fingerprint, ranking),
      schema: 'jovie.eve.summer-bottleneck-claim/v1',
      decision: selected.inEnvelope && repairSelection ? 'claimed' : 'held',
      terminal: !(selected.inEnvelope && repairSelection),
    },
    recordPaths.claim
  );
  const claimWrite = await dependencies.store.create(recordPaths.claim!, claim);
  if (claimWrite === 'exists') {
    const existingClaim = await dependencies.store.read(recordPaths.claim!);
    if (
      !existingClaim ||
      existingClaim.schema !== 'jovie.eve.summer-bottleneck-claim/v1' ||
      !['claimed', 'held'].includes(String(existingClaim.decision)) ||
      existingClaim.fingerprint !== fingerprint ||
      !verifySummerBottleneckReceipt(
        existingClaim,
        dependencies.receiptSigningKey,
        recordPaths.claim
      )
    ) {
      throw new Error('bottleneck claim conflict');
    }
  }

  if (!selected.inEnvelope || !repairSelection) {
    const outcome = signFor(
      dependencies,
      {
        ...baseReceipt(snapshot, dependencies, selected, fingerprint, ranking),
        schema: 'jovie.eve.summer-bottleneck-outcome/v1',
        decision: 'held-out-of-envelope',
        escalation: {
          owner: 'Summer',
          handle: 'ovie-founder-review',
          reason: `${selected.id} is outside the current repair envelope`,
        },
        terminal: true,
      },
      recordPaths.outcome
    );
    const outcomeWrite = await dependencies.store.create(
      recordPaths.outcome!,
      outcome
    );
    const persisted =
      outcomeWrite === 'created'
        ? outcome
        : await dependencies.store.read(recordPaths.outcome!);
    if (!persisted || digest(persisted) !== digest(outcome)) {
      throw new Error('held outcome conflict');
    }
    return persistTerminal(dependencies, snapshot, persisted);
  }

  const task: SymphonyRepairTask = {
    schema: 'jovie-symphony-repair-task/v1',
    taskKey: fingerprint,
    createdAt: snapshot.observedAt,
    owner: 'symphony',
    route: 'symphony',
    authority: 'source-repair-only-no-direct-pr-queue-or-deploy-mutation',
    action: repairSelection.action,
    issue: 'JOV-5853',
    safety: 'exact-source-ci-native-queue-production-gates-remain-required',
    selected: {
      id: repairSelection.id,
      sourceRevision: selected.sourceRevision,
      sourceDigest: selected.sourceDigest,
      owner: selected.owner,
      handle: selected.handle,
    },
    source: {
      sourceVersion: snapshot.sourceVersion,
      snapshotDigest: digest(snapshot),
    },
  };

  let dispatchReceipt = await dependencies.store.read(recordPaths.dispatch!);
  if (!dispatchReceipt) {
    const dispatched = await dependencies.dispatchToSymphony(task, {
      idempotencyKey: fingerprint,
    });
    if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$/u.test(dispatched.handle)) {
      throw new Error('Symphony returned an invalid handle');
    }
    const proposed = signFor(
      dependencies,
      {
        ...baseReceipt(snapshot, dependencies, selected, fingerprint, ranking),
        schema: 'jovie.eve.summer-bottleneck-dispatch/v1',
        decision: 'dispatched',
        task,
        symphony: { handle: dispatched.handle },
        terminal: false,
      },
      recordPaths.dispatch
    );
    const written = await dependencies.store.create(
      recordPaths.dispatch!,
      proposed
    );
    dispatchReceipt =
      written === 'created'
        ? proposed
        : await dependencies.store.read(recordPaths.dispatch!);
    if (!dispatchReceipt || digest(dispatchReceipt) !== digest(proposed)) {
      throw new Error('dispatch receipt conflict');
    }
  }
  const handle = (dispatchReceipt?.symphony as { handle?: unknown } | undefined)
    ?.handle;
  if (
    typeof handle !== 'string' ||
    dispatchReceipt?.schema !== 'jovie.eve.summer-bottleneck-dispatch/v1' ||
    dispatchReceipt?.decision !== 'dispatched' ||
    dispatchReceipt?.terminal !== false ||
    dispatchReceipt?.fingerprint !== fingerprint ||
    !verifySummerBottleneckReceipt(
      dispatchReceipt,
      dependencies.receiptSigningKey,
      recordPaths.dispatch
    )
  ) {
    throw new Error('dispatch receipt is invalid');
  }

  let observed: Awaited<
    ReturnType<SummerBottleneckDependencies['observeSymphonyOutcome']>
  >;
  try {
    observed = await dependencies.observeSymphonyOutcome({
      handle,
      idempotencyKey: fingerprint,
    });
  } catch {
    return signFor(dependencies, {
      ...baseReceipt(snapshot, dependencies, selected, fingerprint, ranking),
      decision: 'pending-observation',
      symphony: { handle },
      terminal: false,
    });
  }
  if (observed.status === 'pending') {
    return signFor(dependencies, {
      ...baseReceipt(snapshot, dependencies, selected, fingerprint, ranking),
      decision: 'pending-symphony',
      symphony: { handle },
      terminal: false,
    });
  }

  const outcome = signFor(
    dependencies,
    {
      ...baseReceipt(snapshot, dependencies, selected, fingerprint, ranking),
      schema: 'jovie.eve.summer-bottleneck-outcome/v1',
      decision:
        observed.status === 'succeeded'
          ? 'symphony-succeeded'
          : 'symphony-failed',
      symphony: { handle, detail: observed.detail },
      terminal: true,
    },
    recordPaths.outcome
  );
  const outcomeWrite = await dependencies.store.create(
    recordPaths.outcome!,
    outcome
  );
  const persisted =
    outcomeWrite === 'created'
      ? outcome
      : await dependencies.store.read(recordPaths.outcome!);
  if (!persisted || digest(persisted) !== digest(outcome)) {
    throw new Error('Symphony outcome conflict');
  }
  return persistTerminal(dependencies, snapshot, persisted);
}

export async function ingestSummerBottleneckSnapshot(
  input: unknown,
  dependencies: SummerBottleneckDependencies
): Promise<SummerBottleneckRecord> {
  const snapshot = summerBottleneckSnapshotSchema.parse(input);
  if (
    !verifySummerBottleneckProducerAttestation(
      snapshot,
      dependencies.producerVerificationKeys
    )
  ) {
    throw new Error('bottleneck producer attestation is invalid');
  }
  validateFreshness(snapshot, dependencies.now());
  const eventPath = paths(snapshot).event;
  const eventReceipt = signFor(
    dependencies,
    {
      schema: 'jovie.eve.summer-bottleneck-event/v1',
      eventId: snapshot.eventId,
      snapshot,
      sourceVersion: snapshot.sourceVersion,
      snapshotDigest: digest(snapshot),
    },
    eventPath
  );
  if ((await dependencies.store.create(eventPath, eventReceipt)) === 'exists') {
    const existing = await dependencies.store.read(eventPath);
    const existingSnapshot = summerBottleneckSnapshotSchema.safeParse(
      existing?.snapshot
    );
    if (
      !existing ||
      existing.schema !== 'jovie.eve.summer-bottleneck-event/v1' ||
      !verifySummerBottleneckReceipt(
        existing,
        dependencies.receiptSigningKey,
        eventPath
      ) ||
      !existingSnapshot.success ||
      existing.eventId !== existingSnapshot.data.eventId ||
      existing.sourceVersion !== existingSnapshot.data.sourceVersion ||
      existing.snapshotDigest !== digest(existingSnapshot.data) ||
      digest(semanticSnapshotIdentity(existingSnapshot.data)) !==
        digest(semanticSnapshotIdentity(snapshot))
    ) {
      throw new Error('bottleneck event conflict');
    }
    return signFor(dependencies, {
      schema: 'jovie.eve.summer-bottleneck-receipt/v1',
      eventId: snapshot.eventId,
      decision: 'duplicate-replay-rejected',
      owner: 'Summer',
      handle: 'summer',
      terminal: true,
    });
  }
  return processStoredSnapshot(snapshot, dependencies);
}

export async function reconcileMissedSummerBottleneckEvents(
  dependencies: SummerBottleneckDependencies
): Promise<readonly SummerBottleneckRecord[]> {
  const reconciled: SummerBottleneckRecord[] = [];
  const cursorPath = `${PREFIX}/recovery-cursor.json`;
  let storedCursor: SummerBottleneckRecord | null = null;
  try {
    storedCursor = await dependencies.store.read(cursorPath);
  } catch {
    // A corrupt mutable checkpoint must not block durable event recovery.
  }
  let cursor =
    storedCursor?.schema === 'jovie.eve.summer-bottleneck-cursor/v1' &&
    (typeof storedCursor.cursor === 'string' || storedCursor.cursor === null) &&
    verifySummerBottleneckReceipt(
      storedCursor,
      dependencies.receiptSigningKey,
      cursorPath
    )
      ? (storedCursor.cursor ?? undefined)
      : undefined;
  let scanned = 0;
  let attempted = 0;
  let hasMore = true;
  const observedCursors = new Set<string>();
  while (
    hasMore &&
    scanned < MAX_SCANNED_EVENTS &&
    attempted < MAX_RECONCILED_EVENTS
  ) {
    const requestedCursor = cursor;
    const page = await dependencies.store.list(`${PREFIX}/events/`, {
      ...(requestedCursor ? { cursor: requestedCursor } : {}),
      limit: Math.min(
        MAX_RECONCILED_EVENTS - attempted,
        MAX_SCANNED_EVENTS - scanned
      ),
    });
    if (
      page.hasMore &&
      (!page.cursor ||
        page.cursor === requestedCursor ||
        observedCursors.has(page.cursor))
    ) {
      reconciled.push(
        signFor(dependencies, {
          schema: 'jovie.eve.summer-bottleneck-receipt/v1',
          decision: 'recovery-cursor-conflict',
          observedAt: dependencies.now().toISOString(),
          terminal: false,
        })
      );
      cursor = undefined;
      hasMore = false;
      break;
    }
    if (page.cursor) observedCursors.add(page.cursor);
    hasMore = page.hasMore;
    cursor = page.cursor;
    scanned += page.scanned;
    for (const entry of page.entries) {
      const eventReceipt = entry.record;
      if (
        eventReceipt.schema !== 'jovie.eve.summer-bottleneck-event/v1' ||
        !verifySummerBottleneckReceipt(
          eventReceipt,
          dependencies.receiptSigningKey,
          entry.pathname
        )
      ) {
        continue;
      }
      const parsed = summerBottleneckSnapshotSchema.safeParse(
        eventReceipt.snapshot
      );
      if (!parsed.success) continue;
      if (
        !verifySummerBottleneckProducerAttestation(
          parsed.data,
          dependencies.producerVerificationKeys
        )
      ) {
        continue;
      }
      if (entry.pathname !== paths(parsed.data).event) continue;
      if (
        eventReceipt.eventId !== parsed.data.eventId ||
        eventReceipt.sourceVersion !== parsed.data.sourceVersion ||
        eventReceipt.snapshotDigest !== digest(parsed.data)
      ) {
        continue;
      }
      let attemptCounted = false;
      try {
        let terminal: SummerBottleneckRecord | null;
        try {
          terminal = await dependencies.store.read(paths(parsed.data).terminal);
        } catch {
          attempted += 1;
          attemptCounted = true;
          reconciled.push(
            signFor(dependencies, {
              ...baseReceipt(parsed.data, dependencies, null, null),
              decision: 'recovery-terminal-read-failed',
              terminal: false,
            })
          );
          continue;
        }
        if (terminal) {
          const source = terminal.source as
            | { sourceVersion?: unknown; snapshotDigest?: unknown }
            | undefined;
          const validTerminal =
            [
              'healthy-noop',
              'held-out-of-envelope',
              'recovery-expired-noop',
              'symphony-failed',
              'symphony-succeeded',
              'unchanged-noop',
            ].includes(String(terminal.decision)) &&
            [
              'jovie.eve.summer-bottleneck-outcome/v1',
              'jovie.eve.summer-bottleneck-receipt/v1',
            ].includes(String(terminal.schema)) &&
            terminal.eventId === parsed.data.eventId &&
            terminal.terminal === true &&
            source?.sourceVersion === parsed.data.sourceVersion &&
            source.snapshotDigest === digest(parsed.data) &&
            verifySummerBottleneckReceipt(
              terminal,
              dependencies.receiptSigningKey,
              paths(parsed.data).terminal
            );
          if (validTerminal) continue;
          attempted += 1;
          attemptCounted = true;
          const conflict = signFor(
            dependencies,
            {
              ...baseReceipt(parsed.data, dependencies, null, null),
              observedAt: parsed.data.observedAt,
              conflictingTerminalDigest: digest(terminal),
              decision: 'invalid-terminal-conflict',
              terminal: false,
            },
            paths(parsed.data).conflict
          );
          const conflictWrite = await dependencies.store.create(
            paths(parsed.data).conflict,
            conflict
          );
          const persistedConflict =
            conflictWrite === 'created'
              ? conflict
              : await dependencies.store.read(paths(parsed.data).conflict);
          if (
            !persistedConflict ||
            digest(persistedConflict) !== digest(conflict)
          ) {
            throw new Error('terminal conflict receipt is itself conflicted');
          }
          reconciled.push(persistedConflict);
          continue;
        }
        attempted += 1;
        attemptCounted = true;
        const recoveryAgeMs =
          dependencies.now().getTime() - Date.parse(parsed.data.observedAt);
        if (
          !Number.isFinite(recoveryAgeMs) ||
          recoveryAgeMs < -MAX_CLOCK_SKEW_MS
        ) {
          reconciled.push(
            signFor(dependencies, {
              ...baseReceipt(parsed.data, dependencies, null, null),
              decision: 'recovery-clock-conflict',
              terminal: false,
            })
          );
          continue;
        }
        if (recoveryAgeMs > MAX_RECOVERY_AGE_MS) {
          reconciled.push(
            await persistTerminal(dependencies, parsed.data, {
              ...baseReceipt(parsed.data, dependencies, null, null),
              decision: 'recovery-expired-noop',
              recoveryAgeMs,
              terminal: true,
            })
          );
          continue;
        }
        reconciled.push(await processStoredSnapshot(parsed.data, dependencies));
      } catch {
        if (!attemptCounted) attempted += 1;
        reconciled.push(
          signFor(dependencies, {
            ...baseReceipt(parsed.data, dependencies, null, null),
            decision: 'recovery-processing-failed',
            terminal: false,
          })
        );
      }
    }
    if (page.scanned === 0 && page.hasMore) {
      throw new Error('recovery cursor did not advance');
    }
  }
  await dependencies.store.write(
    cursorPath,
    signFor(
      dependencies,
      {
        schema: 'jovie.eve.summer-bottleneck-cursor/v1',
        cursor: hasMore ? (cursor ?? null) : null,
        observedAt: dependencies.now().toISOString(),
      },
      cursorPath
    )
  );
  return reconciled;
}
