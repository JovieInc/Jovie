/**
 * Dashboard Analytics API Endpoint Methods
 *
 * Typed methods for GET operations on /api/dashboard/analytics.
 * Handles fetching analytics data with configurable time ranges and view modes.
 *
 * @example
 * ```ts
 * import { dashboardAnalytics } from '@/lib/api-client/endpoints/dashboard/analytics';
 *
 * // Get full analytics for the last 30 days (default)
 * const stats = await dashboardAnalytics.get();
 *
 * // Get traffic-only analytics for the last 7 days
 * const traffic = await dashboardAnalytics.get({ range: '7d', view: 'traffic' });
 *
 * // Force refresh cached analytics
 * const fresh = await dashboardAnalytics.get({ refresh: true });
 *
 * // Safe version with result pattern
 * const result = await dashboardAnalytics.getSafe({ range: '90d' });
 * if (result.ok) {
 *   console.log('Profile views:', result.data.profile_views);
 * }
 * ```
 */

import { api } from '../../client';
import type { ApiResult, RequestOptions } from '../../types';
import type {
  AnalyticsCityRow,
  AnalyticsCountryRow,
  AnalyticsReferrerRow,
  GetAnalyticsParams,
  GetAnalyticsResponse,
} from './types';

// =============================================================================
// Response Types (re-exported for convenience)
// =============================================================================

export type {
  AnalyticsCityRow,
  AnalyticsCountryRow,
  AnalyticsReferrerRow,
  GetAnalyticsParams,
  GetAnalyticsResponse,
};

// =============================================================================
// Helper Types
// =============================================================================

/**
 * Options for analytics requests
 */
export interface AnalyticsRequestOptions extends Omit<RequestOptions, 'body'> {
  /** Time range for analytics data */
  range?: '1d' | '7d' | '30d' | '90d' | 'all';
  /** View mode: 'traffic' for minimal data, 'full' for all metrics */
  view?: 'traffic' | 'full';
  /** Force refresh cached data */
  refresh?: boolean;
  /** AbortSignal for request cancellation */
  signal?: AbortSignal;
}

// =============================================================================
// Analytics Endpoint Methods
// =============================================================================

/**
 * Get dashboard analytics data
 *
 * @param options - Optional request options including range and view mode
 * @returns The analytics response containing profile views, geo data, and optionally full metrics
 * @throws {ApiError} If the request fails (401 unauthorized, 500 server error, etc.)
 *
 * @example
 * ```ts
 * // Default: full analytics for last 30 days
 * const { profile_views, top_cities, top_countries } = await getAnalytics();
 *
 * // Traffic view for last 7 days
 * const trafficStats = await getAnalytics({ range: '7d', view: 'traffic' });
 *
 * // Full analytics for last 90 days with forced refresh
 * const fullStats = await getAnalytics({ range: '90d', view: 'full', refresh: true });
 *
 * // With abort signal
 * const controller = new AbortController();
 * const stats = await getAnalytics({ signal: controller.signal });
 * ```
 */
export async function getAnalytics(
  options?: AnalyticsRequestOptions
): Promise<GetAnalyticsResponse> {
  const queryParams = new URLSearchParams();

  if (options?.range) {
    queryParams.set('range', options.range);
  }
  if (options?.view) {
    queryParams.set('view', options.view);
  }
  if (options?.refresh) {
    queryParams.set('refresh', '1');
  }

  const queryString = queryParams.toString();
  const path = queryString ? `/analytics?${queryString}` : '/analytics';

  // Extract non-query options for the request
  const {
    range: _range,
    view: _view,
    refresh: _refresh,
    ...requestOptions
  } = options ?? {};

  return api.dashboard.get<GetAnalyticsResponse>(path, requestOptions);
}

/**
 * Get dashboard analytics with result pattern (no throw)
 *
 * Returns a result object with `ok: true` and data on success,
 * or `ok: false` and error on failure.
 *
 * @param options - Optional request options
 * @returns A result object containing either the analytics data or an error
 *
 * @example
 * ```ts
 * const result = await getAnalyticsSafe({ range: '7d' });
 * if (result.ok) {
 *   console.log('Profile views:', result.data.profile_views);
 *   console.log('Top cities:', result.data.top_cities);
 * } else {
 *   if (result.error.isUnauthorized()) {
 *     console.log('User not authenticated');
 *   } else {
 *     console.error('Error:', result.error.message);
 *   }
 * }
 * ```
 */
export async function getAnalyticsSafe(
  options?: AnalyticsRequestOptions
): Promise<ApiResult<GetAnalyticsResponse>> {
  const queryParams = new URLSearchParams();

  if (options?.range) {
    queryParams.set('range', options.range);
  }
  if (options?.view) {
    queryParams.set('view', options.view);
  }
  if (options?.refresh) {
    queryParams.set('refresh', '1');
  }

  const queryString = queryParams.toString();
  const path = queryString ? `/analytics?${queryString}` : '/analytics';

  // Extract non-query options for the request
  const {
    range: _range,
    view: _view,
    refresh: _refresh,
    ...requestOptions
  } = options ?? {};

  return api.dashboard.request<GetAnalyticsResponse>(
    'GET',
    path,
    requestOptions
  );
}

// =============================================================================
// Convenience Methods
// =============================================================================

/**
 * Get traffic-only analytics (minimal data for performance)
 *
 * Returns only profile_views and geo data, omitting click counts and other metrics.
 *
 * @param range - Time range for analytics (default: '30d')
 * @param options - Optional request options
 * @returns Traffic analytics response
 * @throws {ApiError} If the request fails
 *
 * @example
 * ```ts
 * const { profile_views, top_cities } = await getTrafficAnalytics('7d');
 * ```
 */
export async function getTrafficAnalytics(
  range: '1d' | '7d' | '30d' | '90d' | 'all' = '30d',
  options?: Omit<AnalyticsRequestOptions, 'range' | 'view'>
): Promise<GetAnalyticsResponse> {
  return getAnalytics({ ...options, range, view: 'traffic' });
}

/**
 * Get full analytics with all metrics
 *
 * Returns all available metrics including clicks, subscribers, and geo data.
 *
 * @param range - Time range for analytics (default: '30d')
 * @param options - Optional request options
 * @returns Full analytics response
 * @throws {ApiError} If the request fails
 *
 * @example
 * ```ts
 * const {
 *   profile_views,
 *   unique_users,
 *   listen_clicks,
 *   subscribers,
 *   top_cities,
 * } = await getFullAnalytics('30d');
 * ```
 */
export async function getFullAnalytics(
  range: '1d' | '7d' | '30d' | '90d' | 'all' = '30d',
  options?: Omit<AnalyticsRequestOptions, 'range' | 'view'>
): Promise<GetAnalyticsResponse> {
  return getAnalytics({ ...options, range, view: 'full' });
}

/**
 * Force refresh analytics cache and get fresh data
 *
 * Bypasses the server-side cache to get the most up-to-date analytics.
 *
 * @param range - Time range for analytics (default: '30d')
 * @param view - View mode (default: 'full')
 * @param options - Optional request options
 * @returns Fresh analytics response
 * @throws {ApiError} If the request fails
 *
 * @example
 * ```ts
 * // Refresh after user takes an action
 * const freshStats = await refreshAnalytics();
 * ```
 */
export async function refreshAnalytics(
  range: '1d' | '7d' | '30d' | '90d' | 'all' = '30d',
  view: 'traffic' | 'full' = 'full',
  options?: Omit<AnalyticsRequestOptions, 'range' | 'view' | 'refresh'>
): Promise<GetAnalyticsResponse> {
  return getAnalytics({ ...options, range, view, refresh: true });
}

// =============================================================================
// Namespace Export
// =============================================================================

/**
 * Dashboard analytics API methods
 *
 * Provides typed methods for interacting with the dashboard analytics API.
 * Import and use as a namespace for cleaner code organization.
 *
 * @example
 * ```ts
 * import { dashboardAnalytics } from '@/lib/api-client/endpoints/dashboard/analytics';
 *
 * // Get analytics (default: full view, 30d range)
 * const stats = await dashboardAnalytics.get();
 *
 * // Get traffic-only analytics
 * const traffic = await dashboardAnalytics.getTraffic('7d');
 *
 * // Get full analytics
 * const full = await dashboardAnalytics.getFull('90d');
 *
 * // Force refresh
 * const fresh = await dashboardAnalytics.refresh();
 *
 * // Safe version (no throw)
 * const result = await dashboardAnalytics.getSafe({ range: '7d' });
 * ```
 */
export const dashboardAnalytics = {
  /**
   * Get dashboard analytics data
   * @see {@link getAnalytics}
   */
  get: getAnalytics,

  /**
   * Get dashboard analytics with result pattern (no throw)
   * @see {@link getAnalyticsSafe}
   */
  getSafe: getAnalyticsSafe,

  /**
   * Get traffic-only analytics (minimal data)
   * @see {@link getTrafficAnalytics}
   */
  getTraffic: getTrafficAnalytics,

  /**
   * Get full analytics with all metrics
   * @see {@link getFullAnalytics}
   */
  getFull: getFullAnalytics,

  /**
   * Force refresh analytics cache
   * @see {@link refreshAnalytics}
   */
  refresh: refreshAnalytics,
} as const;

// Default export for convenient importing
export default dashboardAnalytics;
