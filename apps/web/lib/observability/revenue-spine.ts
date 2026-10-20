import 'server-only';

import * as Sentry from '@sentry/nextjs';

export const REVENUE_SPINE_STAGES = [
  'auth_resolution',
  'checkout',
  'entitlement_readback',
  'onboarding_persistence',
  'profile_claim',
  'returning_access',
  'rls_setup',
  'stripe_sync',
  'webhook',
] as const;

export const REVENUE_SPINE_FAILURE_CODES = [
  'billing_unavailable',
  'claim_expired',
  'concurrent_update',
  'configuration_missing',
  'dependency_unavailable',
  'identity_unlinked',
  'invalid_signature',
  'ownership_conflict',
  'permission_denied',
  'plan_mismatch',
  'record_missing',
  'schema_missing',
  'timeout',
  'unauthenticated',
  'unexpected_error',
  'unique_conflict',
] as const;

export type RevenueSpineStage = (typeof REVENUE_SPINE_STAGES)[number];
export type RevenueSpineFailureCode =
  (typeof REVENUE_SPINE_FAILURE_CODES)[number];
/** Blocked: cannot complete. Degraded: fallback usable. Unknown: impact unverified. */
export type RevenueSpineSeverity = 'blocked' | 'degraded' | 'unknown';

export interface RevenueSpineFailureInput {
  readonly stage: RevenueSpineStage;
  readonly severity: RevenueSpineSeverity;
  readonly failureCode?: RevenueSpineFailureCode;
  /** Inspected for allowlisted codes only; never serialized. */
  readonly error?: unknown;
  /** Only internal users.id UUIDs are accepted; provider IDs are discarded. */
  readonly userId?: string | null;
}

export interface RevenueSpineFailure {
  readonly contract: 'revenue-spine-failure/v1';
  readonly stage: RevenueSpineStage;
  readonly failure_code: RevenueSpineFailureCode;
  readonly fingerprint: string;
  readonly severity: RevenueSpineSeverity;
  readonly affected_user_id: string | null;
  readonly event_count: 1;
}

const ERROR_CODES: Readonly<Record<string, RevenueSpineFailureCode>> = {
  '23505': 'unique_conflict',
  '40001': 'concurrent_update',
  '40P01': 'concurrent_update',
  '42501': 'permission_denied',
  '42703': 'schema_missing',
  '42P01': 'schema_missing',
  '53300': 'dependency_unavailable',
  '57014': 'timeout',
  '57P01': 'dependency_unavailable',
  AbortError: 'timeout',
  CLAIM_EXPIRED: 'claim_expired',
  CLAIM_NOT_FOUND: 'record_missing',
  ECONNREFUSED: 'dependency_unavailable',
  ECONNRESET: 'dependency_unavailable',
  ETIMEDOUT: 'timeout',
  FORBIDDEN: 'permission_denied',
  NOT_FOUND: 'record_missing',
  PROFILE_CONFLICT: 'ownership_conflict',
  SPOTIFY_IDENTITY_CONFLICT: 'ownership_conflict',
  StripeAPIError: 'dependency_unavailable',
  StripeConnectionError: 'dependency_unavailable',
  TimeoutError: 'timeout',
  UNAUTHORIZED: 'unauthenticated',
};

function classifyFailure(error: unknown): RevenueSpineFailureCode {
  // Drizzle/Stripe can wrap the actionable cause. Bound traversal also handles
  // cyclic causes. Never group on messages, stacks, SQL, or provider IDs.
  let current = error;
  for (let depth = 0; depth < 5; depth++) {
    if (!current || typeof current !== 'object') break;
    const value = current as Record<string, unknown>;
    const applicationCode =
      typeof value.message === 'string'
        ? /^\[([A-Z_]+)\]/.exec(value.message)?.[1]
        : undefined;
    for (const code of [
      value.code,
      value.errorCode,
      value.type,
      value.name,
      applicationCode,
    ]) {
      if (typeof code === 'string' && Object.hasOwn(ERROR_CODES, code)) {
        return ERROR_CODES[code];
      }
    }
    current = value.cause;
  }
  return 'unexpected_error';
}

const APP_USER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hashRevenueSpineUserId(userId: string): string {
  // Storybook stubs `server-only`, then evaluates this module in the browser
  // preview. Resolve SHA-256 only while hashing. A static node builtin import
  // is externalized and throws before the story mounts.
  const nodeProcess = globalThis.process;
  if (typeof nodeProcess?.getBuiltinModule !== 'function') {
    throw new Error('Revenue spine user hashing requires Node crypto');
  }
  return nodeProcess
    .getBuiltinModule('node:crypto')
    .createHash('sha256')
    .update(`revenue-spine:v1:${userId.toLowerCase()}`)
    .digest('hex');
}

export function buildRevenueSpineFailure(
  input: RevenueSpineFailureInput
): RevenueSpineFailure {
  const failureCode = input.failureCode ?? classifyFailure(input.error);
  if (
    !REVENUE_SPINE_STAGES.includes(input.stage) ||
    !REVENUE_SPINE_FAILURE_CODES.includes(failureCode) ||
    !['blocked', 'degraded', 'unknown'].includes(input.severity)
  ) {
    throw new Error('Invalid revenue spine failure contract');
  }
  const affectedUserId =
    typeof input.userId === 'string' && APP_USER_ID.test(input.userId)
      ? hashRevenueSpineUserId(input.userId)
      : null;

  return {
    contract: 'revenue-spine-failure/v1',
    stage: input.stage,
    failure_code: failureCode,
    fingerprint: `revenue-spine:v1:${input.stage}:${failureCode}`,
    severity: input.severity,
    affected_user_id: affectedUserId,
    event_count: 1,
  };
}

/**
 * One capture per occurrence; no process-local deduplication or user counters.
 * In Sentry, count() measures volume and count_unique(user.id) measures known
 * affected users. Unattributed occurrences contribute volume only.
 *
 * This event has no raw exception. The final scope processor reconstructs an
 * allowlisted envelope after SDK enrichment, removing inherited request data,
 * breadcrumbs, user emails/IPs, extras, and provider identifiers as well.
 */
export function captureRevenueSpineFailure(
  input: RevenueSpineFailureInput
): void {
  try {
    const failure = buildRevenueSpineFailure(input);
    const safeEvent: Sentry.ErrorEvent = {
      type: undefined,
      // The SDK's default Dedupe integration suppresses repeated `message`
      // events. A structured logentry preserves occurrences; fingerprint still
      // owns issue grouping without introducing per-occurrence identifiers.
      logentry: { message: failure.fingerprint },
      fingerprint: [failure.fingerprint],
      level: failure.severity === 'blocked' ? 'error' : 'warning',
      tags: {
        revenue_spine: failure.contract,
        revenue_stage: failure.stage,
        failure_code: failure.failure_code,
        impact_severity: failure.severity,
      },
      contexts: { revenue_spine: { ...failure } },
      user: failure.affected_user_id ? { id: failure.affected_user_id } : {},
    };
    Sentry.withScope(scope => {
      scope.addEventProcessor(event => ({
        ...safeEvent,
        event_id: event.event_id,
        timestamp: event.timestamp,
        environment: event.environment,
        release: event.release,
        platform: event.platform,
      }));
      Sentry.captureEvent(safeEvent);
    });
  } catch {
    // Observability must never change auth, ownership, or billing behavior.
  }
}
