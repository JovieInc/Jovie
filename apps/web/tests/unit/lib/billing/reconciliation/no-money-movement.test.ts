import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../../../../..');
const SOURCES = [
  'app/api/cron/billing-reconciliation/route.ts',
  'lib/billing/reconciliation/batch-processor.ts',
  'lib/billing/reconciliation/status-mismatch-fixer.ts',
  'lib/billing/reconciliation/orphaned-subscription-handler.ts',
  'lib/billing/reconciliation/subscription-error-classifier.ts',
  'lib/billing/webhook-replay.ts',
];
describe('billing reconciliation money movement', () => {
  it('does not charge, refund, or cancel from reconciliation or replay', () => {
    const money =
      /subscriptions\.cancel|refunds\.create|paymentIntents\.create|charges\.create|invoices\.pay/;
    for (const relativePath of SOURCES) {
      const source = readFileSync(resolve(ROOT, relativePath), 'utf8');
      expect(source, relativePath).not.toMatch(money);
    }
  });
});
