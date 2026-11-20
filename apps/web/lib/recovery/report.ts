import type { RecoveryRecord } from './ledger';

export interface RecoveryReport {
  readonly sent: number;
  readonly opened: number;
  readonly clicked: number;
  readonly returned: number;
  readonly completedStep: number;
  readonly claimed: number;
  readonly paid: number;
  readonly clickToCompleteMsP50: number | null;
  readonly clickToCompleteMsP95: number | null;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}

/** sent -> opened/clicked -> returned -> completed step -> claimed -> paid. */
export function buildRecoveryReport(
  records: readonly RecoveryRecord[]
): RecoveryReport {
  const count = (field: keyof RecoveryRecord) =>
    records.filter(record => record[field] !== null).length;
  const gaps = records.flatMap(record =>
    record.clickedAt && record.completedStepAt
      ? [Date.parse(record.completedStepAt) - Date.parse(record.clickedAt)]
      : []
  );
  return {
    sent: count('sentAt'),
    opened: count('openedAt'),
    clicked: count('clickedAt'),
    returned: count('returnedAt'),
    completedStep: count('completedStepAt'),
    claimed: count('claimedAt'),
    paid: count('paidAt'),
    clickToCompleteMsP50: percentile(gaps, 0.5),
    clickToCompleteMsP95: percentile(gaps, 0.95),
  };
}
