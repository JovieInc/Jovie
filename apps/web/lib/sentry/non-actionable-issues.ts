/**
 * Filters for Sentry issues that are known transient infra noise.
 *
 * "Degraded HTTP Operation" (ai_detected_http) on POST /pipeline is a recurring
 * single-event blip from Upstash Redis REST pipeline latency during cold starts.
 * It is not an application defect and should not trigger autofix or performance alerts.
 */

export interface SentryIssueSummary {
  title?: string | null;
  culprit?: string | null;
}

/** Transaction names excluded from performance tracing (0% sample rate). */
export const TRANSIENT_INFRA_HTTP_TRANSACTIONS = [
  'POST /pipeline', // Upstash Redis REST pipeline
] as const;

const DEGRADED_HTTP_OPERATION_TITLE = 'degraded http operation';

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Returns true when a Sentry issue is a known transient infra latency blip.
 */
export function isTransientInfraHttpIssue(issue: SentryIssueSummary): boolean {
  const title = normalize(issue.title);
  const culprit = normalize(issue.culprit);

  if (title !== DEGRADED_HTTP_OPERATION_TITLE) {
    return false;
  }

  return TRANSIENT_INFRA_HTTP_TRANSACTIONS.some(
    transaction => culprit === transaction.toLowerCase()
  );
}

/**
 * Returns true when a performance transaction should be excluded from tracing.
 */
export function isTransientInfraHttpTransaction(
  transactionName: string | null | undefined
): boolean {
  const normalized = normalize(transactionName);
  return TRANSIENT_INFRA_HTTP_TRANSACTIONS.some(
    transaction => normalized === transaction.toLowerCase()
  );
}
