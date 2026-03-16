/**
 * Shared resilience primitives for timeout and retry behavior.
 */

export interface TimeoutOptions {
  timeoutMs: number;
  context: string;
  timeoutMessage?: string;
}

export async function withTimeout<T>(
  promise: Promise<T>,
  options: TimeoutOptions
): Promise<T> {
  const { timeoutMs, context, timeoutMessage } = options;

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(timeoutMessage ?? `${context} timed out after ${timeoutMs}ms`)
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export interface RetryAttemptMeta {
  attempt: number;
  maxRetries: number;
  delayMs: number;
  error: Error;
}

export interface RetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  backoffMultiplier?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  isRetryable: (error: unknown) => boolean;
  getDelayOverrideMs?: (error: unknown) => number | undefined;
  onRetry?: (meta: RetryAttemptMeta) => void;
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function computeDelayMs(attempt: number, policy: RetryPolicy): number {
  const backoffMultiplier = policy.backoffMultiplier ?? 2;
  const jitterRatio = policy.jitterRatio ?? 0;
  const maxDelayMs = policy.maxDelayMs ?? Number.POSITIVE_INFINITY;

  const exponentialDelay =
    policy.baseDelayMs * Math.pow(backoffMultiplier, attempt - 1);

  const jitterRange = exponentialDelay * jitterRatio;
  const jitter = Math.random() * jitterRange * 2 - jitterRange; // NOSONAR (S2245) - Non-security use: exponential backoff jitter to prevent thundering herd

  return Math.max(0, Math.min(exponentialDelay + jitter, maxDelayMs));
}

export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  policy: RetryPolicy
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= policy.maxRetries + 1; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const normalizedError = normalizeError(error);
      lastError = normalizedError;

      const shouldRetry =
        attempt <= policy.maxRetries && policy.isRetryable(normalizedError);

      if (!shouldRetry) {
        throw normalizedError;
      }

      const overrideDelayMs = policy.getDelayOverrideMs?.(normalizedError);
      const delayMs = overrideDelayMs ?? computeDelayMs(attempt, policy);

      policy.onRetry?.({
        attempt,
        maxRetries: policy.maxRetries,
        delayMs,
        error: normalizedError,
      });

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError ?? new Error('Retry operation failed without an error');
}
