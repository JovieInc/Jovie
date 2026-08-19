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

/**
 * Exact Sentry/Linear title created when `captureWarning(msg, { error })`
 * JSON-stringifies an UpstashError whose only enumerable field is `name`.
 * Real quota exceptions keep the `UpstashError: Command failed: ERR max
 * requests…` title (JOV-5199) and must not match this bag.
 */
export const UPSTASH_ERROR_JSON_BAG = '{"error":{"name":"UpstashError"}}';
const UPSTASH_ERROR_JSON_BAG_TITLE = `Error: ${UPSTASH_ERROR_JSON_BAG}`;

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function isUpstashErrorJsonBagText(value: string | null | undefined): boolean {
  const normalized = normalize(value);
  return (
    normalized === normalize(UPSTASH_ERROR_JSON_BAG) ||
    normalized === normalize(UPSTASH_ERROR_JSON_BAG_TITLE)
  );
}

export interface SentryExceptionLike {
  readonly message?: string | null;
  readonly logentry?: { readonly message?: string | null } | null;
  readonly exception?: {
    readonly values?: ReadonlyArray<{
      readonly type?: string | null;
      readonly value?: string | null;
    } | null> | null;
  } | null;
}

/**
 * Returns true when a Sentry issue is the JOV-5218 JSON-bag title, not a
 * real Upstash command failure.
 */
export function isNonActionableUpstashErrorBag(
  issue: SentryIssueSummary
): boolean {
  return (
    isUpstashErrorJsonBagText(issue.title) ||
    isUpstashErrorJsonBagText(issue.culprit)
  );
}

/**
 * Returns true when a Sentry event is the JOV-5218 JSON-bag exception.
 */
export function isNonActionableUpstashErrorBagEvent(
  event: SentryExceptionLike
): boolean {
  const values: Array<string | null | undefined> = [
    event.message,
    event.logentry?.message,
  ];

  for (const exception of event.exception?.values ?? []) {
    values.push(exception?.value);
    if (exception?.type && exception.value) {
      values.push(`${exception.type}: ${exception.value}`);
    }
  }

  return values.some(value => isUpstashErrorJsonBagText(value));
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
