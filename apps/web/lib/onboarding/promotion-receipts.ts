import 'server-only';
import receiptsJson from '@/data/onboarding-script-promotions/receipts.json';
import {
  type PromotionGateEvidence,
  type PromotionLineChange,
  parsePromotionReceipt,
  parseRollbackReceipt,
} from './promotion-gate';

/**
 * Merged promotion/rollback receipts (JOV-7148).
 *
 * `receipts.json` only changes through a merged PR on the
 * `apps/web/data/onboarding-script-promotions/` path, which forces the
 * protected `ci-promptfoo-evals` lane at the merge queue. Entries apply in
 * file order; a `jovie-onboarding-script-rollback/v1` entry later in the
 * array reverses an earlier promotion — application is idempotent.
 */

export interface AppliedLineChange {
  readonly receiptId: string;
  /** Gate evidence carried by the promotion receipt; null for rollbacks. */
  readonly evidence: PromotionGateEvidence | null;
  readonly rollback: boolean;
  readonly change: PromotionLineChange;
}

function entries(): readonly unknown[] {
  const raw = (receiptsJson as { receipts?: unknown }).receipts;
  return Array.isArray(raw) ? raw : [];
}

export function mergedPromotionReceipts(): AppliedLineChange[] {
  const applied: AppliedLineChange[] = [];
  for (const entry of entries()) {
    const promotion = parsePromotionReceipt(entry);
    if (promotion) {
      for (const change of promotion.changes) {
        applied.push({
          receiptId: promotion.receiptId,
          evidence: promotion.evidence,
          rollback: false,
          change,
        });
      }
      continue;
    }
    const rollback = parseRollbackReceipt(entry);
    if (rollback) {
      for (const change of rollback.changes) {
        applied.push({
          receiptId: rollback.receiptId,
          evidence: null,
          rollback: true,
          change,
        });
      }
    }
  }
  return applied;
}
