import { z } from 'zod';
import {
  CERTIFICATION_PERSISTENCE_TTL_SECONDS,
  type CertificationRecordBackend,
  mutateCertificationRecord,
} from '@/lib/agent-os/certification-cas';
import {
  type DemandAllocationCommand,
  type DemandMetrics,
  demandAllocationCommandSchema,
  demandAllocationPlanSchema,
  demandMetricsSchema,
} from './allocation-contract';
import { judgeCluster } from './demand-judge';
import {
  buildDemandMap,
  normalizeDemandSignal,
  normalizeRequestText,
} from './demand-map';
import { applyOutcomeDrafts } from './outcome-allocation';
import type { DemandCluster, DemandOutcomeVerdict } from './types';

export const DEMAND_ALLOCATION_KEY = 'jovie:demand:allocation:v1';
const timestamp = z.string().datetime({ offset: true });
const stateSchema = z.enum([
  'escalated',
  'executed',
  'executing',
  'held',
  'ready',
]);
const decisionSchema = z
  .object({
    at: timestamp,
    state: stateSchema,
    reason: z.string(),
    score: z.number().finite(),
    outcomePenalty: z.number().min(0).max(1),
    disposition: z.string(),
    recommendation: z.string(),
    countercase: z.string(),
    gate: z
      .object({
        status: z.enum(['green', 'red', 'unknown']),
        evaluatedAt: z.string(),
        ref: z.string(),
      })
      .strict(),
  })
  .strict();
const executionSchema = z
  .object({
    worker: z.string(),
    startedAt: timestamp,
    effortDueAt: timestamp,
    reviewDueAt: timestamp,
    completedAt: timestamp.nullable(),
    ref: z.string().nullable(),
    /** Allocation never confers production promotion authority. */
    productionAuthorized: z.literal(false),
  })
  .strict();
const reviewSchema = z
  .object({
    id: z.string(),
    supersedes: z.string().nullable(),
    recordedAt: timestamp,
    windowStartedAt: timestamp,
    windowEndedAt: timestamp,
    evidenceRefs: z.array(z.string()).min(1),
    metrics: demandMetricsSchema,
    verdict: z.enum(['inconclusive', 'missed', 'validated']),
    differences: z.array(
      z
        .object({
          metric: z.string(),
          predicted: z.number(),
          actual: z.number().nullable(),
          delta: z.number().nullable(),
          met: z.boolean().nullable(),
        })
        .strict()
    ),
  })
  .strict();
const rowSchema = z
  .object({
    plan: demandAllocationPlanSchema,
    decisions: z.array(decisionSchema).min(1),
    execution: executionSchema.nullable(),
    reviews: z.array(reviewSchema),
  })
  .strict();
const ledgerSchema = z
  .object({
    contract: z.literal('jovie.demand-allocation/v1'),
    rows: z.array(rowSchema).max(200),
  })
  .strict();
export type DemandAllocationLedger = z.infer<typeof ledgerSchema>;
type Row = z.infer<typeof rowSchema>;

export interface DemandAllocationGate {
  readonly status: 'green' | 'red' | 'unknown';
  readonly evaluatedAt: string;
  readonly ref: string;
}
export class DemandAllocationError extends Error {}

function fail(reason: string): never {
  throw new DemandAllocationError(reason);
}
function clusterFor(row: Pick<Row, 'plan'>): DemandCluster {
  const clusters = buildDemandMap(
    row.plan.observations.map(normalizeDemandSignal)
  );
  if (clusters.length !== 1) fail('one-cluster-per-allocation');
  return {
    ...clusters[0],
    requiresHumanGate: row.plan.observations.some(
      item => item.requiresHumanGate
    ),
    icpAdjacent: row.plan.observations.every(item => item.icpAdjacent === true),
  };
}
function sameProfile(a: Row, b: Row): boolean {
  const first = a.plan.observations[0];
  const second = b.plan.observations[0];
  return (
    normalizeRequestText(first.capability) ===
      normalizeRequestText(second.capability) &&
    normalizeRequestText(first.job) === normalizeRequestText(second.job) &&
    a.plan.observations.every(item => item.icpAdjacent === true) ===
      b.plan.observations.every(item => item.icpAdjacent === true)
  );
}
function penaltyFor(row: Row, rows: readonly Row[]): number {
  const misses = rows.filter(
    other =>
      sameProfile(row, other) && other.reviews.at(-1)?.verdict === 'missed'
  ).length;
  return Math.min(misses / 3, 1);
}
function isRepair(row: Row): boolean {
  return ['certification', 'repair', 'unblocking'].includes(row.plan.kind);
}
function decisionFor(
  row: Row,
  rows: readonly Row[],
  gate: DemandAllocationGate,
  now: Date
): z.infer<typeof decisionSchema> {
  const cluster = clusterFor(row);
  const outcomePenalty = penaltyFor(row, rows);
  // The governor owns domain admission. Rejudge the original evidence so a
  // previous RED disposition cap cannot strand a now-GREEN recommendation.
  const judgment = judgeCluster(cluster, {
    ...row.plan.context,
    outcomePenalty,
  });
  let state: z.infer<typeof stateSchema> = 'ready';
  let reason = 'authorized-bounded-work';
  const hold = (why: string) => {
    state = 'held';
    reason = why;
  };
  const gateAge = now.getTime() - Date.parse(gate.evaluatedAt);
  if (row.plan.capabilityDraft) {
    state = 'held';
    reason = `capability-draft-disabled:${row.plan.capabilityDraft.decision.kind}`;
  } else if (
    cluster.requiresHumanGate ||
    ['outbound', 'spend'].includes(row.plan.kind) ||
    judgment.disposition === 'human-escalation' ||
    !row.plan.authorization.lowRisk
  ) {
    state = 'escalated';
    reason = 'human-authority-required';
  } else if (Date.parse(row.plan.authorization.validUntil) <= now.getTime()) {
    hold('authorization-expired');
  } else if (
    !isRepair(row) &&
    (gate.status !== 'green' ||
      !Number.isFinite(gateAge) ||
      gateAge < 0 ||
      gateAge > 300_000)
  ) {
    hold(`cone-repair-first:${gate.ref}`);
  } else if (
    !cluster.icpAdjacent &&
    !isRepair(row) &&
    (!row.plan.icpTestEvidence ||
      Date.parse(row.plan.icpTestEvidence.observedAt) > now.getTime() ||
      row.plan.icpTestEvidence.independentCustomers > cluster.customerSources)
  ) {
    hold('musician-icp-until-measured-test-evidence');
  } else if (
    !isRepair(row) &&
    rows.some(
      other =>
        other.execution?.completedAt &&
        (!other.reviews.length ||
          other.reviews.at(-1)?.verdict === 'inconclusive')
    )
  ) {
    hold('outcome-review-pending');
  } else if (
    rows.some(
      other => other !== row && other.execution && !other.execution.completedAt
    )
  ) {
    hold('execution-capacity-full');
  } else if (
    !isRepair(row) &&
    !(
      ['build-when-capacity', 'urgent-candidate'].includes(
        judgment.disposition
      ) ||
      (row.plan.kind === 'research' && judgment.disposition === 'investigate')
    )
  ) {
    hold('disposition-does-not-permit-execution');
  }
  return {
    at: now.toISOString(),
    state,
    reason,
    score: judgment.judgedScore,
    outcomePenalty,
    disposition: judgment.disposition,
    recommendation: judgment.recommendation.action,
    countercase: judgment.countercase,
    gate,
  };
}
function reconcile(
  ledger: DemandAllocationLedger,
  gate: DemandAllocationGate,
  now: Date
): void {
  for (const row of ledger.rows) {
    if (row.execution) continue;
    const next = decisionFor(row, ledger.rows, gate, now);
    const previous = row.decisions.at(-1);
    if (
      !previous ||
      ['state', 'reason', 'score', 'outcomePenalty', 'disposition'].some(
        key =>
          previous[key as keyof typeof previous] !==
          next[key as keyof typeof next]
      )
    )
      row.decisions.push(next);
  }
}
function backtest(prediction: DemandMetrics, actual: DemandMetrics) {
  const differences = (Object.keys(prediction) as (keyof DemandMetrics)[]).map(
    metric => {
      const predicted = prediction[metric] as number;
      const observed = actual[metric] ?? null;
      const ceiling = metric === 'costCents' || metric === 'maintenanceMinutes';
      return {
        metric,
        predicted,
        actual: observed,
        delta: observed === null ? null : observed - predicted,
        met:
          observed === null
            ? null
            : ceiling
              ? observed <= predicted
              : observed >= predicted,
      };
    }
  );
  // Missing target evidence cannot contaminate calibration as a zero/miss.
  const verdict: DemandOutcomeVerdict = differences.some(
    item => item.met === null
  )
    ? 'inconclusive'
    : differences.every(item => item.met)
      ? 'validated'
      : 'missed';
  return { differences, verdict };
}
function parseLedger(raw: unknown): DemandAllocationLedger {
  return ledgerSchema.parse(typeof raw === 'string' ? JSON.parse(raw) : raw);
}

/** Pure CAS transition: work claims and receipts commit before success is returned. */
function apply(
  ledger: DemandAllocationLedger,
  command: DemandAllocationCommand,
  gate: DemandAllocationGate,
  now: Date
): void {
  if (command.op === 'compile_outcome')
    applyOutcomeDrafts(ledger, command, now);
  if (command.op === 'submit') {
    const existing = ledger.rows.find(row => row.plan.id === command.plan.id);
    if (existing) {
      if (JSON.stringify(existing.plan) !== JSON.stringify(command.plan))
        fail('allocation-id-conflict');
    } else {
      if (
        command.plan.observations.some(
          item => Date.parse(item.observedAt) > now.getTime()
        )
      )
        fail('future-demand-evidence');
      const row: Row = {
        plan: command.plan,
        decisions: [],
        execution: null,
        reviews: [],
      };
      row.decisions.push(decisionFor(row, ledger.rows, gate, now));
      ledger.rows.push(row);
    }
  }
  reconcile(ledger, gate, now);
  if (
    command.op === 'submit' ||
    command.op === 'reconcile' ||
    command.op === 'compile_outcome'
  )
    return;
  const row = ledger.rows.find(item => item.plan.id === command.id);
  if (!row) fail('allocation-not-found');
  if (command.op === 'claim') {
    if (row.execution) {
      if (row.execution.worker !== command.worker) fail('already-claimed');
      return;
    }
    if (row.decisions.at(-1)?.state !== 'ready') fail('allocation-not-ready');
    row.execution = {
      worker: command.worker,
      startedAt: now.toISOString(),
      effortDueAt: new Date(
        Math.min(
          now.getTime() + row.plan.authorization.effortMinutes * 60_000,
          Date.parse(row.plan.authorization.validUntil)
        )
      ).toISOString(),
      reviewDueAt: new Date(
        now.getTime() + row.plan.prediction.reviewAfterHours * 3_600_000
      ).toISOString(),
      completedAt: null,
      ref: null,
      productionAuthorized: false,
    };
    row.decisions.push({
      ...row.decisions.at(-1)!,
      at: now.toISOString(),
      state: 'executing',
      reason: 'execution-claimed',
    });
  } else if (command.op === 'complete') {
    if (!row.execution || row.execution.worker !== command.worker)
      fail('execution-owner-mismatch');
    if (row.execution.ref) {
      if (row.execution.ref !== command.executionRef)
        fail('execution-receipt-conflict');
      return;
    }
    row.execution.completedAt = now.toISOString();
    row.execution.ref = command.executionRef;
    row.execution.reviewDueAt = new Date(
      now.getTime() + row.plan.prediction.reviewAfterHours * 3_600_000
    ).toISOString();
    row.decisions.push({
      ...row.decisions.at(-1)!,
      at: now.toISOString(),
      state: 'executed',
      reason: 'awaiting-outcome-review',
    });
  } else {
    const execution = row.execution;
    if (!execution?.completedAt) fail('outcome-before-execution');
    const existing = row.reviews.find(
      review => review.id === command.receiptId
    );
    const receipt = reviewSchema.parse({
      id: command.receiptId,
      supersedes: command.supersedes,
      recordedAt: existing?.recordedAt ?? now.toISOString(),
      windowStartedAt: command.windowStartedAt,
      windowEndedAt: command.windowEndedAt,
      evidenceRefs: command.evidenceRefs,
      metrics: command.metrics,
      ...backtest(row.plan.prediction.metrics, command.metrics),
    });
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(receipt))
        fail('outcome-receipt-conflict');
      return;
    }
    if (command.supersedes !== (row.reviews.at(-1)?.id ?? null))
      fail('outcome-revision-conflict');
    if (
      command.windowStartedAt !== execution.completedAt ||
      Date.parse(command.windowEndedAt) < Date.parse(execution.reviewDueAt) ||
      Date.parse(command.windowEndedAt) > now.getTime()
    )
      fail('outcome-window-not-mature');
    row.reviews.push(receipt);
  }
  reconcile(ledger, gate, now);
}

/** Event driven; the caller reads/reconciles after evidence changes, with no new cron. */
export async function governDemandAllocation(input: {
  readonly backend: CertificationRecordBackend;
  readonly command: unknown;
  readonly gate: DemandAllocationGate;
  readonly now: Date;
}): Promise<DemandAllocationLedger> {
  const command = demandAllocationCommandSchema.parse(input.command);
  if (!Number.isFinite(input.now.getTime())) fail('invalid-clock');
  const empty: DemandAllocationLedger = {
    contract: 'jovie.demand-allocation/v1',
    rows: [],
  };
  return mutateCertificationRecord({
    backend: input.backend,
    key: DEMAND_ALLOCATION_KEY,
    initialize: () =>
      input.backend.setIfAbsent(
        DEMAND_ALLOCATION_KEY,
        JSON.stringify(empty),
        CERTIFICATION_PERSISTENCE_TTL_SECONDS
      ),
    parse: parseLedger,
    validate: value => {
      ledgerSchema.parse(value);
    },
    error: message => new DemandAllocationError(message),
    update: current => {
      const ledger = structuredClone(current);
      apply(ledger, command, input.gate, input.now);
      return {
        ledger:
          JSON.stringify(ledger) === JSON.stringify(current) ? current : ledger,
        result: ledger,
      };
    },
  });
}
