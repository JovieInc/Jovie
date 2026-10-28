/**
 * Billing health signal for the closed-loop contract
 * (scripts/loops/billing-health.mjs).
 *
 * Computed only from stored Stripe webhook events (stripe_webhook_events); no
 * Stripe API call. Returns counts and rates per invoice, never customer or
 * invoice identifiers. Complements, and does not duplicate,
 * billing-sync-remediation (reconciliation heartbeat and stuck webhooks).
 */
import { and, sql as drizzleSql, gte, inArray } from 'drizzle-orm';
import { stripeWebhookEvents } from '@/lib/db/schema/billing';
import { withSystemIngestionSession } from '@/lib/ingestion/session';

export const BILLING_WINDOW_DAYS = 30;
/** Dunning retries are expected within this window; older failures are "matured". */
export const RECOVERY_WINDOW_DAYS = 7;
/** A scheduled retry this far in the past with no later event means dunning stalled. */
export const STALLED_RETRY_GRACE_HOURS = 48;
const ROW_LIMIT = 5000;

export interface InvoiceEventRow {
  type: string;
  invoiceId: string | null;
  at: Date;
  nextPaymentAttempt: Date | null;
}

export interface BillingHealthMetrics {
  windowDays: number;
  invoiceAttempts30d: number;
  failedInvoices30d: number;
  failureRatePct: number | null;
  maturedFailed: number;
  recoveredOfMatured: number;
  recoveryRatePct: number | null;
  dunningStalledInvoices: number;
  truncated: boolean;
}

const pct = (n: number, d: number) =>
  d > 0 ? Math.round((n / d) * 100000) / 1000 : null;

/**
 * Pure: one invoice is "failed" if any payment_failed event exists, "paid" if
 * a payment_succeeded event exists. Recovery counts only failures whose first
 * failure is older than the recovery window, so a fresh failure still in
 * dunning is never scored as unrecovered.
 */
export function computeBillingHealth(
  rows: InvoiceEventRow[],
  now: Date,
  truncated = false
): BillingHealthMetrics {
  const invoices = new Map<
    string,
    {
      firstFailed: Date | null;
      lastFailed: Date | null;
      nextAttempt: Date | null;
      paidAt: Date | null;
    }
  >();
  for (const row of rows) {
    if (!row.invoiceId) continue;
    const entry = invoices.get(row.invoiceId) ?? {
      firstFailed: null,
      lastFailed: null,
      nextAttempt: null,
      paidAt: null,
    };
    if (row.type === 'invoice.payment_failed') {
      if (!entry.firstFailed || row.at < entry.firstFailed)
        entry.firstFailed = row.at;
      if (!entry.lastFailed || row.at > entry.lastFailed) {
        entry.lastFailed = row.at;
        entry.nextAttempt = row.nextPaymentAttempt;
      }
    } else if (row.type === 'invoice.payment_succeeded') {
      if (!entry.paidAt || row.at > entry.paidAt) entry.paidAt = row.at;
    }
    invoices.set(row.invoiceId, entry);
  }
  const maturedBefore = now.getTime() - RECOVERY_WINDOW_DAYS * 86_400_000;
  const stalledBefore = now.getTime() - STALLED_RETRY_GRACE_HOURS * 3_600_000;
  let failed = 0;
  let matured = 0;
  let recovered = 0;
  let stalled = 0;
  for (const entry of invoices.values()) {
    if (!entry.firstFailed) continue;
    failed += 1;
    const paidAfterFailure =
      entry.paidAt !== null && entry.paidAt >= entry.firstFailed;
    if (entry.firstFailed.getTime() <= maturedBefore) {
      matured += 1;
      if (paidAfterFailure) recovered += 1;
    }
    if (
      !paidAfterFailure &&
      entry.nextAttempt !== null &&
      entry.nextAttempt.getTime() <= stalledBefore &&
      (entry.lastFailed?.getTime() ?? 0) < entry.nextAttempt.getTime()
    ) {
      stalled += 1;
    }
  }
  return {
    windowDays: BILLING_WINDOW_DAYS,
    invoiceAttempts30d: invoices.size,
    failedInvoices30d: failed,
    failureRatePct: pct(failed, invoices.size),
    maturedFailed: matured,
    recoveredOfMatured: recovered,
    recoveryRatePct: pct(recovered, matured),
    dunningStalledInvoices: stalled,
    truncated,
  };
}

const asDate = (value: unknown): Date | null => {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000)
    : null;
};

export async function loadBillingHealthMetrics(
  now = new Date()
): Promise<BillingHealthMetrics> {
  const since = new Date(now.getTime() - BILLING_WINDOW_DAYS * 86_400_000);
  const events = await withSystemIngestionSession(tx =>
    tx
      .select({
        type: stripeWebhookEvents.type,
        invoiceId: drizzleSql<
          string | null
        >`${stripeWebhookEvents.payload}->'data'->'object'->>'id'`,
        nextAttempt: drizzleSql<
          string | null
        >`${stripeWebhookEvents.payload}->'data'->'object'->>'next_payment_attempt'`,
        at: drizzleSql<Date>`coalesce(${stripeWebhookEvents.stripeCreatedAt}, ${stripeWebhookEvents.createdAt})`,
      })
      .from(stripeWebhookEvents)
      .where(
        and(
          inArray(stripeWebhookEvents.type, [
            'invoice.payment_failed',
            'invoice.payment_succeeded',
          ]),
          gte(stripeWebhookEvents.createdAt, since)
        )
      )
      .limit(ROW_LIMIT + 1)
  );
  const truncated = events.length > ROW_LIMIT;
  return computeBillingHealth(
    events.slice(0, ROW_LIMIT).map(event => ({
      type: event.type,
      invoiceId: event.invoiceId,
      at: new Date(event.at),
      nextPaymentAttempt: asDate(event.nextAttempt),
    })),
    now,
    truncated
  );
}
