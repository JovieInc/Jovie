import 'server-only';

import { createHash } from 'node:crypto';
import { assertFinancialOwnerId } from './owner';
import { FINANCE_SENSITIVE_FIELDS } from './redaction';

/**
 * Finance operational alerting (JOV-4621).
 *
 * Alerts and operational dashboards for link success, sync freshness,
 * reconciliation anomalies, authorization denials, metric-job failures, and
 * deletion failures must identify the affected owner only by a pseudonymous
 * reference and must never carry amounts, transaction text, institution
 * names, account masks, or provider payloads. `buildFinanceAlert` produces
 * the only sanctioned alert shape; sensitive context keys are stripped
 * entirely rather than redacted in place.
 */

export const FINANCE_ALERT_KINDS = [
  'link_failure',
  'sync_stale',
  'reconciliation_anomaly',
  'authorization_denied',
  'metric_job_failure',
  'deletion_failure',
] as const;

export type FinanceAlertKind = (typeof FINANCE_ALERT_KINDS)[number];

export interface FinanceAlert {
  readonly kind: FinanceAlertKind;
  /** Pseudonymous owner reference — never the raw users.id. */
  readonly ownerRef: string;
  /** Context with sensitive keys stripped; scalar-safe operational data only. */
  readonly context: Record<string, unknown>;
}

const OWNER_REF_PREFIX = 'fin_';
const OWNER_REF_DIGEST = 'sha256';
const OWNER_REF_SALT = 'finance-alert-owner-ref:v1';
const OWNER_REF_LENGTH = 16;

const SENSITIVE_SET: ReadonlySet<string> = new Set(FINANCE_SENSITIVE_FIELDS);

/**
 * Derive a stable, pseudonymous reference for a financial owner. The digest
 * is deterministic so alerts can be correlated, but the raw `users.id` is
 * unrecoverable from the payload.
 */
export function financeOwnerRef(ownerUserId: string): string {
  const owner = assertFinancialOwnerId(ownerUserId);
  const digest = createHash(OWNER_REF_DIGEST)
    .update(`${OWNER_REF_SALT}:${owner}`)
    .digest('hex')
    .slice(0, OWNER_REF_LENGTH);
  return `${OWNER_REF_PREFIX}${digest}`;
}

function stripSensitive(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripSensitive);
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      if (SENSITIVE_SET.has(key)) {
        continue;
      }
      out[key] = stripSensitive(inner);
    }
    return out;
  }
  return value;
}

/**
 * Build an alert payload safe to send to any operational sink. `context` may
 * only carry operational scalars (counts, durations, statuses, correlation
 * ids) — keys listed in `FINANCE_SENSITIVE_FIELDS` are dropped at every
 * depth, and the raw owner id never appears in the result.
 */
export function buildFinanceAlert(
  kind: FinanceAlertKind,
  ownerUserId: string,
  context: Record<string, unknown> = {}
): FinanceAlert {
  if (!FINANCE_ALERT_KINDS.includes(kind)) {
    throw new TypeError(`Unknown finance alert kind: ${String(kind)}`);
  }
  return {
    kind,
    ownerRef: financeOwnerRef(ownerUserId),
    context: stripSensitive(context) as Record<string, unknown>,
  };
}
