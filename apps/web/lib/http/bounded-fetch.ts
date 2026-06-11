import {
  executeWithRetry,
  type RetryPolicy,
} from '@/lib/resilience/primitives';

export class BoundedFetchTimeoutError extends Error {
  constructor(
    message: string,
    public readonly timeoutMs: number,
    public readonly context: string
  ) {
    super(message);
    this.name = 'BoundedFetchTimeoutError';
  }
}

class BoundedFetchRetryableStatusError extends Error {
  constructor(
    public readonly response: Response,
    public readonly context: string
  ) {
    super(`${context} returned retryable status ${response.status}`);
    this.name = 'BoundedFetchRetryableStatusError';
  }
}

export interface BoundedFetchRetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryOn?: (params: { response?: Response; error?: Error }) => boolean;
}

export type BoundedFetchOptions = RequestInit & {
  timeoutMs?: number;
  context?: string;
  retry?: BoundedFetchRetryOptions;
};

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function cancelResponseBody(response: Response): void {
  const cancelPromise = response.body?.cancel();
  if (cancelPromise) {
    void cancelPromise.catch(() => {});
  }
}

/**
 * Limits retries on mutating requests to transport-layer failures only.
 */
export function isRetryableTransportError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error instanceof BoundedFetchTimeoutError ||
    error.name === 'TypeError' ||
    error.name === 'FetchError' ||
    /network|fetch failed|econn|socket|dns/i.test(error.message)
  );
}

function isRetryableError(error: Error): boolean {
  if (error instanceof BoundedFetchRetryableStatusError) {
    return true;
  }

  return isRetryableTransportError(error);
}

/**
 * Edge- and Node-compatible fetch with timeout and optional retry.
 *
 * Use this in middleware/proxy paths. Server route handlers should prefer
 * `serverFetch` from `@/lib/http/server-fetch` (same behavior, server-only guard).
 */
export async function boundedFetch(
  input: RequestInfo | URL,
  options: BoundedFetchOptions = {}
): Promise<Response> {
  const {
    timeoutMs = 5000,
    context = 'External request',
    retry,
    signal: externalSignal,
    ...fetchOptions
  } = options;

  const performFetch = async (): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const abortFromExternalSignal = () => controller.abort();

    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', abortFromExternalSignal, {
          once: true,
        });
      }
    }

    try {
      const response = await fetch(input, {
        ...fetchOptions,
        signal: controller.signal,
      });

      const shouldRetry =
        retry &&
        isRetryableStatus(response.status) &&
        (retry.retryOn?.({ response }) ?? true);

      if (shouldRetry) {
        throw new BoundedFetchRetryableStatusError(response, context);
      }

      return response;
    } catch (error) {
      if (error instanceof BoundedFetchRetryableStatusError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new BoundedFetchTimeoutError(
          `${context} timed out after ${timeoutMs}ms`,
          timeoutMs,
          context
        );
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', abortFromExternalSignal);
      }
    }
  };

  if (!retry || retry.maxRetries <= 0) {
    try {
      return await performFetch();
    } catch (error) {
      if (error instanceof BoundedFetchRetryableStatusError) {
        return error.response;
      }

      throw error;
    }
  }

  const policy: RetryPolicy = {
    maxRetries: retry.maxRetries,
    baseDelayMs: retry.baseDelayMs,
    maxDelayMs: retry.maxDelayMs,
    backoffMultiplier: retry.backoffMultiplier,
    isRetryable: error => {
      if (!(error instanceof Error)) {
        return false;
      }

      if (!isRetryableError(error)) {
        return false;
      }

      return retry.retryOn?.({ error }) ?? true;
    },
    onRetry: ({ error }) => {
      if (error instanceof BoundedFetchRetryableStatusError) {
        cancelResponseBody(error.response);
      }
    },
  };

  try {
    return await executeWithRetry(performFetch, policy);
  } catch (error) {
    if (error instanceof BoundedFetchRetryableStatusError) {
      return error.response;
    }

    throw error;
  }
}
