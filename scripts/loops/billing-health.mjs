/**
 * Loop 5: billing health (fleet/closed-loop-gaps.md gap 2).
 *
 * Signal: invoice.payment_failed / invoice.payment_succeeded events already
 * stored in stripe_webhook_events, aggregated by the CRON_SECRET route below
 * (no Stripe API calls). Built while paying volume is ~0 so it is ready for the
 * first paying cohort: every rate has a minimum sample, so a thin sample holds
 * (neither files nor closes) instead of reading green or red.
 *
 * Thresholds: involuntary failure above 10% of invoices is well above the
 * typical card-decline baseline for subscriptions (a few percent); recovery
 * below 50% of matured failures (older than the 7-day dunning window) means
 * dunning is not winning money back; any stalled retry means a scheduled
 * Stripe retry passed with no event, i.e. a webhook or dunning-config gap.
 * Reconciliation heartbeat and stuck webhooks stay with billing-sync-remediation.
 */
const METRICS_PATH = '/api/cron/loop-health/billing-health';

export default {
  key: 'billing-health',
  title: 'Billing health breach',
  severity: 'High',
  priority: 2,
  owner: 'jovie-web',
  sourceIssue: 'none',
  source: 'loop-health-billing-health.yml / scripts/loops/billing-health.mjs',
  summary:
    'Subscription payments are failing more than expected, dunning is not recovering failed invoices, or a scheduled Stripe retry passed with no follow-up event.',
  whyItMatters:
    'Failed and unrecovered payments are silent revenue leak; with a first paying cohort every lost invoice is a lost customer. Cheapest to close before volume exists.',
  remeasure: 'node scripts/loop-health.mjs --loop billing-health --no-file',
  dwellSloMinutes: 360,
  rules: [
    {
      id: 'failed-payment-rate-30d',
      metric: 'failureRatePct',
      op: 'max',
      threshold: 10,
      unit: '%',
      sample: { metric: 'invoiceAttempts30d', min: 10 },
      description:
        'invoices with a payment_failed event over invoices attempted, trailing 30 days',
    },
    {
      id: 'dunning-recovery-rate-30d',
      metric: 'recoveryRatePct',
      op: 'min',
      threshold: 50,
      unit: '%',
      sample: { metric: 'maturedFailed', min: 5 },
      description:
        'failed invoices (first failure older than 7 days) later paid',
    },
    {
      id: 'dunning-stalled',
      metric: 'dunningStalledInvoices',
      op: 'max',
      threshold: 0,
      description:
        'unpaid failed invoices whose scheduled retry passed 48h ago with no later event',
    },
  ],
  async collect({ env, fetchImpl }) {
    const base = env.LOOP_HEALTH_BASE_URL || 'https://jov.ie';
    const secret = env.CRON_SECRET;
    if (!secret)
      throw new Error('CRON_SECRET is not set; cannot read billing metrics');
    const response = await fetchImpl(`${base}${METRICS_PATH}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok)
      throw new Error(`billing metrics route returned HTTP ${response.status}`);
    const app = await response.json();
    // A truncated read understates failures and would let an issue close.
    if (app.truncated)
      throw new Error('billing metrics truncated at the row limit');
    return {
      metrics: {
        invoiceAttempts30d: app.invoiceAttempts30d,
        failedInvoices30d: app.failedInvoices30d,
        failureRatePct: app.failureRatePct,
        maturedFailed: app.maturedFailed,
        recoveredOfMatured: app.recoveredOfMatured,
        recoveryRatePct: app.recoveryRatePct,
        dunningStalledInvoices: app.dunningStalledInvoices,
      },
      detail: {},
    };
  },
};
