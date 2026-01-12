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

interface FetchOptions extends RequestInit {
  /**
   * Timeout in milliseconds. Defaults to 10 seconds.
   */
  timeout?: number;
}

/**
 * Edge-compatible fetch with timeout and error handling.
 * Works in both Edge and Node runtimes.
 */
export async function fetchWithTimeout<T>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const { timeout = 10000, signal: externalSignal, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // Link external signal to our controller for proper cancellation
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new FetchError(
        `Fetch failed: ${response.status} ${response.statusText}`,
        response.status,
        response
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new FetchError('Request timeout', 408);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    // Clean up external signal listener if we added one without { once: true }
    // (not needed here since we use { once: true }, but good practice)
  }
}

/**
 * Custom error class for fetch failures with status code.
 */
export class FetchError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly response?: Response
  ) {
    super(message);
    this.name = 'FetchError';
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
    return (
      this.status === 408 || // Timeout
      this.status === 429 || // Rate limit
      this.status >= 500 // Server errors
    );
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
  options?: Omit<FetchOptions, 'signal'>
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
  options?: Omit<FetchOptions, 'method' | 'body'>
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
