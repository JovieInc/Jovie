import { and, desc, eq, gte, isNull, lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { billingAuditLog, stripeWebhookEvents } from '@/lib/db/schema/billing';
import { env } from '@/lib/env-server';
import { logger } from '@/lib/utils/logger';
import {
  BILLING_SYNC_STALE_FINGERPRINT,
  BILLING_WEBHOOKS_STUCK_FINGERPRINT,
  type BillingSyncFinding,
  dashboardActionForStoredEvent,
  evaluateBillingSyncRemediation,
  RECONCILIATION_RUN_EVENT,
  REMEDIATION_FILED_EVENT,
  REMEDIATION_REFIRING_MS,
  STUCK_WEBHOOK_AFTER_MS,
  type StuckWebhookSnapshot,
} from './sync-remediation-policy';

const LINEAR_API = 'https://api.linear.app/graphql';
/** Same Jovie team as scripts/lib/linear-issue-intake.mjs. */
const JOVIE_TEAM_ID = 'bdc09edc-f91c-4a06-b308-74b4fcf093f8';
export interface BillingSyncRemediationResult {
  findings: number;
  filed: string[];
  skipped: boolean;
}
/** DB-backed detector. Does not call `/api/billing/health`. */
export async function runBillingSyncRemediation(
  now = new Date()
): Promise<BillingSyncRemediationResult> {
  const snapshot = await loadBillingSyncSnapshot(now);
  const findings = evaluateBillingSyncRemediation(snapshot);
  if (findings.length === 0) return { findings: 0, filed: [], skipped: false };
  const apiKey = env.LINEAR_API_KEY;
  if (!apiKey) {
    throw new Error(
      'LINEAR_API_KEY is not configured; billing sync remediation cannot file'
    );
  }
  const filed: string[] = [];
  for (const finding of findings) {
    await fileBillingSyncFinding(finding, apiKey);
    await db.insert(billingAuditLog).values({
      userId: null,
      eventType: REMEDIATION_FILED_EVENT,
      previousState: {},
      newState: { fingerprint: finding.fingerprint },
      source: 'remediation',
      metadata: { fingerprint: finding.fingerprint, label: finding.label },
    });
    filed.push(finding.fingerprint);
  }
  logger.info('[billing-sync-remediation] filed', { filed });
  return { findings: findings.length, filed, skipped: false };
}
export async function loadBillingSyncSnapshot(now: Date): Promise<{
  now: Date;
  lastReconciliationAt: Date | null;
  lastReconciliationSuccess: boolean | null;
  stuckWebhooks: StuckWebhookSnapshot[];
  lastFiledAtByFingerprint: Record<string, Date | null>;
}> {
  const stuckBefore = new Date(now.getTime() - STUCK_WEBHOOK_AFTER_MS);
  const filedSince = new Date(now.getTime() - REMEDIATION_REFIRING_MS);
  const [lastRunRows, stuckRows, filedRows] = await Promise.all([
    db
      .select({
        createdAt: billingAuditLog.createdAt,
        metadata: billingAuditLog.metadata,
      })
      .from(billingAuditLog)
      .where(
        and(
          eq(billingAuditLog.source, 'reconciliation'),
          eq(billingAuditLog.eventType, RECONCILIATION_RUN_EVENT)
        )
      )
      .orderBy(desc(billingAuditLog.createdAt))
      .limit(1),
    db
      .select({
        stripeEventId: stripeWebhookEvents.stripeEventId,
        type: stripeWebhookEvents.type,
        createdAt: stripeWebhookEvents.createdAt,
        payload: stripeWebhookEvents.payload,
      })
      .from(stripeWebhookEvents)
      .where(
        and(
          isNull(stripeWebhookEvents.processedAt),
          lt(stripeWebhookEvents.createdAt, stuckBefore)
        )
      )
      .orderBy(desc(stripeWebhookEvents.createdAt))
      .limit(20),
    db
      .select({
        createdAt: billingAuditLog.createdAt,
        metadata: billingAuditLog.metadata,
      })
      .from(billingAuditLog)
      .where(
        and(
          eq(billingAuditLog.eventType, REMEDIATION_FILED_EVENT),
          gte(billingAuditLog.createdAt, filedSince)
        )
      ),
  ]);
  const lastFiledAtByFingerprint: Record<string, Date | null> = {
    [BILLING_SYNC_STALE_FINGERPRINT]: null,
    [BILLING_WEBHOOKS_STUCK_FINGERPRINT]: null,
  };
  for (const row of filedRows) {
    const fingerprint = readFingerprint(row.metadata);
    if (!fingerprint) continue;
    const existing = lastFiledAtByFingerprint[fingerprint];
    if (!existing || row.createdAt > existing) {
      lastFiledAtByFingerprint[fingerprint] = row.createdAt;
    }
  }
  return {
    now,
    lastReconciliationAt: lastRunRows[0]?.createdAt ?? null,
    lastReconciliationSuccess:
      typeof lastRunRows[0]?.metadata?.success === 'boolean'
        ? lastRunRows[0].metadata.success
        : null,
    stuckWebhooks: stuckRows.map(row => ({
      stripeEventId: row.stripeEventId,
      type: row.type,
      createdAt: row.createdAt,
      dashboardAction: dashboardActionForStoredEvent({
        type: row.type,
        payload: row.payload,
      }),
    })),
    lastFiledAtByFingerprint,
  };
}
function readFingerprint(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const fingerprint = (metadata as { fingerprint?: unknown }).fingerprint;
  return typeof fingerprint === 'string' ? fingerprint : null;
}
export async function fileBillingSyncFinding(
  finding: BillingSyncFinding,
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ action: 'created' | 'updated'; id: string | null }> {
  const labelId = await ensureRemediationLabel(
    finding.label,
    apiKey,
    fetchImpl
  );
  const existing = await findIssueByFingerprint(
    finding.fingerprint,
    apiKey,
    fetchImpl
  );
  if (!existing) {
    const created = await linearGraphql(
      `mutation CreateBillingRemediation($title: String!, $description: String!, $labelIds: [String!]) { issueCreate(input: { teamId: "${JOVIE_TEAM_ID}", title: $title, description: $description, priority: 2, labelIds: $labelIds }) { success issue { id identifier } } }`,
      {
        title: finding.title,
        description: finding.description,
        labelIds: [labelId],
      },
      apiKey,
      fetchImpl,
      'linear_create'
    );
    const issue = created.issueCreate?.issue;
    if (!created.issueCreate?.success || !issue?.id) {
      throw new Error(
        'Linear issue create failed for billing sync remediation'
      );
    }
    return { action: 'created', id: issue.id };
  }
  const updated = await linearGraphql(
    `mutation UpdateBillingRemediation($id: String!, $description: String!, $labelIds: [String!]) { issueUpdate(id: $id, input: { description: $description, addedLabelIds: $labelIds }) { success issue { id } } }`,
    { id: existing.id, description: finding.description, labelIds: [labelId] },
    apiKey,
    fetchImpl,
    'linear_update'
  );
  if (!updated.issueUpdate?.success) {
    throw new Error('Linear issue update failed for billing sync remediation');
  }
  return { action: 'updated', id: existing.id };
}
async function ensureRemediationLabel(
  name: string,
  apiKey: string,
  fetchImpl: typeof fetch
): Promise<string> {
  const found = await linearGraphql(
    `query FindRemediationLabel($name: String!) { issueLabels(filter: { name: { eq: $name } }, first: 5) { nodes { id name } } }`,
    { name },
    apiKey,
    fetchImpl,
    'linear_label_search'
  );
  const match = (found.issueLabels?.nodes ?? []).find(
    node => node?.name === name && node.id
  );
  if (match?.id) return match.id;
  const created = await linearGraphql(
    `mutation CreateRemediationLabel($name: String!) { issueLabelCreate(input: { name: $name, teamId: "${JOVIE_TEAM_ID}" }) { success issueLabel { id name } } }`,
    { name },
    apiKey,
    fetchImpl,
    'linear_label_create'
  );
  const id = created.issueLabelCreate?.issueLabel?.id;
  if (!created.issueLabelCreate?.success || !id) {
    throw new Error(`Linear label create failed for ${name}`);
  }
  return id;
}
async function findIssueByFingerprint(
  fingerprint: string,
  apiKey: string,
  fetchImpl: typeof fetch
): Promise<{ id: string } | null> {
  const found = await linearGraphql(
    `query FindBillingRemediation($fingerprint: String!) { issues(filter: { team: { id: { eq: "${JOVIE_TEAM_ID}" } }, title: { contains: $fingerprint } }, first: 10) { nodes { id title state { type } } } }`,
    { fingerprint },
    apiKey,
    fetchImpl,
    'linear_search'
  );
  const matches = (found.issues?.nodes ?? []).filter(node =>
    String(node.title ?? '').includes(fingerprint)
  );
  const open = matches.find(
    node => node.state?.type !== 'completed' && node.state?.type !== 'canceled'
  );
  const chosen = open ?? matches[0];
  return chosen?.id ? { id: chosen.id } : null;
}
interface GqlData {
  issueCreate?: { success?: boolean; issue?: { id?: string } | null };
  issueUpdate?: { success?: boolean; issue?: { id?: string } | null };
  issueLabelCreate?: { success?: boolean; issueLabel?: { id?: string } | null };
  issueLabels?: { nodes?: Array<{ id?: string; name?: string }> };
  issues?: {
    nodes?: Array<{ id?: string; title?: string; state?: { type?: string } }>;
  };
}
async function linearGraphql(
  query: string,
  variables: Record<string, unknown>,
  apiKey: string,
  fetchImpl: typeof fetch,
  caller: string
): Promise<GqlData> {
  const response = await fetchImpl(LINEAR_API, {
    method: 'POST',
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => null)) as {
    data?: GqlData;
    errors?: unknown[];
  } | null;
  if (!response.ok || (body?.errors && body.errors.length > 0) || !body?.data) {
    logger.warn('[billing-sync-remediation] Linear request failed', {
      caller,
      status: response.status,
    });
    throw new Error(`${caller} failed`);
  }
  return body.data;
}
