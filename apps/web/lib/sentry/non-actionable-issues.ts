/**
 * Filters for Sentry issues that are known transient infra noise.
 *
 * "Degraded HTTP Operation" (ai_detected_http) on POST /pipeline is a recurring
 * single-event blip from Upstash Redis REST pipeline latency during cold starts.
 * It is not an application defect and should not trigger autofix or performance alerts.
 *
 * `Error: connect ECONNREFUSED /opt/vercel/ipc.sock` (JOV-5605) is Next.js
 * `after()` / Vercel `waitUntil` talking to a missing helper socket. Not an
 * application defect.
 *
 * BetterAuthError loopback Host rejections (JOV-5843 / JOV-4381 / JOV-4384)
 * are local/synthetic traffic, including events that reach prod Sentry with
 * a localhost Host header and no request URL.
 *
 * Opaque `{"error":{"name":"UpstashError"}}` titles are the JSON-stringified
 * form of an UpstashError whose `message` is non-enumerable (JOV-5182,
 * JOV-5183, JOV-5185, JOV-5186, JOV-5187, JOV-5209, JOV-5218, JOV-5220,
 * JOV-5221, JOV-5228, JOV-5229). `{ clerkUserId, error }` wrappers stringify
 * to the JOV-5185 title. The standing Redis operability canary already pages
 * on quota exhaustion. The real command-failure title (`UpstashError: ERR max
 * requests limit exceeded`, JOV-5184) is the same incident — drop it at
 * capture time so it does not file a Linear issue per route.
 */

export interface SentryIssueSummary {
  title?: string | null;
  culprit?: string | null;
}

export interface SentryEventLike {
  readonly title?: string | null;
  readonly message?: string | null;
  readonly exception?: {
    readonly values?: ReadonlyArray<{
      readonly type?: string | null;
      readonly value?: string | null;
    } | null> | null;
  } | null;
}

/**
 * JSON.stringify({ error: UpstashError }) because `message` is non-enumerable.
 * Substring match so prefixed Sentry titles still drop (JOV-5228).
 * `{ clerkUserId, error: UpstashError }` is the JOV-5185 Linear title.
 */
const UPSTASH_ERROR_JSON_BAG_PATTERN =
  /\{\s*"error"\s*:\s*\{\s*"name"\s*:\s*"UpstashError"\s*\}\s*\}/;
const UPSTASH_ERROR_NAME_ONLY_PATTERN = /\{\s*"name"\s*:\s*"UpstashError"\s*\}/;
const UPSTASH_ERROR_CLERK_USER_JSON_BAG_PATTERN =
  /\{\s*"clerkUserId"\s*:\s*"[^"]+"\s*,\s*"error"\s*:\s*\{\s*"name"\s*:\s*"UpstashError"\s*\}\s*\}/;
const UPSTASH_ERROR_JSON_BAG_PATTERNS: ReadonlyArray<RegExp> = [
  UPSTASH_ERROR_JSON_BAG_PATTERN,
  UPSTASH_ERROR_NAME_ONLY_PATTERN,
  UPSTASH_ERROR_CLERK_USER_JSON_BAG_PATTERN,
];

/** Drop these in server/edge `ignoreErrors` so quota noise never files issues. */
export const UPSTASH_QUOTA_IGNORE_ERRORS: ReadonlyArray<RegExp> = [
  /ERR max requests limit exceeded/i,
  ...UPSTASH_ERROR_JSON_BAG_PATTERNS,
];

/**
 * Expected per-run collaborator-profile cap. `captureWarning(msg, receipt)`
 * JSON-stringified the receipt into Linear as JOV-5263.
 */
const SPOTIFY_RELEASE_CREDIT_BOUND_PATTERN =
  /"source"\s*:\s*"spotify_release_credit"[\s\S]*"retry"\s*:\s*"next_spotify_import_or_backfill"/;

export const SPOTIFY_RELEASE_CREDIT_BOUND_IGNORE_ERRORS: ReadonlyArray<RegExp> =
  [SPOTIFY_RELEASE_CREDIT_BOUND_PATTERN];

/**
 * Next.js `after()` / Vercel `waitUntil` talking to a missing helper socket
 * (JOV-5605). Not an application defect; the runtime cannot keep the
 * function alive. Drop at capture and webhook so it does not file Linear.
 */
export const VERCEL_IPC_SOCK_IGNORE_ERRORS: ReadonlyArray<RegExp> = [
  /connect ECONNREFUSED .*\/opt\/vercel\/ipc\.sock/,
];

/**
 * Better Auth host allowlist throws when a loopback Host header is not in
 * the frozen list (JOV-5843 / JOV-4381 / JOV-4384). That is local/synthetic
 * traffic, including requests that reach prod Sentry with a localhost Host
 * and no request URL. Drop at capture and webhook so it does not file Linear.
 */
export const LOOPBACK_BETTER_AUTH_HOST_IGNORE_ERRORS: ReadonlyArray<RegExp> = [
  /Host "(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?" is not in the allowed hosts list/i,
];

function isSpotifyReleaseCreditBoundBag(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    record.source === 'spotify_release_credit' &&
    record.retry === 'next_spotify_import_or_backfill'
  );
}

/**
 * True when a capture is the expected credit-reconciliation bound receipt,
 * not an identity conflict or cache-invalidation failure.
 */
export function isSpotifyReleaseCreditBoundCapture(
  value: unknown,
  context?: Record<string, unknown> | null
): boolean {
  if (isSpotifyReleaseCreditBoundBag(context)) return true;
  if (isSpotifyReleaseCreditBoundBag(value)) return true;
  if (typeof value === 'string') {
    return SPOTIFY_RELEASE_CREDIT_BOUND_PATTERN.test(value);
  }
  if (value instanceof Error) {
    return SPOTIFY_RELEASE_CREDIT_BOUND_PATTERN.test(value.message);
  }
  if (value && typeof value === 'object') {
    try {
      return SPOTIFY_RELEASE_CREDIT_BOUND_PATTERN.test(JSON.stringify(value));
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * True when a Sentry/Linear title is the JOV-5263 bounded-credit JSON bag.
 */
export function isNonActionableSpotifyReleaseCreditBoundIssue(
  issue: SentryIssueSummary
): boolean {
  return (
    SPOTIFY_RELEASE_CREDIT_BOUND_PATTERN.test(issue.title ?? '') ||
    SPOTIFY_RELEASE_CREDIT_BOUND_PATTERN.test(issue.culprit ?? '')
  );
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
 * requests…` title (JOV-5184 / JOV-5199) and must not match this bag —
 * they are dropped separately as quota noise.
 */
export const UPSTASH_ERROR_JSON_BAG = '{"error":{"name":"UpstashError"}}';
const UPSTASH_ERROR_JSON_BAG_TITLE = `Error: ${UPSTASH_ERROR_JSON_BAG}`;

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

const VERCEL_IPC_SOCK_TITLE = 'connect econnrefused /opt/vercel/ipc.sock';

function isVercelIpcSockText(value: string | null | undefined): boolean {
  if (!value) return false;
  if (VERCEL_IPC_SOCK_IGNORE_ERRORS.some(pattern => pattern.test(value))) {
    return true;
  }
  return normalize(value).includes(VERCEL_IPC_SOCK_TITLE);
}

function isUpstashErrorJsonBagText(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = normalize(value);
  return (
    normalized === normalize(UPSTASH_ERROR_JSON_BAG) ||
    normalized === normalize(UPSTASH_ERROR_JSON_BAG_TITLE) ||
    UPSTASH_ERROR_JSON_BAG_PATTERN.test(value) ||
    UPSTASH_ERROR_CLERK_USER_JSON_BAG_PATTERN.test(value)
  );
}

/**
 * True when a captured value would Sentry-title as
 * `Error: {"error":{"name":"UpstashError"}}` (JOV-5183 / JOV-5186 /
 * JOV-5187 / JOV-5209 / JOV-5218 / JOV-5228) or the clerkUserId-wrapped
 * JOV-5185 bag. Error instances are matched on `message` so a real
 * `UpstashError: ERR max requests…` exception is classified as quota noise
 * (JOV-5184), not this bag. Next.js request wrappers keep the bag on
 * `cause`; walk a bounded chain.
 */
export function isOpaqueUpstashErrorJsonBag(value: unknown): boolean {
  return isOpaqueUpstashErrorJsonBagInner(value, new Set());
}

function isOpaqueUpstashErrorJsonBagInner(
  value: unknown,
  seen: Set<unknown>
): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'object') {
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
  }
  if (typeof value === 'string') {
    return (
      isUpstashErrorJsonBagText(value) ||
      UPSTASH_ERROR_JSON_BAG_PATTERNS.some(pattern => pattern.test(value))
    );
  }
  if (value instanceof Error) {
    return (
      isOpaqueUpstashErrorJsonBagInner(value.message, seen) ||
      isOpaqueUpstashErrorJsonBagInner(value.cause, seen)
    );
  }
  if (typeof value === 'object') {
    try {
      return isOpaqueUpstashErrorJsonBagInner(JSON.stringify(value), seen);
    } catch {
      return false;
    }
  }
  return false;
}

export interface SentryExceptionLike {
  readonly title?: string | null;
  readonly message?: string | null;
  readonly logentry?: {
    readonly message?: string | null;
    readonly formatted?: string | null;
  } | null;
  readonly extra?: Record<string, unknown> | null;
  readonly exception?: {
    readonly values?: ReadonlyArray<{
      readonly type?: string | null;
      readonly value?: string | null;
    } | null> | null;
  } | null;
}

function collectSentryEventCaptureValues(
  event: SentryExceptionLike
): Array<unknown> {
  const values: Array<unknown> = [
    event.title,
    event.message,
    event.logentry?.message,
    event.logentry?.formatted,
    ...Object.values(event.extra ?? {}),
  ];

  for (const exception of event.exception?.values ?? []) {
    values.push(exception?.value);
    if (exception?.type && exception.value) {
      values.push(`${exception.type}: ${exception.value}`);
    }
  }

  return values;
}

/**
 * True when a Sentry event is the JOV-5263 bounded-credit JSON bag.
 */
export function isNonActionableSpotifyReleaseCreditBoundEvent(
  event: SentryExceptionLike
): boolean {
  return collectSentryEventCaptureValues(event).some(value =>
    isSpotifyReleaseCreditBoundCapture(value)
  );
}

/**
 * Returns true when a Sentry issue is the JOV-5183 / JOV-5185 / JOV-5186 /
 * JOV-5187 JSON-bag title, not a real Upstash command failure.
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
 * Returns true when a Sentry event is the JOV-5183 / JOV-5186 / JOV-5187
 * JSON-bag exception. Object captures keep the bag on `extra` (commonly
 * `__serialized__` / `error`) while `logentry.formatted` holds the Linear
 * title (JOVIE-WEB-TY).
 */
export function isNonActionableUpstashErrorBagEvent(
  event: SentryExceptionLike
): boolean {
  return collectSentryEventCaptureValues(event).some(value =>
    isOpaqueUpstashErrorJsonBag(value)
  );
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

/**
 * Returns true when a string is Redis quota exhaustion or the opaque
 * JSON bag Sentry titles as `Error: {"error":{"name":"UpstashError"}}`.
 */
export function isUpstashQuotaNoise(value: string | null | undefined): boolean {
  if (!value) return false;
  return UPSTASH_QUOTA_IGNORE_ERRORS.some(pattern => pattern.test(value));
}

/**
 * Returns true when a Sentry event is Redis quota noise that should not
 * file a new issue. The hourly operability canary owns the standing alert.
 */
export function isUpstashQuotaSentryEvent(event: SentryEventLike): boolean {
  const parts = [
    event.title,
    event.message,
    ...(event.exception?.values ?? []).flatMap(value => [
      value?.type,
      value?.value,
    ]),
  ];
  return parts.some(part => isUpstashQuotaNoise(part));
}

/**
 * Opaque `{error:{name:"UpstashError"}}` titles and quota-exhausted
 * UpstashError events are one Redis-quota incident, not per-route bugs.
 * The health canary owns the paging class (`redis_operability_quota_exceeded`).
 */
export function isNonActionableUpstashIssue(
  issue: SentryIssueSummary
): boolean {
  return isUpstashQuotaNoise(issue.title);
}

/**
 * True when a Sentry/Linear title is the JOV-5605 Vercel IPC socket refusal.
 */
export function isNonActionableVercelIpcIssue(
  issue: SentryIssueSummary
): boolean {
  return isVercelIpcSockText(issue.title) || isVercelIpcSockText(issue.culprit);
}

/**
 * True when a Sentry event is the JOV-5605 Vercel IPC socket refusal.
 */
export function isNonActionableVercelIpcEvent(
  event: SentryExceptionLike
): boolean {
  return collectSentryEventCaptureValues(event).some(
    value => typeof value === 'string' && isVercelIpcSockText(value)
  );
}

function isLoopbackBetterAuthHostText(
  value: string | null | undefined
): boolean {
  if (!value) return false;
  return LOOPBACK_BETTER_AUTH_HOST_IGNORE_ERRORS.some(pattern =>
    pattern.test(value)
  );
}

/**
 * True when a Sentry/Linear title is a Better Auth loopback Host rejection
 * (JOV-5843). Real remote-host allowlist failures must not match.
 */
export function isNonActionableLoopbackBetterAuthHostIssue(
  issue: SentryIssueSummary
): boolean {
  return (
    isLoopbackBetterAuthHostText(issue.title) ||
    isLoopbackBetterAuthHostText(issue.culprit)
  );
}

/**
 * True when a Sentry event is a Better Auth loopback Host rejection.
 */
export function isNonActionableLoopbackBetterAuthHostEvent(
  event: SentryExceptionLike
): boolean {
  return collectSentryEventCaptureValues(event).some(
    value => typeof value === 'string' && isLoopbackBetterAuthHostText(value)
  );
}
