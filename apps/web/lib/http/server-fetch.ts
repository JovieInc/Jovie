import 'server-only';

import {
  type BoundedFetchOptions,
  type BoundedFetchRetryOptions,
  BoundedFetchTimeoutError,
  boundedFetch,
  isRetryableTransportError,
} from '@/lib/http/bounded-fetch';

export class ServerFetchTimeoutError extends BoundedFetchTimeoutError {
  constructor(message: string, timeoutMs: number, context: string) {
    super(message, timeoutMs, context);
    this.name = 'ServerFetchTimeoutError';
  }
}

export type ServerFetchRetryOptions = BoundedFetchRetryOptions;

type ServerFetchOptions = BoundedFetchOptions;

export { isRetryableTransportError };

export async function serverFetch(
  input: RequestInfo | URL,
  options: ServerFetchOptions = {}
): Promise<Response> {
  try {
    return await boundedFetch(input, options);
  } catch (error) {
    if (error instanceof BoundedFetchTimeoutError) {
      throw new ServerFetchTimeoutError(
        error.message,
        error.timeoutMs,
        error.context
      );
    }

    throw error;
  }
}
