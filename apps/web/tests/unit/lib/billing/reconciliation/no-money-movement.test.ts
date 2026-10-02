import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../../../../..');

const RECONCILIATION_SOURCES = [
  'app/api/cron/billing-reconciliation/route.ts',
  'lib/billing/reconciliation/batch-processor.ts',
  'lib/billing/reconciliation/status-mismatch-fixer.ts',
  'lib/billing/reconciliation/orphaned-subscription-handler.ts',
  'lib/billing/reconciliation/subscription-error-classifier.ts',
  'lib/billing/reconciliation/run-receipt.ts',
];

const MONEY_MOVEMENT =
  /subscriptions\.cancel|refunds\.create|paymentIntents\.create|charges\.create|invoices\.pay/;

describe('billing reconciliation money movement', () => {
  it('does not charge, refund, or cancel from the reconciliation path', () => {
    for (const relativePath of RECONCILIATION_SOURCES) {
      const source = readFileSync(resolve(ROOT, relativePath), 'utf8');
      expect(source, relativePath).not.toMatch(MONEY_MOVEMENT);
    }
  });
});
