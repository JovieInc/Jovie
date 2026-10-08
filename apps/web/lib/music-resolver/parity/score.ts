import type { Blocker, ParityRow, ParityStatus, ScoreReport } from './types';

const RESIDUAL_STATUSES = new Set<ParityStatus>([
  'access-blocked',
  'rights-blocked',
  'historical-coverage-gap',
  'vendor-only-opaque-metric',
]);

const NON_PASS_EVIDENCE = new Set([
  'unsupported',
  'empty',
  'untested',
  'skipped',
  'inaccessible',
  'rights-blocked',
]);

function filled(value: string | undefined): boolean {
  return (value ?? '').trim().length > 0;
}

export function blockerIsComplete(blocker: Blocker | undefined): boolean {
  return (
    filled(blocker?.failure) &&
    filled(blocker?.owner) &&
    filled(blocker?.reviewTrigger)
  );
}

export function leaseIsComplete(blocker: Blocker | undefined): boolean {
  const lease = blocker?.lease;
  if (!lease || !filled(lease.issue)) return false;
  if (lease.prs.length === 0 || lease.files.length === 0) return false;
  return lease.files.every(file => filled(file));
}

/** True only for a local test ref or a deployed SHA. Blocked evidence never passes. */
export function rowIsPass(row: ParityRow): boolean {
  const evidence = row.evidence;
  if (!evidence || NON_PASS_EVIDENCE.has(evidence.kind)) return false;
  if (!filled(evidence.ref)) return false;
  if (row.status === 'locally-tested') return evidence.kind === 'local-test';
  if (row.status === 'deployed-verified') return evidence.kind === 'deployed';
  return false;
}

export function rowIsAgreedResidual(row: ParityRow): boolean {
  if (rowIsPass(row) || !blockerIsComplete(row.blocker)) return false;
  if (row.status === 'missing') return leaseIsComplete(row.blocker);
  return RESIDUAL_STATUSES.has(row.status);
}

export function scoreRows(rows: readonly ParityRow[]): ScoreReport {
  const seen = new Set<string>();
  const unblockedFailures: ParityRow[] = [];
  const blocked: ParityRow[] = [];
  let passing = 0;

  for (const row of rows) {
    if (!filled(row.id) || seen.has(row.id)) {
      unblockedFailures.push(row);
      continue;
    }
    seen.add(row.id);
    if (rowIsPass(row)) {
      passing += 1;
      continue;
    }
    if (rowIsAgreedResidual(row)) {
      blocked.push(row);
      continue;
    }
    unblockedFailures.push(row);
  }

  const denominator = rows.length;
  return {
    denominator,
    passing,
    unblockedFailures,
    blocked,
    exitCode: denominator > 0 && unblockedFailures.length === 0 ? 0 : 1,
    rows,
  };
}
