import { AsyncRetryer } from '@tanstack/react-pacer';
import {
  classifyError,
  getHttpStatusCode,
  type PacerErrorType,
} from '../errors';

const NON_RETRYABLE_ERROR = Symbol('pacer.nonRetryableError');

interface RetryWrappedError extends Error {
  [NON_RETRYABLE_ERROR]?: true;
}

export interface RetryOperationOptions {
  maxAttempts?: number;
  baseWait?: number;
  backoff?: 'fixed' | 'linear' | 'exponential';
  shouldRetry?: (error: unknown) => boolean;
}

export function shouldRetryPacerNetworkError(error: unknown): boolean {
  const errorType: PacerErrorType = classifyError(error);

  if (errorType === 'abort') return false;
  if (errorType === 'network' || errorType === 'timeout') return true;

  if (errorType === 'http') {
    const statusCode = getHttpStatusCode(error);
    if (statusCode === undefined) return true;
    return statusCode >= 500;
  }

  return false;
}

/**
 * Execute an async network operation with AsyncRetryer.
 */
export async function executeWithRetry<TResult>(
  operation: () => Promise<TResult>,
  options: RetryOperationOptions = {}
): Promise<TResult> {
  const {
    maxAttempts = 3,
    baseWait = 250,
    backoff = 'exponential',
    shouldRetry = shouldRetryPacerNetworkError,
  } = options;

  const retryer = new AsyncRetryer(
    async () => {
      try {
        return await operation();
      } catch (error) {
        if (!shouldRetry(error)) {
          const wrapped =
            error instanceof Error
              ? error
              : new Error('Non-retryable operation failure', { cause: error });
          (wrapped as RetryWrappedError)[NON_RETRYABLE_ERROR] = true;
          throw wrapped;
        }

        throw error;
      }
    },
    {
      maxAttempts: retryerInstance => {
        const lastError = retryerInstance.store.state.lastError as
          | RetryWrappedError
          | undefined;
        return lastError?.[NON_RETRYABLE_ERROR] ? 1 : maxAttempts;
      },
      baseWait,
      backoff,
      throwOnError: 'last',
    }
  );

  const result = await retryer.execute();

  if (result === undefined) {
    const lastError = retryer.store.state.lastError;
    if (lastError) {
      throw lastError;
    }
    throw new Error('Retry operation failed to return a result');
  }

  return result;
}
