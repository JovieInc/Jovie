import { describe, expect, it } from 'vitest';
import { computeBillingHealth, type InvoiceEventRow } from './billing-health';

const NOW = new Date('2026-10-25T00:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const ev = (
  type: 'failed' | 'paid',
  invoiceId: string,
  d: number,
  next: number | null = null
): InvoiceEventRow => ({
  type:
    type === 'failed' ? 'invoice.payment_failed' : 'invoice.payment_succeeded',
  invoiceId,
  at: daysAgo(d),
  nextPaymentAttempt: next === null ? null : daysAgo(next),
});

describe('computeBillingHealth', () => {
  it('reports null rates, not zero, with no invoices', () => {
    const m = computeBillingHealth([], NOW);
    expect(m.failureRatePct).toBeNull();
    expect(m.recoveryRatePct).toBeNull();
    expect(m.dunningStalledInvoices).toBe(0);
  });

  it('computes failure rate per invoice, not per event', () => {
    const m = computeBillingHealth(
      [
        ev('failed', 'a', 3),
        ev('failed', 'a', 2),
        ev('paid', 'b', 2),
        ev('paid', 'c', 1),
        ev('paid', 'd', 1),
      ],
      NOW
    );
    expect(m.invoiceAttempts30d).toBe(4);
    expect(m.failedInvoices30d).toBe(1);
    expect(m.failureRatePct).toBe(25);
  });

  it('scores recovery only for failures older than the recovery window', () => {
    const m = computeBillingHealth(
      [
        ev('failed', 'old-paid', 12),
        ev('paid', 'old-paid', 10),
        ev('failed', 'old-lost', 12),
        ev('failed', 'fresh', 2),
      ],
      NOW
    );
    expect(m.maturedFailed).toBe(2);
    expect(m.recoveredOfMatured).toBe(1);
    expect(m.recoveryRatePct).toBe(50);
  });

  it('ignores a payment that predates the failure', () => {
    const m = computeBillingHealth(
      [ev('paid', 'x', 20), ev('failed', 'x', 10)],
      NOW
    );
    expect(m.recoveredOfMatured).toBe(0);
  });

  it('flags dunning stalled when a scheduled retry passed with no later event', () => {
    const m = computeBillingHealth(
      [
        ev('failed', 'stall', 6, 4),
        ev('failed', 'retrying', 1, -2),
        ev('failed', 'recovered', 6, 4),
        ev('paid', 'recovered', 3),
      ],
      NOW
    );
    expect(m.dunningStalledInvoices).toBe(1);
  });

  it('does not flag a retry that was followed by another failure', () => {
    const m = computeBillingHealth(
      [ev('failed', 'r', 6, 4), ev('failed', 'r', 3, -3)],
      NOW
    );
    expect(m.dunningStalledInvoices).toBe(0);
  });
});
