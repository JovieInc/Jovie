import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard (security triage 2026-10-25, codex t1 O2): a skipped Stripe handler
 * result is acknowledged and marked processed, so it is never replayed. A paid
 * invoice with no attributable user used to be skipped and was lost for good.
 * Money that arrived and cannot be applied must raise
 * StripeReconciliationRequiredError instead (durable needs_reconciliation row,
 * replayable, alerted). New skip reasons need review here.
 */
const HANDLER_DIR = join(process.cwd(), 'lib', 'stripe', 'webhooks');

const REVIEWED_SKIP_REASONS = new Set([
  "'unhandled_event_type'",
  "'partial_refund'",
  "'dispute_has_no_charge'",
  "'charge_has_no_invoice'",
  "'invoice_has_no_subscription'",
  "'historical_invoice_refund'",
  // Money going out (refund/dispute) with no user: nothing to grant or revoke.
  "'cannot_identify_user_for_charge_reversal'",
  "'checkout_session_has_no_subscription'",
  // Payment failed: no money arrived, nothing to grant.
  "'cannot_identify_user_for_payment_failure'",
  "'subscription_not_in_failure_status'",
  // Pass-through of an inner result whose own reasons are reviewed.
  'result.reason',
  '`subscription_created_with_status_${subscription.status',
]);

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith('.ts') && !entry.name.includes('.test.')
      ? [path]
      : [];
  });
}

describe('Stripe handler skip reasons', () => {
  const reasons = sources(HANDLER_DIR).flatMap(file =>
    [
      ...readFileSync(file, 'utf8').matchAll(
        /skipped:\s*true,\s*reason:\s*([^,\n}]+)/g
      ),
    ].map(match => match[1].trim())
  );

  it('finds the handlers', () => {
    expect(reasons.length).toBeGreaterThan(5);
  });

  it('only uses reviewed skip reasons', () => {
    expect(
      reasons.filter(reason => !REVIEWED_SKIP_REASONS.has(reason))
    ).toEqual([]);
  });

  it('never skips a successful payment', () => {
    expect(
      reasons.filter(reason => /payment_success|paid/.test(reason))
    ).toEqual([]);
  });
});
