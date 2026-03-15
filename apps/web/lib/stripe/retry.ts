import * as Sentry from '@sentry/nextjs';

const TRANSIENT_STRIPE_ERROR_TYPES = new Set([
  'StripeConnectionError',
  'StripeAPIError',
  'StripeRateLimitError',
  'StripeIdempotencyError',
]);

const RETRYABLE_STATUS_CODES = new Set([408, 409, 429, 500, 502, 503, 504]);

const TRANSIENT_MESSAGE_PATTERNS = [
  'connection',
  'timeout',
  'temporarily unavailable',
  'rate limit',
];

export interface StripeRetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

export class StripeRetryExhaustedError extends Error {
  readonly operation: string;
  readonly attempts: number;

  constructor(operation: string, attempts: number, cause: unknown) {
    super(`Stripe operation failed after ${attempts} attempts: ${operation}`);
    this.name = 'StripeRetryExhaustedError';
    this.operation = operation;
    this.attempts = attempts;
    this.cause = cause;
  }
}

function getErrorProperty(error: unknown, key: string): unknown {
  if (!error || typeof error !== 'object') return undefined;
  return (error as Record<string, unknown>)[key];
}

export function isTransientStripeError(error: unknown): boolean {
  const errorType = getErrorProperty(error, 'type');
  if (
    typeof errorType === 'string' &&
    TRANSIENT_STRIPE_ERROR_TYPES.has(errorType)
  ) {
    return true;
  }

  if (error instanceof Error && TRANSIENT_STRIPE_ERROR_TYPES.has(error.name)) {
    return true;
  }

  const statusCode = getErrorProperty(error, 'statusCode');
  if (
    typeof statusCode === 'number' &&
    RETRYABLE_STATUS_CODES.has(statusCode)
  ) {
    return true;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return TRANSIENT_MESSAGE_PATTERNS.some(pattern =>
      message.includes(pattern)
    );
  }

  return false;
}

function jitteredDelay(baseMs: number): Promise<void> {
  // Add +-25% jitter to prevent thundering herd on concurrent retries
  const jitter = baseMs * 0.25 * (2 * Math.random() - 1); // NOSONAR (S2245) - Non-security use: retry backoff jitter (±25%) to prevent thundering herd
  const ms = Math.max(0, Math.round(baseMs + jitter));
  return new Promise(resolve => globalThis.setTimeout(resolve, ms));
}

export async function withStripeRetry<T>(
  operation: string,
  fn: () => Promise<T>,
  options: StripeRetryOptions = {}
): Promise<T> {
  const { maxRetries = 2, baseDelayMs = 500 } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const attemptNumber = attempt + 1;
      const transient = isTransientStripeError(error);
      const isLastAttempt = attempt === maxRetries;

      Sentry.addBreadcrumb({
        category: 'stripe.retry',
        message: `Stripe operation ${operation} failed`,
        level: transient ? 'warning' : 'error',
        data: {
          operation,
          attempt: attemptNumber,
          maxAttempts: maxRetries + 1,
          transient,
          errorName: error instanceof Error ? error.name : 'unknown',
        },
      });

      if (!transient) {
        throw error;
      }

      if (isLastAttempt) {
        throw new StripeRetryExhaustedError(operation, attemptNumber, error);
      }

      await jitteredDelay(baseDelayMs * 2 ** attempt);
    }
  }

  throw new Error(`Unreachable retry state for operation ${operation}`);
}
