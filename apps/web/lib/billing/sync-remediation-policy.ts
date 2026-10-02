/**
 * Pure billing-sync remediation policy.
 *
 * The daily reconciliation cron is healthy when it recorded a run within 48
 * hours. Stuck webhooks are any unprocessed Stripe rows older than 30 minutes.
 * Findings become Linear issues labeled `remediation:<fingerprint>` (JOV-7540).
 */

export const RECONCILIATION_STALE_AFTER_MS = 48 * 60 * 60 * 1000;
export const STUCK_WEBHOOK_AFTER_MS = 30 * 60 * 1000;
export const REMEDIATION_REFIRING_MS = 12 * 60 * 60 * 1000;

export const BILLING_SYNC_STALE_FINGERPRINT = 'billing-sync-stale';
export const BILLING_WEBHOOKS_STUCK_FINGERPRINT = 'billing-webhooks-stuck';

export const RECONCILIATION_RUN_EVENT = 'reconciliation_run';
export const REMEDIATION_FILED_EVENT = 'billing_sync_remediation_filed';

export function remediationLabel(fingerprint: string): string {
  return `remediation:${fingerprint}`;
}

export interface StuckWebhookSnapshot {
  stripeEventId: string;
  type: string;
  createdAt: Date;
  /** Operator instruction when replay cannot finish without a Stripe write. */
  dashboardAction: string | null;
}

export interface BillingSyncFinding {
  fingerprint: string;
  label: string;
  title: string;
  description: string;
}

export function evaluateBillingSyncRemediation(input: {
  now: Date;
  lastReconciliationAt: Date | null;
  stuckWebhooks: readonly StuckWebhookSnapshot[];
  lastFiledAtByFingerprint: Readonly<Record<string, Date | null>>;
}): BillingSyncFinding[] {
  const findings: BillingSyncFinding[] = [];

  const lastRun = input.lastReconciliationAt;
  const stale =
    !lastRun ||
    input.now.getTime() - lastRun.getTime() > RECONCILIATION_STALE_AFTER_MS;
  if (stale && shouldFile(input, BILLING_SYNC_STALE_FINGERPRINT)) {
    const age = lastRun
      ? `${Math.round((input.now.getTime() - lastRun.getTime()) / (60 * 60 * 1000))} hours`
      : 'never';
    findings.push({
      fingerprint: BILLING_SYNC_STALE_FINGERPRINT,
      label: remediationLabel(BILLING_SYNC_STALE_FINGERPRINT),
      title: `Billing reconciliation stale (${BILLING_SYNC_STALE_FINGERPRINT})`,
      description: `## Source
- Current issue: JOV-7558
- Source branch/session: billing reconciliation cron

## Follow-up
Daily billing reconciliation has no successful run inside 48 hours (last recorded run: ${lastRun ? lastRun.toISOString() : 'none'}, age ${age}).

## Why it matters
Pro counts can stay in sync while the reconciliation safety net is dead. A later webhook miss then has nothing to repair it.

## Classification
Required

## Acceptance criteria
\`/api/cron/daily-maintenance\` runs \`runReconciliation\`, writes a \`reconciliation_run\` audit row with \`source = reconciliation\`, and this issue stays open until that timestamp is under 48 hours old.

## Dependency
None

Fingerprint: \`${BILLING_SYNC_STALE_FINGERPRINT}\`
Label: \`${remediationLabel(BILLING_SYNC_STALE_FINGERPRINT)}\``,
    });
  }

  if (
    input.stuckWebhooks.length > 0 &&
    shouldFile(input, BILLING_WEBHOOKS_STUCK_FINGERPRINT)
  ) {
    const lines = input.stuckWebhooks.map(row => {
      const action = row.dashboardAction
        ? ` Dashboard: ${row.dashboardAction}`
        : '';
      return `- ${row.stripeEventId} ${row.type} since ${row.createdAt.toISOString()}.${action}`;
    });
    findings.push({
      fingerprint: BILLING_WEBHOOKS_STUCK_FINGERPRINT,
      label: remediationLabel(BILLING_WEBHOOKS_STUCK_FINGERPRINT),
      title: `Stuck Stripe webhooks (${BILLING_WEBHOOKS_STUCK_FINGERPRINT})`,
      description: `## Source
- Current issue: JOV-7558
- Source branch/session: billing webhook replay

## Follow-up
${input.stuckWebhooks.length} Stripe webhook row(s) are unprocessed and older than 30 minutes. Daily replay retries stored payloads. It does not call Stripe write APIs.

## Why it matters
Stripe stops retrying after its own window. An unprocessed row never updates billing unless something replays the stored event.

## Classification
Required

## Acceptance criteria
Each listed event is either marked processed by the idempotent replay, or a person completes the named Stripe Dashboard cancel and the next replay finishes the local revoke. Do not refund, charge, or change a price from the Dashboard.

## Dependency
None

Fingerprint: \`${BILLING_WEBHOOKS_STUCK_FINGERPRINT}\`
Label: \`${remediationLabel(BILLING_WEBHOOKS_STUCK_FINGERPRINT)}\`

### Events
${lines.join('\n')}`,
    });
  }

  return findings;
}

function shouldFile(
  input: {
    now: Date;
    lastFiledAtByFingerprint: Readonly<Record<string, Date | null>>;
  },
  fingerprint: string
): boolean {
  const lastFiled = input.lastFiledAtByFingerprint[fingerprint] ?? null;
  if (!lastFiled) return true;
  return input.now.getTime() - lastFiled.getTime() >= REMEDIATION_REFIRING_MS;
}

export function dashboardActionForStoredEvent(input: {
  type: string;
  payload: unknown;
}): string | null {
  if (
    input.type !== 'charge.refunded' &&
    input.type !== 'charge.dispute.created'
  ) {
    return null;
  }
  const subscriptionId = readSubscriptionId(input.payload);
  const chargeId = readChargeId(input.payload, input.type);
  const subscription = subscriptionId
    ? `subscription ${subscriptionId}`
    : 'the subscription on this charge';
  const charge = chargeId ? ` for charge ${chargeId}` : '';
  return `Open ${subscription}${charge} and cancel the subscription. Do not refund, create a charge, or change the price. Replay will not call subscriptions.cancel.`;
}

function readSubscriptionId(payload: unknown): string | null {
  const object = eventObject(payload);
  if (!object) return null;
  const invoice = object.invoice;
  if (invoice && typeof invoice === 'object' && 'subscription' in invoice) {
    const subscription = (invoice as { subscription?: unknown }).subscription;
    if (typeof subscription === 'string') return subscription;
    if (
      subscription &&
      typeof subscription === 'object' &&
      'id' in subscription &&
      typeof (subscription as { id?: unknown }).id === 'string'
    ) {
      return (subscription as { id: string }).id;
    }
  }
  return null;
}

function readChargeId(payload: unknown, type: string): string | null {
  const object = eventObject(payload);
  if (!object) return null;
  if (type === 'charge.refunded' && typeof object.id === 'string') {
    return object.id;
  }
  if (type === 'charge.dispute.created') {
    return typeof object.charge === 'string' ? object.charge : null;
  }
  return null;
}

function eventObject(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return null;
  const object = (data as { object?: unknown }).object;
  if (!object || typeof object !== 'object') return null;
  return object as Record<string, unknown>;
}
