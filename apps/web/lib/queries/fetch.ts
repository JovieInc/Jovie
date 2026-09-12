/**
 * Edge-compatible fetch utilities for TanStack Query.
 *
 * These utilities provide consistent fetch behavior that works in both
 * Edge runtime (public profiles) and Node runtime (dashboard/app).
 *
 * Note: Public profiles primarily use Next.js SSR caching (unstable_cache + ISR)
 * for optimal TTFB. These utilities are for cases where client-side
 * TanStack Query is used with server data.
 */

import {
  CSRF_HEADER_NAME,
  getBrowserCsrfToken,
  shouldAttachCsrfHeader,
} from '@/lib/security/csrf';

/**
 * Approved JSON response budget. Matches `DEFAULT_MAX_BODY_SIZE` in
 * `lib/http/parse-json.ts` (1MB). Do not invent a second limit.
 */
export const DEFAULT_JSON_MAX_BYTES = 1024 * 1024;

const DEADLINE_REASON = Symbol('jovie-fetch-deadline');

export type FetchFailureKind =
  | 'canceled'
  | 'deadline'
  | 'http'
  | 'network'
  | 'decode'
  | 'payload-limit';

export type FetchResponseSchema<T> = {
  parse(data: unknown): T;
};

interface FetchOptions<T = unknown> extends RequestInit {
  /**
   * Timeout in milliseconds. Defaults to 10 seconds.
   * JSON helpers keep this deadline through body read + decode.
   * `fetchWithTimeoutResponse` uses it as a first-byte deadline only;
   * the caller then owns the Response and must consume or cancel it.
   */
  timeout?: number;
  /**
   * Maximum decoded JSON response size in bytes.
   * Defaults to {@link DEFAULT_JSON_MAX_BYTES}.
   */
  maxBytes?: number;
  /**
   * Optional domain decoder. When provided, parsed JSON is validated
   * before it can be returned or written to a Query cache.
   */
  schema?: FetchResponseSchema<T>;
}

type FetchSession = {
  readonly controller: AbortController;
  readonly externalSignal: AbortSignal | undefined;
  deadlineFired: boolean;
  dispose: () => void;
};

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function abortErrorFrom(signal: AbortSignal): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return Object.assign(error, { cause: signal.reason });
}

function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(abortErrorFrom(signal));
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(abortErrorFrom(signal));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      value => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      error => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

function cancelResponseBody(response: Response | undefined): void {
  const cancel = response?.body?.cancel?.();
  if (cancel) {
    void cancel.catch(() => {});
  }
}

/** Link an external AbortSignal to a local AbortController. */
function linkSignal(
  controller: AbortController,
  externalSignal: AbortSignal | undefined
): () => void {
  if (!externalSignal) return () => {};
  if (externalSignal.aborted) {
    controller.abort(externalSignal.reason);
    return () => {};
  }

  const onAbort = () => {
    controller.abort(externalSignal.reason);
  };
  externalSignal.addEventListener('abort', onAbort, { once: true });
  return () => {
    externalSignal.removeEventListener('abort', onAbort);
  };
}

function createFetchSession(
  timeoutMs: number,
  externalSignal: AbortSignal | undefined
): FetchSession {
  const controller = new AbortController();
  const session: FetchSession = {
    controller,
    externalSignal,
    deadlineFired: false,
    dispose() {},
  };

  if (externalSignal?.aborted) {
    controller.abort(externalSignal.reason);
    return session;
  }

  const timeoutId = setTimeout(() => {
    session.deadlineFired = true;
    controller.abort(DEADLINE_REASON);
  }, timeoutMs);
  const unlink = linkSignal(controller, externalSignal);

  session.dispose = () => {
    clearTimeout(timeoutId);
    unlink();
  };
  return session;
}

function classifyFetchFailure(error: unknown, session: FetchSession): never {
  if (error instanceof FetchError) throw error;
  if (isAbortError(error)) {
    if (session.externalSignal?.aborted) {
      throw new FetchCanceledError(
        'Request canceled',
        session.externalSignal.reason
      );
    }
    if (
      session.deadlineFired ||
      session.controller.signal.reason === DEADLINE_REASON
    ) {
      throw new FetchDeadlineError('Request timeout', error);
    }
    throw new FetchCanceledError('Request canceled', error);
  }
  if (error instanceof TypeError) {
    throw new FetchNetworkError('Network request failed', error);
  }
  throw error;
}

function isNoContentStatus(status: number): boolean {
  return status === 204 || status === 205;
}

async function readFallbackJson(response: Response): Promise<unknown> {
  if (typeof response.json === 'function') {
    return response.json();
  }
  if (typeof response.text === 'function') {
    const text = await response.text();
    if (text.trim().length === 0) return undefined;
    return JSON.parse(text) as unknown;
  }
  return undefined;
}

async function readResponseText(
  response: Response,
  maxBytes: number,
  signal: AbortSignal
): Promise<string> {
  const contentLengthHeader =
    typeof response.headers?.get === 'function'
      ? response.headers.get('content-length')
      : null;
  if (contentLengthHeader) {
    const declared = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(declared) && declared > maxBytes) {
      cancelResponseBody(response);
      throw new FetchPayloadLimitError();
    }
  }

  const reader = response.body?.getReader?.();
  if (!reader) {
    if (typeof response.text === 'function') {
      return raceAbort(response.text(), signal);
    }
    const parsed = await raceAbort(readFallbackJson(response), signal);
    return parsed === undefined ? '' : JSON.stringify(parsed);
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      if (signal.aborted) {
        await reader.cancel().catch(() => {});
        throw abortErrorFrom(signal);
      }

      const { done, value } = await raceAbort(reader.read(), signal);
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new FetchPayloadLimitError();
      }
      chunks.push(value);
    }

    const combined = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder('utf-8').decode(combined);
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Already released after cancel.
    }
  }
}

function decodeJsonText(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new FetchDecodeError('Invalid JSON response', error);
    }
    throw error;
  }
}

function applySchema<T>(
  data: unknown,
  schema: FetchResponseSchema<T> | undefined
): T {
  if (!schema) {
    return data as T;
  }
  try {
    return schema.parse(data);
  } catch (error) {
    throw new FetchDecodeError('Invalid response shape', error);
  }
}

/** Try to extract a user-facing error message from a 4xx response body. */
async function extractClientErrorMessage(
  response: Response,
  maxBytes: number,
  signal: AbortSignal
): Promise<{
  message: string | undefined;
  parsedBody: Record<string, unknown> | undefined;
}> {
  try {
    const cloned = response.clone();
    const text = await readResponseText(cloned, maxBytes, signal);
    const parsedBody = decodeJsonText(text) as Record<string, unknown>;
    const message =
      parsedBody?.error && typeof parsedBody.error === 'string'
        ? parsedBody.error
        : undefined;
    return { message, parsedBody };
  } catch (error) {
    if (isAbortError(error) || error instanceof FetchDeadlineError) {
      throw error;
    }
    return { message: undefined, parsedBody: undefined };
  }
}

function getRequestHeaders(
  url: string,
  fetchOptions: RequestInit
): HeadersInit | undefined {
  if (!shouldAttachCsrfHeader(url, fetchOptions.method)) {
    return fetchOptions.headers;
  }

  const csrfToken = getBrowserCsrfToken();
  if (!csrfToken) {
    return fetchOptions.headers;
  }

  const csrfHeaders = new Headers(fetchOptions.headers);
  if (!csrfHeaders.has(CSRF_HEADER_NAME)) {
    csrfHeaders.set(CSRF_HEADER_NAME, csrfToken);
  }
  return csrfHeaders;
}

async function throwFetchErrorForResponse(
  response: Response,
  maxBytes: number,
  signal: AbortSignal
): Promise<never> {
  let message = getFetchErrorMessage(response);
  let parsedBody: Record<string, unknown> | undefined;

  try {
    if (response.status >= 400 && response.status < 500) {
      const extracted = await extractClientErrorMessage(
        response,
        maxBytes,
        signal
      );
      if (extracted.message) message = extracted.message;
      parsedBody = extracted.parsedBody;
    }
    throw new FetchError(message, response.status, response, parsedBody, {
      kind: 'http',
    });
  } finally {
    cancelResponseBody(response);
  }
}

function toRequestInit(options: FetchOptions): RequestInit {
  const fetchOptions: RequestInit = { ...options };
  delete (fetchOptions as FetchOptions).timeout;
  delete (fetchOptions as FetchOptions).maxBytes;
  delete (fetchOptions as FetchOptions).schema;
  delete fetchOptions.signal;
  return fetchOptions;
}

async function fetchOkResponse(
  url: string,
  options: FetchOptions,
  session: FetchSession
): Promise<Response> {
  const fetchOptions = toRequestInit(options);
  const maxBytes = options.maxBytes;
  const headers = getRequestHeaders(url, fetchOptions);
  const requestInit: RequestInit = {
    ...fetchOptions,
    signal: session.controller.signal,
  };
  if (headers !== undefined) {
    requestInit.headers = headers;
  }

  const response = await fetch(url, requestInit);
  if (!response.ok) {
    await throwFetchErrorForResponse(
      response,
      maxBytes ?? DEFAULT_JSON_MAX_BYTES,
      session.controller.signal
    );
  }
  return response;
}

/**
 * Edge-compatible fetch with timeout and error handling.
 * Works in both Edge and Node runtimes.
 *
 * The deadline stays active through body consumption and JSON/schema decode.
 * Synchronous `JSON.parse` / schema.parse work is not preempted by the timer.
 */
export async function fetchWithTimeout<T>(
  url: string,
  options: FetchOptions<T> = {}
): Promise<T> {
  const {
    timeout = 10000,
    signal: externalSignal,
    maxBytes = DEFAULT_JSON_MAX_BYTES,
    schema,
  } = options;

  if (externalSignal?.aborted) {
    throw new FetchCanceledError('Request canceled', externalSignal.reason);
  }

  const session = createFetchSession(timeout, externalSignal ?? undefined);
  try {
    const response = await fetchOkResponse(url, options, session);

    if (isNoContentStatus(response.status)) {
      cancelResponseBody(response);
      return applySchema(undefined, schema);
    }

    const hasStreamBody =
      response.body != null && typeof response.body.getReader === 'function';
    let data: unknown;
    if (!hasStreamBody && typeof response.json === 'function') {
      try {
        data = await raceAbort(response.json(), session.controller.signal);
      } catch (parseError) {
        if (parseError instanceof SyntaxError) {
          throw new FetchDecodeError('Invalid JSON response', parseError);
        }
        throw parseError;
      }
    } else {
      const text = await readResponseText(
        response,
        maxBytes,
        session.controller.signal
      );
      if (text.trim().length === 0) {
        return applySchema(undefined, schema);
      }
      data = decodeJsonText(text);
    }

    return applySchema(data, schema);
  } catch (error) {
    classifyFetchFailure(error, session);
  } finally {
    session.dispose();
  }
}

/**
 * Edge-compatible fetch with timeout that returns the raw Response.
 *
 * First-byte deadline only. After this resolves, the caller owns the
 * Response and must read or `body.cancel()` it. Idle/total stream time is
 * not bounded here so legitimate downloads and streams can outlive `timeout`.
 */
export async function fetchWithTimeoutResponse(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const { timeout = 10000, signal: externalSignal } = options;

  if (externalSignal?.aborted) {
    throw new FetchCanceledError('Request canceled', externalSignal.reason);
  }

  const session = createFetchSession(timeout, externalSignal ?? undefined);
  try {
    return await fetchOkResponse(url, options, session);
  } catch (error) {
    classifyFetchFailure(error, session);
  } finally {
    session.dispose();
  }
}

/**
 * Return a user-safe error message for a failed fetch response.
 * 5xx errors receive a generic message to avoid leaking server internals;
 * 4xx errors retain the standard status text for debugging.
 */
function getFetchErrorMessage(response: Response): string {
  // Avoid surfacing raw server failure copy to end users.
  // 5xx responses are still identified by status for retry and monitoring.
  if (response.status >= 500) {
    return 'Request failed due to a temporary server issue. Please try again.';
  }

  return `Fetch failed: ${response.status} ${response.statusText}`;
}

/**
 * Custom error class for fetch failures with status code.
 *
 * This is the canonical FetchError used across the app. It supports both
 * raw Response objects (from fetchWithTimeout) and string bodies (from dedupedFetch).
 */
export class FetchError extends Error {
  public readonly response?: Response;
  public readonly body?: string;
  /** Parsed JSON body from the error response (available for 4xx errors). */
  public readonly parsedBody?: Record<string, unknown>;
  public readonly kind: FetchFailureKind;
  public override readonly cause?: unknown;

  constructor(
    message: string,
    public readonly status: number,
    responseOrBody?: Response | string,
    parsedBody?: Record<string, unknown>,
    options?: { kind?: FetchFailureKind; cause?: unknown }
  ) {
    super(
      message,
      options?.cause !== undefined ? { cause: options.cause } : undefined
    );
    this.name = 'FetchError';
    this.kind = options?.kind ?? 'http';
    this.cause = options?.cause;
    if (typeof responseOrBody === 'string') {
      this.body = responseOrBody;
    } else {
      this.response = responseOrBody;
    }
    this.parsedBody = parsedBody;
  }

  /**
   * Check if error is a client error (4xx)
   */
  isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  /**
   * Check if error is a server error (5xx)
   */
  isServerError(): boolean {
    return this.status >= 500;
  }

  /**
   * Check if error is retryable (network issues, 5xx, 429)
   */
  isRetryable(): boolean {
    if (
      this.kind === 'canceled' ||
      this.kind === 'decode' ||
      this.kind === 'payload-limit'
    ) {
      return false;
    }
    if (this.kind === 'deadline' || this.kind === 'network') {
      return true;
    }
    return (
      this.status === 408 || // Timeout
      this.status === 429 || // Rate limit
      this.status >= 500 // Server errors
    );
  }
}

export class FetchCanceledError extends FetchError {
  constructor(message = 'Request canceled', cause?: unknown) {
    super(message, 0, undefined, undefined, { kind: 'canceled', cause });
    // Keep AbortError identity so TanStack Query treats unmount/cancel as
    // cancellation rather than a retryable failure.
    this.name = 'AbortError';
  }
}

export class FetchDeadlineError extends FetchError {
  constructor(message = 'Request timeout', cause?: unknown) {
    super(message, 408, undefined, undefined, { kind: 'deadline', cause });
    this.name = 'FetchDeadlineError';
  }
}

export class FetchHttpError extends FetchError {
  constructor(
    message: string,
    status: number,
    response?: Response,
    parsedBody?: Record<string, unknown>
  ) {
    super(message, status, response, parsedBody, { kind: 'http' });
    this.name = 'FetchHttpError';
  }
}

export class FetchNetworkError extends FetchError {
  constructor(message = 'Network request failed', cause?: unknown) {
    super(message, 0, undefined, undefined, { kind: 'network', cause });
    this.name = 'FetchNetworkError';
  }
}

export class FetchDecodeError extends FetchError {
  constructor(message = 'Invalid JSON response', cause?: unknown) {
    super(message, 502, undefined, undefined, { kind: 'decode', cause });
    this.name = 'FetchDecodeError';
  }
}

export class FetchPayloadLimitError extends FetchError {
  constructor(message = 'Response exceeded size limit', cause?: unknown) {
    super(message, 413, undefined, undefined, { kind: 'payload-limit', cause });
    this.name = 'FetchPayloadLimitError';
  }
}

/**
 * Create a query function with consistent error handling.
 * Use this to wrap fetch calls for TanStack Query.
 *
 * @example
 * const fetchProfile = createQueryFn<Profile>('/api/dashboard/profile');
 *
 * useQuery({
 *   queryKey: queryKeys.user.profile(),
 *   queryFn: fetchProfile,
 * });
 */
export function createQueryFn<T>(
  url: string,
  options?: Omit<FetchOptions<T>, 'signal'>
) {
  return async ({ signal }: { signal?: AbortSignal }): Promise<T> => {
    // Pass the signal directly to fetchWithTimeout which handles
    // linking it to the timeout controller properly
    return fetchWithTimeout<T>(url, {
      ...options,
      signal,
    });
  };
}

/**
 * Create a mutation function with consistent error handling.
 *
 * @example
 * const updateProfile = createMutationFn<ProfileInput, Profile>(
 *   '/api/dashboard/profile',
 *   'PATCH'
 * );
 *
 * useMutation({
 *   mutationFn: updateProfile,
 * });
 */
export function createMutationFn<TInput, TOutput>(
  url: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST',
  options?: Omit<FetchOptions<TOutput>, 'method' | 'body' | 'signal'>
) {
  return async (input: TInput): Promise<TOutput> => {
    return fetchWithTimeout<TOutput>(url, {
      ...options,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: JSON.stringify(input),
    });
  };
}
