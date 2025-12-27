/**
 * Core Fetcher Function
 *
 * Base fetcher that handles JSON serialization, Content-Type headers,
 * response parsing, and standardized error extraction.
 */

import {
  type ApiClientConfig,
  ApiError,
  ApiErrorCode,
  type ApiErrorResponse,
  type ApiResponse,
  type ApiResult,
  DEFAULT_API_CLIENT_CONFIG,
  type HttpMethod,
  isApiErrorResponse,
  type RequestOptions,
  type RequestWithBodyOptions,
} from './types';

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Merge headers from multiple sources
 */
function mergeHeaders(
  ...sources: (HeadersInit | undefined)[]
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const source of sources) {
    if (!source) continue;

    if (source instanceof Headers) {
      source.forEach((value, key) => {
        result[key] = value;
      });
    } else if (Array.isArray(source)) {
      for (const [key, value] of source) {
        result[key] = value;
      }
    } else {
      Object.assign(result, source);
    }
  }

  return result;
}

/**
 * Create an AbortController with timeout support
 */
function createTimeoutController(
  timeout: number | undefined,
  existingSignal: AbortSignal | undefined
): { controller: AbortController; cleanup: () => void } {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  // Set up timeout
  if (timeout && timeout > 0) {
    timeoutId = setTimeout(() => {
      controller.abort(new Error('Request timed out'));
    }, timeout);
  }

  // Forward existing signal abort
  if (existingSignal) {
    if (existingSignal.aborted) {
      controller.abort(existingSignal.reason);
    } else {
      existingSignal.addEventListener('abort', () => {
        controller.abort(existingSignal.reason);
      });
    }
  }

  const cleanup = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  };

  return { controller, cleanup };
}

/**
 * Parse a response body as JSON, handling errors gracefully
 */
async function parseJsonResponse<T>(
  response: Response
): Promise<{ data: T | null; error: Error | null }> {
  // Handle empty responses (204 No Content, etc.)
  const contentLength = response.headers.get('content-length');
  if (contentLength === '0' || response.status === 204) {
    return { data: null, error: null };
  }

  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    // For non-JSON responses, try to parse anyway in case header is wrong
    const text = await response.text();
    if (!text || text.trim() === '') {
      return { data: null, error: null };
    }
    try {
      return { data: JSON.parse(text) as T, error: null };
    } catch {
      // Not JSON, return null data
      return { data: null, error: null };
    }
  }

  try {
    const data = (await response.json()) as T;
    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Failed to parse JSON'),
    };
  }
}

/**
 * Extract error information from a response body
 */
function extractErrorFromBody(body: unknown): ApiErrorResponse | undefined {
  if (isApiErrorResponse(body)) {
    return body;
  }
  return undefined;
}

// =============================================================================
// Core Fetcher
// =============================================================================

/**
 * Internal fetch function that performs the actual request
 */
async function doFetch<T>(
  url: string,
  method: HttpMethod,
  options: RequestWithBodyOptions,
  config: ApiClientConfig
): Promise<ApiResponse<T>> {
  const resolvedConfig = {
    baseUrl: config.baseUrl ?? DEFAULT_API_CLIENT_CONFIG.baseUrl,
    defaultHeaders:
      config.defaultHeaders ?? DEFAULT_API_CLIENT_CONFIG.defaultHeaders,
    timeout: config.timeout ?? DEFAULT_API_CLIENT_CONFIG.timeout,
    credentials: config.credentials ?? DEFAULT_API_CLIENT_CONFIG.credentials,
    throwOnError: config.throwOnError ?? DEFAULT_API_CLIENT_CONFIG.throwOnError,
  };

  const fullUrl = resolvedConfig.baseUrl
    ? `${resolvedConfig.baseUrl}${url}`
    : url;

  const hasBody = options.body !== undefined;

  // Merge all headers
  const headers = mergeHeaders(
    resolvedConfig.defaultHeaders,
    hasBody ? { 'Content-Type': 'application/json' } : undefined,
    options.headers
  );

  // Create timeout controller
  const timeout = options.timeout ?? resolvedConfig.timeout;
  const { controller, cleanup } = createTimeoutController(
    timeout,
    options.signal
  );

  try {
    // Build fetch options - include Next.js-specific 'next' option if provided
    const fetchOptions: RequestInit & { next?: RequestOptions['next'] } = {
      method,
      headers,
      body: hasBody ? JSON.stringify(options.body) : undefined,
      credentials: options.credentials ?? resolvedConfig.credentials,
      signal: controller.signal,
      cache: options.cache,
    };

    // Add Next.js-specific options if provided
    if (options.next) {
      fetchOptions.next = options.next;
    }

    const response = await fetch(fullUrl, fetchOptions as RequestInit);

    // Parse the response body
    const { data, error: parseError } = await parseJsonResponse<T>(response);

    // Handle parse errors
    if (parseError) {
      throw ApiError.fromJsonParseError(parseError);
    }

    // Handle non-2xx responses
    if (!response.ok) {
      const errorResponse = extractErrorFromBody(data);
      const apiError = ApiError.fromResponse(response.status, errorResponse);

      // Call error callback if provided
      config.onError?.(apiError);

      if (resolvedConfig.throwOnError) {
        throw apiError;
      }
    }

    // Build successful response
    const apiResponse: ApiResponse<T> = {
      data: data as T,
      status: response.status,
      headers: response.headers,
    };

    // Call response callback if provided
    if (config.onResponse) {
      return config.onResponse(apiResponse);
    }

    return apiResponse;
  } catch (error) {
    // Re-throw ApiErrors as-is
    if (error instanceof ApiError) {
      throw error;
    }

    // Convert fetch errors to ApiError
    if (error instanceof Error) {
      const apiError = ApiError.fromNetworkError(error);
      config.onError?.(apiError);
      throw apiError;
    }

    // Unknown error
    throw new ApiError('An unexpected error occurred', {
      code: ApiErrorCode.UNKNOWN_ERROR,
    });
  } finally {
    cleanup();
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Configuration for the fetcher module
 */
let globalConfig: ApiClientConfig = {};

/**
 * Configure global defaults for all fetch requests
 */
export function configureGlobalFetcher(config: ApiClientConfig): void {
  globalConfig = { ...globalConfig, ...config };
}

/**
 * Reset global configuration to defaults
 */
export function resetGlobalFetcher(): void {
  globalConfig = {};
}

/**
 * Create a fetcher with custom configuration
 */
export function createFetcher(config: ApiClientConfig = {}) {
  const mergedConfig = { ...globalConfig, ...config };

  return {
    /**
     * Perform a GET request
     */
    async get<T>(url: string, options: RequestOptions = {}): Promise<T> {
      const response = await doFetch<T>(url, 'GET', options, mergedConfig);
      return response.data;
    },

    /**
     * Perform a POST request
     */
    async post<T>(
      url: string,
      options: RequestWithBodyOptions = {}
    ): Promise<T> {
      const response = await doFetch<T>(url, 'POST', options, mergedConfig);
      return response.data;
    },

    /**
     * Perform a PUT request
     */
    async put<T>(
      url: string,
      options: RequestWithBodyOptions = {}
    ): Promise<T> {
      const response = await doFetch<T>(url, 'PUT', options, mergedConfig);
      return response.data;
    },

    /**
     * Perform a PATCH request
     */
    async patch<T>(
      url: string,
      options: RequestWithBodyOptions = {}
    ): Promise<T> {
      const response = await doFetch<T>(url, 'PATCH', options, mergedConfig);
      return response.data;
    },

    /**
     * Perform a DELETE request
     */
    async delete<T>(
      url: string,
      options: RequestWithBodyOptions = {}
    ): Promise<T> {
      const response = await doFetch<T>(url, 'DELETE', options, mergedConfig);
      return response.data;
    },

    /**
     * Perform a GET request returning full response details
     */
    async getWithResponse<T>(
      url: string,
      options: RequestOptions = {}
    ): Promise<ApiResponse<T>> {
      return doFetch<T>(url, 'GET', options, mergedConfig);
    },

    /**
     * Perform a POST request returning full response details
     */
    async postWithResponse<T>(
      url: string,
      options: RequestWithBodyOptions = {}
    ): Promise<ApiResponse<T>> {
      return doFetch<T>(url, 'POST', options, mergedConfig);
    },

    /**
     * Perform a PUT request returning full response details
     */
    async putWithResponse<T>(
      url: string,
      options: RequestWithBodyOptions = {}
    ): Promise<ApiResponse<T>> {
      return doFetch<T>(url, 'PUT', options, mergedConfig);
    },

    /**
     * Perform a PATCH request returning full response details
     */
    async patchWithResponse<T>(
      url: string,
      options: RequestWithBodyOptions = {}
    ): Promise<ApiResponse<T>> {
      return doFetch<T>(url, 'PATCH', options, mergedConfig);
    },

    /**
     * Perform a DELETE request returning full response details
     */
    async deleteWithResponse<T>(
      url: string,
      options: RequestWithBodyOptions = {}
    ): Promise<ApiResponse<T>> {
      return doFetch<T>(url, 'DELETE', options, mergedConfig);
    },

    /**
     * Perform a request and return a result type (ok: true/false)
     * instead of throwing on errors
     */
    async request<T>(
      method: HttpMethod,
      url: string,
      options: RequestWithBodyOptions = {}
    ): Promise<ApiResult<T>> {
      try {
        const response = await doFetch<T>(url, method, options, {
          ...mergedConfig,
          throwOnError: true,
        });
        return {
          ok: true,
          data: response.data,
          status: response.status,
        };
      } catch (error) {
        if (error instanceof ApiError) {
          return {
            ok: false,
            error,
          };
        }
        // Wrap unexpected errors
        return {
          ok: false,
          error: new ApiError('An unexpected error occurred', {
            code: ApiErrorCode.UNKNOWN_ERROR,
            cause: error instanceof Error ? error : undefined,
          }),
        };
      }
    },
  };
}

/**
 * Default fetcher instance using global configuration
 */
export const fetcher = createFetcher();

/**
 * Convenience methods that use the default fetcher
 */
export const get = fetcher.get;
export const post = fetcher.post;
export const put = fetcher.put;
export const patch = fetcher.patch;
export const del = fetcher.delete;
export const request = fetcher.request;
