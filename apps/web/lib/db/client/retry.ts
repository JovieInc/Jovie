/**
 * Database Retry Logic
 *
 * Retry logic for transient database failures with exponential backoff.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { PERFORMANCE_THRESHOLDS } from '../config';
import { getDeepErrorMessage, unwrapPgError } from '../errors';
import { dbCircuitBreaker } from './circuit-breaker';
import { logDbError, logDbInfo } from './logging';

const DB_CONFIG = {
  maxRetries: PERFORMANCE_THRESHOLDS.maxRetries,
  retryDelay: PERFORMANCE_THRESHOLDS.retryDelay,
  retryBackoffMultiplier: PERFORMANCE_THRESHOLDS.retryBackoffMultiplier,
} as const;

/**
 * Pre-compiled regex patterns for retryable error detection.
 * Compiled once at module load time for optimal performance.
 */
const RETRYABLE_ERROR_PATTERNS: readonly RegExp[] = [
  /connection.*reset/i,
  /connection.*terminated/i,
  /connection.*closed/i,
  /server\s+conn\s+crashed\??/i,
  /connection.*unexpectedly/i,
  /network/i,
  /econnreset/i,
  /econnrefused/i,
  /etimedout/i,
  /socket hang up/i,
  /database is starting up/i,
  /too many connections/i,
  /connection pool exhausted/i,
  /client has encountered a connection error/i,
  /terminating connection due to administrator command/i,
] as const;

const RETRYABLE_PG_CODES = new Set(['53300', '57P01', '57P03']);

function isRetryablePgCode(code: string | null): boolean {
  if (!code) {
    return false;
  }

  return code.startsWith('08') || RETRYABLE_PG_CODES.has(code);
}

type RetryableErrorCandidate = {
  message?: unknown;
  name?: unknown;
};

function getErrorText(error: unknown): string[] {
  if (error instanceof Error) {
    return [error.message, error.name];
  }

  if (typeof error !== 'object' || error === null) {
    return [];
  }

  const candidate = error as RetryableErrorCandidate;
  return [candidate.message, candidate.name].flatMap(value =>
    typeof value === 'string' ? [value] : []
  );
}

/**
 * Check if an error is retryable (transient)
 */
export function isRetryableError(error: unknown): boolean {
  const code = unwrapPgError(error).code;
  // A SQLSTATE is authoritative; query text may itself contain transport words.
  // Conflicts (40001/40P01) belong to the full-transaction retry owner.
  if (code && /^[0-9A-Z]{5}$/.test(code)) {
    return isRetryablePgCode(code);
  }

  const errorText = [...getErrorText(error), getDeepErrorMessage(error)].filter(
    Boolean
  );
  return RETRYABLE_ERROR_PATTERNS.some(pattern =>
    errorText.some(value => pattern.test(value))
  );
}

export interface ReadRetryOptions {
  readonly operation: 'read';
  readonly maxAttempts?: number;
  /** Retry admission window, including elapsed SQL time and backoff. */
  readonly retryBudgetMs: number;
}

const retryOwner = new AsyncLocalStorage<boolean>();

/**
 * Unclassified operations (including the legacy numeric argument) run once:
 * a transport failure may mean a write committed without acknowledgment.
 * Only explicitly declared, side-effect-free reads may replay. Callbacks must
 * enforce SQL cancellation separately; this window only bounds retry admission.
 * Transaction conflicts belong to the full-transaction primitive, never here.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  context: string,
  policy: number | ReadRetryOptions = DB_CONFIG.maxRetries
): Promise<T> {
  const readPolicy = typeof policy === 'object' ? policy : undefined;
  const requestedAttempts =
    readPolicy?.maxAttempts ??
    (typeof policy === 'number' ? policy : DB_CONFIG.maxRetries);
  if (!Number.isInteger(requestedAttempts) || requestedAttempts < 1) {
    throw new RangeError('Expected a positive integer attempt count.');
  }
  if (
    readPolicy &&
    (!Number.isFinite(readPolicy.retryBudgetMs) ||
      readPolicy.retryBudgetMs <= 0)
  ) {
    throw new RangeError('Expected a positive finite retry budget.');
  }

  // The outermost wrapper owns retries and circuit accounting for the operation.
  if (retryOwner.getStore()) return operation();
  const maxAttempts = readPolicy?.operation === 'read' ? requestedAttempts : 1;
  const deadline = performance.now() + (readPolicy?.retryBudgetMs ?? 0);

  return retryOwner.run(true, () =>
    dbCircuitBreaker.execute(
      async () => {
        for (let attempt = 1; ; attempt++) {
          try {
            const result = await operation();
            if (attempt > 1) {
              logDbInfo(
                'retry_success',
                `Operation succeeded on attempt ${attempt}`,
                { context }
              );
            }
            return result;
          } catch (error) {
            const transient = isRetryableError(error);
            // NOSONAR (S2245) - jitter spreads retry load; not security-sensitive.
            const jitter = 0.75 + Math.random() * 0.5;
            const delayMs =
              DB_CONFIG.retryDelay *
              DB_CONFIG.retryBackoffMultiplier ** (attempt - 1) *
              jitter;
            const willRetry =
              transient &&
              attempt < maxAttempts &&
              performance.now() + delayMs < deadline;
            logDbError(
              'retry_attempt',
              error,
              {
                context,
                operation: readPolicy?.operation ?? 'unclassified',
                retryBudgetMs: readPolicy?.retryBudgetMs,
                attempt,
                maxRetries: maxAttempts,
                isRetryable: transient,
                willRetry,
              },
              { asBreadcrumb: transient }
            );
            if (!willRetry) throw error;
            await new Promise(resolve => setTimeout(resolve, delayMs));
            // Timer scheduling can overshoot the window; never start late SQL.
            if (performance.now() >= deadline) {
              logDbError(
                'retry_budget_exhausted',
                error,
                { context, attempt },
                { asBreadcrumb: true }
              );
              throw error;
            }
          }
        }
      },
      { shouldCountFailure: isRetryableError }
    )
  );
}

export { DB_CONFIG };
