import { createHash } from 'node:crypto';
import { assertFinancialOwnerId } from '../owner';
import type {
  MetricEngineInput,
  MetricId,
  MetricResult,
  MetricWindow,
} from './contracts';
import { computeMetrics } from './engine';

/**
 * Immutable daily metric snapshots (JOV-4616).
 *
 * A snapshot captures the full engine output for one owner and one UTC date
 * so historical charts reproduce past dashboard values exactly, even after
 * later syncs reclassify or append transactions. Recomputation is
 * deterministic and idempotent: `snapshotFingerprint` is a stable digest of
 * the engine inputs, so a re-run over unchanged inputs yields the same
 * fingerprint and persistence layers can upsert-or-skip; when inputs DO
 * change (classification edits, splits, inclusion, budgets), the new
 * fingerprint plus `correctsFingerprint` preserve correction provenance.
 */

export interface MetricSnapshot {
  readonly ownerUserId: string;
  /** UTC calendar date the metrics describe (YYYY-MM-DD). */
  readonly asOfDate: string;
  readonly window: MetricWindow;
  readonly fingerprint: string;
  /** Fingerprint of the snapshot this one corrects, when recomputed. */
  readonly correctsFingerprint: string | null;
  readonly metrics: Readonly<Record<MetricId, MetricResult>>;
  readonly createdAt: string;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(
        k =>
          `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`
      )
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(parts: readonly unknown[]): string {
  return createHash('sha256')
    .update(parts.map(stableStringify).join('|'))
    .digest('hex');
}

/**
 * Stable fingerprint of everything that determines a snapshot's values:
 * window, included accounts (id, inclusion, balance, balance timestamp),
 * classified transactions (id, account, timestamp, amount, class, pending,
 * rule, correction link), budgets, history start, sync freshness, and the
 * as-of instant. Any change → different fingerprint → recompute required.
 */
export function snapshotFingerprint(input: MetricEngineInput): string {
  const txs = [...input.transactions]
    .map(tx => ({
      id: tx.id,
      accountId: tx.accountId,
      occurredAt: tx.occurredAt,
      amountCents: tx.amountCents,
      classification: tx.classification,
      pending: tx.pending ?? false,
      ruleId: tx.ruleId ?? null,
      correctedTransactionId: tx.correctedTransactionId ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const accounts = [...input.accounts]
    .map(a => ({
      id: a.id,
      include: a.include,
      availableBalanceCents: a.availableBalanceCents,
      currentBalanceCents: a.currentBalanceCents,
      balanceUpdatedAt: a.balanceUpdatedAt ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return digest([
    'finance-metric-snapshot:v1',
    input.ownerUserId,
    input.asOf,
    input.window,
    accounts,
    txs,
    input.budgets ?? null,
    input.historyStartAt ?? null,
    input.lastSyncAt ?? null,
    input.staleAfterHours ?? null,
  ]);
}

/**
 * Compute metrics and wrap them in a snapshot record. `createdAt` is the
 * caller's clock instant; the values themselves depend only on `input`.
 */
export function buildMetricSnapshot(
  input: MetricEngineInput,
  options?: { correctsFingerprint?: string; createdAt?: string }
): MetricSnapshot {
  const owner = assertFinancialOwnerId(input.ownerUserId);
  const asOf = new Date(input.asOf);
  if (Number.isNaN(asOf.getTime())) {
    throw new TypeError('MetricEngineInput.asOf must be a valid timestamp');
  }
  return {
    ownerUserId: owner,
    asOfDate: asOf.toISOString().slice(0, 10),
    window: input.window,
    fingerprint: snapshotFingerprint(input),
    correctsFingerprint: options?.correctsFingerprint ?? null,
    metrics: computeMetrics(input),
    createdAt: options?.createdAt ?? asOf.toISOString(),
  };
}

/**
 * Recompute the snapshot for a date after a ledger/rules/budget change.
 * Pure: identical inputs reproduce the historical values byte-for-byte,
 * while changed inputs produce a new snapshot linked to the one it
 * supersedes via `correctsFingerprint`.
 */
export function recomputeSnapshot(
  input: MetricEngineInput,
  superseded: Pick<MetricSnapshot, 'fingerprint'>,
  options?: { createdAt?: string }
): MetricSnapshot {
  return buildMetricSnapshot(input, {
    ...options,
    correctsFingerprint: superseded.fingerprint,
  });
}
