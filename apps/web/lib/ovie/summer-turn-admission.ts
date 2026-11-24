import { z } from 'zod';
import { logSummerBridgeEvent } from '@/lib/ovie/summer-production-pin';

/**
 * Admission attempts when the first hop never reached Summer (a network error
 * or an edge 5xx with no deployment header). The event id is fixed per client
 * turn and Summer replays it idempotently, so a resend cannot start a second
 * run. A body that stalls after Summer answered is not retried here: the
 * result endpoint reconciles it.
 */
export const SUMMER_ADMISSION_ATTEMPTS = 3;
export const ADMISSION_RETRY_BASE_MS = 400;

/**
 * A snapshot older than this is not "current company state". Preview and
 * staging never run the cron that refreshes it, so Summer quoted a frozen
 * 2026-09-27 GitHub read as current (2026-11-22). Send nothing instead and let
 * her read live with her own tools.
 */
export const COMPANY_STATE_MAX_AGE_MS = 30 * 60_000;

export function isCurrentCompanySnapshot(
  generatedAt: string,
  nowMs: number
): boolean {
  const at = Date.parse(generatedAt);
  return Number.isFinite(at) && nowMs - at <= COMPANY_STATE_MAX_AGE_MS;
}

export function summerErrorCode(error: unknown): string {
  if (error instanceof z.ZodError) return 'invalid_summer_contract';
  if (error instanceof Error) return error.message.slice(0, 120) || error.name;
  return 'unknown_error';
}

/** Never reached Summer, so resending the same event id is safe. */
class SummerTransportError extends Error {
  constructor(readonly cause: unknown) {
    super('summer_transport_failed');
    this.name = 'SummerTransportError';
  }
}

function waitBeforeRetry(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });
}

export interface SummerAdmission {
  readonly eventId: string;
  /** Sends the same admission body every time. */
  readonly send: () => Promise<Response>;
  /** Throws `summer_http_error` (or anything else) when the hop is not Summer's. */
  readonly verify: (response: Response) => Promise<void>;
  readonly attempts: number;
  readonly retryDelayMs: number;
  readonly signal?: AbortSignal;
}

/**
 * Admits one founder turn, resending only a hop that never reached a Summer
 * deployment: a network error or an edge 5xx. A 4xx is a refusal, not luck.
 * Every failed attempt is logged with its cause so no failure is silent.
 */
export async function admitWithRetry(
  admission: SummerAdmission
): Promise<Response> {
  const attempts = Math.max(1, admission.attempts);
  for (let attempt = 1; ; attempt += 1) {
    let response: Response | undefined;
    try {
      try {
        response = await admission.send();
      } catch (error) {
        throw new SummerTransportError(error);
      }
      await admission.verify(response);
      return response;
    } catch (error) {
      const retryable =
        error instanceof SummerTransportError ||
        (error instanceof Error &&
          error.message === 'summer_http_error' &&
          (response?.status ?? 0) >= 500);
      const aborted = admission.signal?.aborted ?? false;
      const willRetry = retryable && attempt < attempts && !aborted;
      logSummerBridgeEvent({
        event: 'summer_admission_failed',
        eventId: admission.eventId,
        attempt,
        cause:
          error instanceof SummerTransportError
            ? summerErrorCode(error.cause)
            : `${summerErrorCode(error)}:${response?.status ?? 'none'}`,
        willRetry,
      });
      if (!willRetry)
        throw error instanceof SummerTransportError ? error.cause : error;
      await waitBeforeRetry(admission.retryDelayMs * attempt, admission.signal);
    }
  }
}
