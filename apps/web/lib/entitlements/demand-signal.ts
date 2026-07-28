/**
 * Demand-signal logging for expected plan/entitlement denials (JOV-3861).
 *
 * Blocked upgrade attempts are product signal, not errors. Persist a breadcrumb
 * + structured analytics event so Eve/ops can rank paywall demand without
 * polluting Sentry error volume. Full re-engagement ledger is JOV-3382.
 */

import * as Sentry from '@sentry/nextjs';
import { trackEvent } from '@/lib/analytics/runtime-aware';
import { logger } from '@/lib/utils/logger';

export type EntitlementDenialSource =
  | 'chat-tool-throw'
  | 'chat-tool-locked-stub'
  | 'server-action';

export interface EntitlementDenialSignal {
  readonly gate: string;
  readonly source: EntitlementDenialSource;
  readonly toolName?: string;
  readonly code?: string;
  readonly planRequired?: string;
  readonly userId?: string | null;
  readonly message?: string;
}

/**
 * Log an expected entitlement denial as demand signal (never as a Sentry error).
 */
export function logEntitlementDenial(signal: EntitlementDenialSignal): void {
  const data = {
    gate: signal.gate,
    source: signal.source,
    toolName: signal.toolName ?? null,
    code: signal.code ?? null,
    planRequired: signal.planRequired ?? null,
    userId: signal.userId ?? null,
    message: signal.message ?? null,
  };

  logger.info('[entitlement-denial] plan gate denied', data);

  Sentry.addBreadcrumb({
    category: 'entitlement-denial',
    message: 'plan_gate_denied',
    level: 'info',
    data,
  });

  void trackEvent('entitlement_denial', data, signal.userId ?? undefined).catch(
    () => {
      // Analytics must never take down the request path.
    }
  );
}
