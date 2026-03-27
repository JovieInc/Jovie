import 'server-only';

import {
  executeWithRetry,
  type RetryPolicy,
} from '@/lib/resilience/primitives';

export class ServerFetchTimeoutError extends Error {
  constructor(
    message: string,
    public readonly timeoutMs: number,
    public readonly context: string
  ) {
    super(message);
    this.name = 'ServerFetchTimeoutError';
  }
}

class ServerFetchRetryableStatusError extends Error {
  constructor(
    public readonly response: Response,
    public readonly context: string
  ) {
    super(`${context} returned retryable status ${response.status}`);
    this.name = 'ServerFetchRetryableStatusError';
  }
}

export interface ServerFetchRetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryOn?: (params: { response?: Response; error?: Error }) => boolean;
}

type ServerFetchOptions = RequestInit & {
  timeoutMs?: number;
  context?: string;
  retry?: ServerFetchRetryOptions;
};

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function isRetryableError(error: Error): boolean {
  if (
    error instanceof ServerFetchTimeoutError ||
    error instanceof ServerFetchRetryableStatusError
  ) {
    return true;
  }

  return (
    error.name === 'TypeError' ||
    error.name === 'FetchError' ||
    /network|fetch failed|econn|socket|dns/i.test(error.message)
  );
}

export async function serverFetch(
  input: RequestInfo | URL,
  options: ServerFetchOptions = {}
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
        throw new ServerFetchRetryableStatusError(response, context);
      }

      return response;
    } catch (error) {
      if (error instanceof ServerFetchRetryableStatusError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new ServerFetchTimeoutError(
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
      if (error instanceof ServerFetchRetryableStatusError) {
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
  };

  try {
    return await executeWithRetry(performFetch, policy);
  } catch (error) {
    if (error instanceof ServerFetchRetryableStatusError) {
      return error.response;
    }

    throw error;
  }
}
