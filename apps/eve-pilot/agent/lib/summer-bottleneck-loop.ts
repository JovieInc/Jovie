import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const SHA = /^[0-9a-f]{40}$/u;
const MAX_SIGNAL_AGE_MS = 15 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 60 * 1000;
const PREFIX = 'summer-bottleneck';

const exactSha = z.string().regex(SHA);
const timestamp = z.string().datetime({ offset: true });
const sourceFields = {
  observedAt: timestamp,
  sourceRevision: exactSha,
};

export const summerCiImprovementClassIds = [
  'merge-group-flake-baseline-ratchet',
  'controller-cascade-coalescing',
  'auto-enroll-self-cancel-churn',
  'controller-check-run-pagination-cap',
  'obsolete-unaffected-native-lanes',
  'affected-only-unit-selection',
] as const;

const ciClassId = z.enum(summerCiImprovementClassIds);
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
    sourceVersion: exactSha,
    signals: z
      .object({
        closure: z
          .object({
            schema: z.literal('jovie-closure-health/v1'),
            ...sourceFields,
            status: z.enum(['healthy', 'grace', 'red']),
            blockedSince: timestamp.nullable(),
            openPullRequests: z.number().int().nonnegative(),
          })
          .strict(),
        queue: z
          .object({
            schema: z.literal('github-merge-queue-entry/v1'),
            ...sourceFields,
            blockedSince: timestamp.nullable(),
            eligibleCleanPrs: z.number().int().nonnegative(),
            queuedPrs: z.number().int().nonnegative(),
          })
          .strict(),
        release: z
          .object({
            schema: z.literal('jovie-controller-snapshot/v1'),
            ...sourceFields,
            blockedSince: timestamp.nullable(),
            mainSha: exactSha,
            productionSha: exactSha.nullable(),
            unverifiedMerges: z.number().int().nonnegative(),
          })
          .strict(),
        runner: z
          .object({
            schema: z.literal('symphony-lease-guard-report/v1'),
            ...sourceFields,
            blockedSince: timestamp.nullable(),
            capacityAvailable: z.number().int().nonnegative(),
            queuedWork: z.number().int().nonnegative(),
          })
          .strict(),
        ciAudit: ciAuditSchema,
      })
      .strict(),
  })
  .strict();

export type SummerBottleneckSnapshot = z.infer<
  typeof summerBottleneckSnapshotSchema
>;
export type SummerBottleneckRecord = Readonly<Record<string, unknown>>;

export type SummerBottleneckStore = {
  create(
    pathname: string,
    record: SummerBottleneckRecord
  ): Promise<'created' | 'exists'>;
  read(pathname: string): Promise<SummerBottleneckRecord | null>;
  list(prefix: string): Promise<
    readonly {
      readonly pathname: string;
      readonly record: SummerBottleneckRecord;
    }[]
  >;
};

export type SymphonyRepairTask = {
  readonly schema: 'jovie-symphony-repair-task/v1';
  readonly taskKey: string;
  readonly createdAt: string;
  readonly owner: 'symphony';
  readonly route: 'symphony';
  readonly action: 'reconcile-release-certification-starvation';
  readonly issue: 'JOV-5853';
  readonly safety: 'exact-source-ci-native-queue-production-gates-remain-required';
  readonly source: {
    readonly sourceVersion: string;
    readonly snapshotDigest: string;
  };
};

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
  readonly receiptSigningKey: string;
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

function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function eventKey(eventId: string): string {
  return digest({ eventId });
}

function paths(snapshot: SummerBottleneckSnapshot, fingerprint?: string) {
  const key = eventKey(snapshot.eventId);
  return {
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
    snapshot.signals.ciAudit.observedAt,
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
  const candidates = [
    closure.status === 'red' && closure.openPullRequests > 0
      ? candidate(
          'closure-health-red',
          closure.blockedSince,
          closure.openPullRequests * 80,
          closure.sourceRevision,
          nowMs
        )
      : null,
    queue.eligibleCleanPrs > 0 && queue.queuedPrs === 0
      ? candidate(
          'native-queue-starvation',
          queue.blockedSince,
          queue.eligibleCleanPrs * 60,
          queue.sourceRevision,
          nowMs
        )
      : null,
    release.unverifiedMerges > 0 && release.mainSha !== release.productionSha
      ? candidate(
          'release-certification-starvation',
          release.blockedSince,
          release.unverifiedMerges * 100,
          release.sourceRevision,
          nowMs,
          true,
          'Summer',
          'symphony'
        )
      : null,
    ...ciAudit.classes.map(item =>
      item.state === 'implemented'
        ? null
        : candidate(
            item.id,
            item.blockedSince,
            item.impact,
            ciAudit.sourceRevision,
            nowMs,
            false,
            item.owner,
            item.handle
          )
    ),
    runner.capacityAvailable === 0 && runner.queuedWork > 0
      ? candidate(
          'runner-capacity-starvation',
          runner.blockedSince,
          runner.queuedWork * 40,
          runner.sourceRevision,
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
            : snapshot.signals.ciAudit.classes.find(
                item => item.id === selected.id
              );
  return digest({
    bottleneck: selected.id,
    blockedSince: selected.blockedSince,
    signal,
    sourceVersion: snapshot.sourceVersion,
  });
}

function signedReceipt(
  receipt: SummerBottleneckRecord,
  signingKey: string
): SummerBottleneckRecord {
  if (!signingKey) throw new Error('receipt signing key is unavailable');
  const { signature: _existingSignature, ...unsigned } = receipt;
  const signature = createHmac('sha256', signingKey)
    .update(`jovie.eve.summer-bottleneck-receipt/v1\0${canonical(unsigned)}`)
    .digest('hex');
  return { ...unsigned, signature: `v1=${signature}` };
}

export function verifySummerBottleneckReceipt(
  input: SummerBottleneckRecord,
  signingKey: string
): boolean {
  if (!signingKey) return false;
  const signature = input.signature;
  if (typeof signature !== 'string' || !/^v1=[0-9a-f]{64}$/u.test(signature))
    return false;
  const { signature: _removed, ...unsigned } = input;
  const expected = signedReceipt(unsigned, signingKey).signature;
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
  const signed = signedReceipt(receipt, dependencies.receiptSigningKey);
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
  validateFreshness(snapshot, now);
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
  const recordPaths = paths(snapshot, fingerprint);
  const completed = await dependencies.store.read(recordPaths.outcome!);
  if (completed) {
    if (
      completed.fingerprint !== fingerprint ||
      !verifySummerBottleneckReceipt(completed, dependencies.receiptSigningKey)
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

  const claim = signedReceipt(
    {
      ...baseReceipt(snapshot, dependencies, selected, fingerprint, ranking),
      schema: 'jovie.eve.summer-bottleneck-claim/v1',
      decision: selected.inEnvelope ? 'claimed' : 'held',
      terminal: !selected.inEnvelope,
    },
    dependencies.receiptSigningKey
  );
  const claimWrite = await dependencies.store.create(recordPaths.claim!, claim);
  if (claimWrite === 'exists') {
    const existingClaim = await dependencies.store.read(recordPaths.claim!);
    if (
      !existingClaim ||
      existingClaim.fingerprint !== fingerprint ||
      !verifySummerBottleneckReceipt(
        existingClaim,
        dependencies.receiptSigningKey
      )
    ) {
      throw new Error('bottleneck claim conflict');
    }
  }

  if (!selected.inEnvelope) {
    const outcome = signedReceipt(
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
      dependencies.receiptSigningKey
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
    action: 'reconcile-release-certification-starvation',
    issue: 'JOV-5853',
    safety: 'exact-source-ci-native-queue-production-gates-remain-required',
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
    const proposed = signedReceipt(
      {
        ...baseReceipt(snapshot, dependencies, selected, fingerprint, ranking),
        schema: 'jovie.eve.summer-bottleneck-dispatch/v1',
        decision: 'dispatched',
        task,
        symphony: { handle: dispatched.handle },
        terminal: false,
      },
      dependencies.receiptSigningKey
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
    dispatchReceipt?.fingerprint !== fingerprint ||
    !verifySummerBottleneckReceipt(
      dispatchReceipt,
      dependencies.receiptSigningKey
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
    return signedReceipt(
      {
        ...baseReceipt(snapshot, dependencies, selected, fingerprint, ranking),
        decision: 'pending-observation',
        symphony: { handle },
        terminal: false,
      },
      dependencies.receiptSigningKey
    );
  }
  if (observed.status === 'pending') {
    return signedReceipt(
      {
        ...baseReceipt(snapshot, dependencies, selected, fingerprint, ranking),
        decision: 'pending-symphony',
        symphony: { handle },
        terminal: false,
      },
      dependencies.receiptSigningKey
    );
  }

  const outcome = signedReceipt(
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
    dependencies.receiptSigningKey
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
  validateFreshness(snapshot, dependencies.now());
  const eventReceipt = signedReceipt(
    {
      schema: 'jovie.eve.summer-bottleneck-event/v1',
      eventId: snapshot.eventId,
      snapshot,
      sourceVersion: snapshot.sourceVersion,
      snapshotDigest: digest(snapshot),
    },
    dependencies.receiptSigningKey
  );
  const eventPath = paths(snapshot).event;
  if ((await dependencies.store.create(eventPath, eventReceipt)) === 'exists') {
    const existing = await dependencies.store.read(eventPath);
    if (!existing || digest(existing) !== digest(eventReceipt)) {
      throw new Error('bottleneck event conflict');
    }
    return signedReceipt(
      {
        schema: 'jovie.eve.summer-bottleneck-receipt/v1',
        eventId: snapshot.eventId,
        decision: 'duplicate-replay-rejected',
        owner: 'Summer',
        handle: 'summer',
        terminal: true,
      },
      dependencies.receiptSigningKey
    );
  }
  return processStoredSnapshot(snapshot, dependencies);
}

export async function reconcileMissedSummerBottleneckEvents(
  dependencies: SummerBottleneckDependencies
): Promise<readonly SummerBottleneckRecord[]> {
  const events = await dependencies.store.list(`${PREFIX}/events/`);
  const reconciled: SummerBottleneckRecord[] = [];
  for (const entry of [...events]
    .sort((left, right) => left.pathname.localeCompare(right.pathname))
    .slice(0, 25)) {
    const eventReceipt = entry.record;
    if (
      !verifySummerBottleneckReceipt(
        eventReceipt,
        dependencies.receiptSigningKey
      )
    ) {
      continue;
    }
    const parsed = summerBottleneckSnapshotSchema.safeParse(
      eventReceipt.snapshot
    );
    if (!parsed.success) continue;
    if (entry.pathname !== paths(parsed.data).event) continue;
    if (await dependencies.store.read(paths(parsed.data).terminal)) continue;
    reconciled.push(await processStoredSnapshot(parsed.data, dependencies));
  }
  return reconciled;
}
