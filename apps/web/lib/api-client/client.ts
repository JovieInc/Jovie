/**
 * API Client Factory and Configuration
 *
 * Main ApiClient class that provides a clean interface for making requests
 * to different endpoint groups (dashboard, admin). Includes base URL
 * configuration and default options.
 */

import { createFetcher } from './fetcher';
import {
  ApiClientConfig,
  ApiError,
  ApiResponse,
  ApiResult,
  HttpMethod,
  RequestOptions,
  RequestWithBodyOptions,
} from './types';

// =============================================================================
// Endpoint Group Types
// =============================================================================

/**
 * Represents a group of related API endpoints (e.g., dashboard, admin)
 * Each group has its own base path prefix.
 */
export interface EndpointGroup {
  /** The base path for this endpoint group (e.g., '/api/dashboard') */
  readonly basePath: string;

  /**
   * Make a GET request to this endpoint group
   * @param path - Path relative to the group's base path
   * @param options - Request options
   */
  get<T>(path: string, options?: RequestOptions): Promise<T>;

  /**
   * Make a POST request to this endpoint group
   * @param path - Path relative to the group's base path
   * @param options - Request options with optional body
   */
  post<T>(path: string, options?: RequestWithBodyOptions): Promise<T>;

  /**
   * Make a PUT request to this endpoint group
   * @param path - Path relative to the group's base path
   * @param options - Request options with optional body
   */
  put<T>(path: string, options?: RequestWithBodyOptions): Promise<T>;

  /**
   * Make a PATCH request to this endpoint group
   * @param path - Path relative to the group's base path
   * @param options - Request options with optional body
   */
  patch<T>(path: string, options?: RequestWithBodyOptions): Promise<T>;

  /**
   * Make a DELETE request to this endpoint group
   * @param path - Path relative to the group's base path
   * @param options - Request options with optional body
   */
  delete<T>(path: string, options?: RequestWithBodyOptions): Promise<T>;

  /**
   * Make a request returning a result type (ok/error pattern)
   * @param method - HTTP method
   * @param path - Path relative to the group's base path
   * @param options - Request options
   */
  request<T>(
    method: HttpMethod,
    path: string,
    options?: RequestWithBodyOptions
  ): Promise<ApiResult<T>>;

  /**
   * Make a GET request returning full response details
   * @param path - Path relative to the group's base path
   * @param options - Request options
   */
  getWithResponse<T>(
    path: string,
    options?: RequestOptions
  ): Promise<ApiResponse<T>>;

  /**
   * Make a POST request returning full response details
   * @param path - Path relative to the group's base path
   * @param options - Request options with optional body
   */
  postWithResponse<T>(
    path: string,
    options?: RequestWithBodyOptions
  ): Promise<ApiResponse<T>>;

  /**
   * Make a PUT request returning full response details
   * @param path - Path relative to the group's base path
   * @param options - Request options with optional body
   */
  putWithResponse<T>(
    path: string,
    options?: RequestWithBodyOptions
  ): Promise<ApiResponse<T>>;
}

// =============================================================================
// Endpoint Group Implementation
// =============================================================================

/**
 * Create an endpoint group with a specific base path
 */
function createEndpointGroup(
  basePath: string,
  fetcher: ReturnType<typeof createFetcher>
): EndpointGroup {
  // Ensure basePath doesn't have a trailing slash for consistent URL building
  const normalizedBasePath = basePath.endsWith('/')
    ? basePath.slice(0, -1)
    : basePath;

  /**
   * Build full URL from the base path and relative path
   */
  function buildUrl(path: string): string {
    // Handle empty paths
    if (!path) return normalizedBasePath;
    // Ensure path starts with / for consistent concatenation
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${normalizedBasePath}${normalizedPath}`;
  }

  return {
    basePath: normalizedBasePath,

    get<T>(path: string, options?: RequestOptions): Promise<T> {
      return fetcher.get<T>(buildUrl(path), options);
    },

    post<T>(path: string, options?: RequestWithBodyOptions): Promise<T> {
      return fetcher.post<T>(buildUrl(path), options);
    },

    put<T>(path: string, options?: RequestWithBodyOptions): Promise<T> {
      return fetcher.put<T>(buildUrl(path), options);
    },

    patch<T>(path: string, options?: RequestWithBodyOptions): Promise<T> {
      return fetcher.patch<T>(buildUrl(path), options);
    },

    delete<T>(path: string, options?: RequestWithBodyOptions): Promise<T> {
      return fetcher.delete<T>(buildUrl(path), options);
    },

    request<T>(
      method: HttpMethod,
      path: string,
      options?: RequestWithBodyOptions
    ): Promise<ApiResult<T>> {
      return fetcher.request<T>(method, buildUrl(path), options);
    },

    getWithResponse<T>(
      path: string,
      options?: RequestOptions
    ): Promise<ApiResponse<T>> {
      return fetcher.getWithResponse<T>(buildUrl(path), options);
    },

    postWithResponse<T>(
      path: string,
      options?: RequestWithBodyOptions
    ): Promise<ApiResponse<T>> {
      return fetcher.postWithResponse<T>(buildUrl(path), options);
    },

    putWithResponse<T>(
      path: string,
      options?: RequestWithBodyOptions
    ): Promise<ApiResponse<T>> {
      return fetcher.putWithResponse<T>(buildUrl(path), options);
    },
  };
}

// =============================================================================
// API Client Interface
// =============================================================================

/**
 * The main API client interface with endpoint groups for dashboard and admin
 */
export interface ApiClient {
  /**
   * Dashboard API endpoints (/api/dashboard/*)
   * Used for creator profile management, settings, social links, etc.
   */
  readonly dashboard: EndpointGroup;

  /**
   * Admin API endpoints (/api/admin/*)
   * Used for admin-only operations like creator ingestion, role management, etc.
   */
  readonly admin: EndpointGroup;

  /**
   * Create a custom endpoint group for other API paths
   * @param basePath - The base path for the endpoint group
   */
  createGroup(basePath: string): EndpointGroup;

  /**
   * The underlying fetcher instance for direct access if needed
   */
  readonly fetcher: ReturnType<typeof createFetcher>;

  /**
   * The client configuration
   */
  readonly config: ApiClientConfig;
}

// =============================================================================
// API Client Factory
// =============================================================================

/**
 * Create an API client with the given configuration
 *
 * @example
 * ```ts
 * // Create a client with default configuration
 * const api = createApiClient();
 *
 * // Use dashboard endpoints
 * const profile = await api.dashboard.get<Profile>('/profile');
 * await api.dashboard.put('/profile', { body: { displayName: 'New Name' } });
 *
 * // Use admin endpoints
 * const result = await api.admin.post<IngestResult>('/creator-ingest', {
 *   body: { url: 'https://linktr.ee/username' }
 * });
 *
 * // Use result pattern for error handling
 * const res = await api.dashboard.request<Profile>('GET', '/profile');
 * if (res.ok) {
 *   console.log(res.data);
 * } else {
 *   console.error(res.error.message);
 * }
 * ```
 */
export function createApiClient(config: ApiClientConfig = {}): ApiClient {
  const fetcher = createFetcher(config);

  // Pre-create the standard endpoint groups
  const dashboard = createEndpointGroup('/api/dashboard', fetcher);
  const admin = createEndpointGroup('/api/admin', fetcher);

  return {
    dashboard,
    admin,
    fetcher,
    config,

    createGroup(basePath: string): EndpointGroup {
      return createEndpointGroup(basePath, fetcher);
    },
  };
}

// =============================================================================
// Default Client Instance
// =============================================================================

/**
 * Default API client instance with standard configuration.
 *
 * This is the primary export for most use cases. Import and use directly:
 *
 * @example
 * ```ts
 * import { api } from '@/lib/api-client';
 *
 * // Get profile
 * const profile = await api.dashboard.get<Profile>('/profile');
 *
 * // Update profile
 * await api.dashboard.put('/profile', {
 *   body: { updates: { displayName: 'New Name' } }
 * });
 *
 * // Admin: ingest a creator profile
 * const result = await api.admin.post<IngestResult>('/creator-ingest', {
 *   body: { url: 'https://linktr.ee/username' }
 * });
 * ```
 */
export const api: ApiClient = createApiClient();

// =============================================================================
// Re-exports for convenience
// =============================================================================

export { ApiError };
export type { ApiClientConfig, ApiResponse, ApiResult } from './types';
