export class BoundedFetchTimeoutError extends Error {
  readonly timeoutMs: number;
  readonly context: string;

  constructor(message: string, timeoutMs: number, context: string) {
    super(message);
    this.name = 'BoundedFetchTimeoutError';
    this.timeoutMs = timeoutMs;
    this.context = context;
  }
}

export async function boundedFetch(
  input: RequestInfo | URL,
  options: RequestInit & {
    readonly timeoutMs?: number;
    readonly context?: string;
  } = {}
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const context = options.context ?? 'bounded-fetch';
  const { timeoutMs: _t, context: _c, ...fetchOptions } = options;

  const response = await fetch(input, {
    ...fetchOptions,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok && response.status >= 500) {
    throw new BoundedFetchTimeoutError(
      `${context} upstream ${response.status}`,
      timeoutMs,
      context
    );
  }

  return response;
}
