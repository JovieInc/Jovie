/** 48h reconciliation freshness, 30m stuck webhooks, 12h Linear refire. */
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
  lastReconciliationSuccess?: boolean | null;
  stuckWebhooks: readonly StuckWebhookSnapshot[];
  lastFiledAtByFingerprint: Readonly<Record<string, Date | null>>;
}): BillingSyncFinding[] {
  const findings: BillingSyncFinding[] = [];
  const lastRun = input.lastReconciliationAt;
  const stale =
    input.lastReconciliationSuccess === false ||
    !lastRun ||
    input.now.getTime() - lastRun.getTime() > RECONCILIATION_STALE_AFTER_MS;
  if (stale && shouldFile(input, BILLING_SYNC_STALE_FINGERPRINT)) {
    const age = lastRun
      ? `${Math.round((input.now.getTime() - lastRun.getTime()) / 3_600_000)} hours`
      : 'never';
    findings.push(
      finding(
        BILLING_SYNC_STALE_FINGERPRINT,
        input.lastReconciliationSuccess === false
          ? `JOV-7558. The latest canonical billing reconciliation failed (last run: ${lastRun ? lastRun.toISOString() : 'none'}). A fresh failed receipt is not recovery.`
          : `JOV-7558. No successful billing reconciliation inside 48 hours (last run: ${lastRun ? lastRun.toISOString() : 'none'}, age ${age}).`
      )
    );
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
    findings.push(
      finding(
        BILLING_WEBHOOKS_STUCK_FINGERPRINT,
        `JOV-7558. ${input.stuckWebhooks.length} stored Stripe event(s) are unprocessed. Replay does not call Stripe write APIs. Do not refund, charge, or change a price.\n${lines.join('\n')}`
      )
    );
  }
  return findings;
}
function finding(fingerprint: string, detail: string): BillingSyncFinding {
  const label = remediationLabel(fingerprint);
  const title =
    fingerprint === BILLING_SYNC_STALE_FINGERPRINT
      ? `Billing reconciliation stale (${fingerprint})`
      : `Stuck Stripe webhooks (${fingerprint})`;
  return {
    fingerprint,
    label,
    title,
    description: `${detail} Fingerprint: ${fingerprint}. Label: ${label}.`,
  };
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
  const object = eventObject(input.payload);
  const subscriptionId = readSubscriptionId(object);
  const chargeId =
    input.type === 'charge.refunded'
      ? stringOf(object?.id)
      : stringOf(object?.charge);
  const subscription = subscriptionId
    ? `subscription ${subscriptionId}`
    : 'the subscription on this charge';
  const charge = chargeId ? ` for charge ${chargeId}` : '';
  return `Open ${subscription}${charge} and cancel the subscription. Do not refund, create a charge, or change the price. Replay will not call subscriptions.cancel.`;
}
function readSubscriptionId(
  object: Record<string, unknown> | null
): string | null {
  const invoice = object?.invoice;
  if (!invoice || typeof invoice !== 'object') return null;
  return stringOf((invoice as { subscription?: unknown }).subscription);
}
function stringOf(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === 'string' ? id : null;
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
