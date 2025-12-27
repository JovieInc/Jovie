/**
 * Dashboard Activity API Endpoint Methods
 *
 * Typed methods for GET operations on /api/dashboard/activity/recent.
 * Handles fetching recent activity feed items with configurable time ranges and limits.
 *
 * @example
 * ```ts
 * import { dashboardActivity } from '@/lib/api-client/endpoints/dashboard/activity';
 *
 * // Get recent activity (default: 5 items, last 7 days)
 * const { activities } = await dashboardActivity.get({
 *   profileId: 'profile-123',
 * });
 *
 * // Get more activity items with longer range
 * const { activities } = await dashboardActivity.get({
 *   profileId: 'profile-123',
 *   limit: 20,
 *   range: '30d',
 * });
 *
 * // Safe version with result pattern
 * const result = await dashboardActivity.getSafe({
 *   profileId: 'profile-123',
 * });
 * if (result.ok) {
 *   for (const activity of result.data.activities) {
 *     console.log(`${activity.icon} ${activity.description}`);
 *   }
 * }
 * ```
 */

import { api } from '../../client';
import { ApiResult, RequestOptions } from '../../types';
import {
  ActivityItem,
  ActivityRange,
  GetRecentActivityParams,
  GetRecentActivityResponse,
} from './types';

// =============================================================================
// Response Types (re-exported for convenience)
// =============================================================================

export type {
  ActivityItem,
  ActivityRange,
  GetRecentActivityParams,
  GetRecentActivityResponse,
};

// =============================================================================
// Helper Types
// =============================================================================

/**
 * Options for activity requests
 */
export interface GetActivityOptions extends Omit<RequestOptions, 'body'> {
  /** The profile ID to fetch activity for */
  profileId: string;
  /** Maximum number of activities to return (default: 5, max: 20) */
  limit?: number;
  /** Time range for activity (default: '7d') */
  range?: ActivityRange;
  /** AbortSignal for request cancellation */
  signal?: AbortSignal;
}

// =============================================================================
// Activity Endpoint Methods
// =============================================================================

/**
 * Build query string for activity requests
 */
function buildActivityQueryString(options: GetActivityOptions): string {
  const params = new URLSearchParams();
  params.set('profileId', options.profileId);

  if (options.limit !== undefined) {
    params.set('limit', String(options.limit));
  }
  if (options.range) {
    params.set('range', options.range);
  }

  return params.toString();
}

/**
 * Get recent activity for a profile
 *
 * Returns a list of recent activities including link clicks, profile visits,
 * and new subscriptions with emoji icons and human-readable descriptions.
 *
 * @param options - Request options including profileId and optional limit/range
 * @returns Recent activity response with array of activity items
 * @throws {ApiError} If the request fails (400 invalid params, 401 unauthorized, etc.)
 *
 * @example
 * ```ts
 * // Basic usage with defaults (5 items, last 7 days)
 * const { activities } = await getRecentActivity({
 *   profileId: 'profile-123',
 * });
 *
 * // Get more activities over a longer period
 * const { activities } = await getRecentActivity({
 *   profileId: 'profile-123',
 *   limit: 15,
 *   range: '30d',
 * });
 *
 * // Display activities
 * for (const activity of activities) {
 *   console.log(`${activity.icon} ${activity.description}`);
 *   console.log(`  at ${new Date(activity.timestamp).toLocaleString()}`);
 * }
 * ```
 */
export async function getRecentActivity(
  options: GetActivityOptions
): Promise<GetRecentActivityResponse> {
  const queryString = buildActivityQueryString(options);
  const path = `/activity/recent?${queryString}`;

  // Extract non-query options for the request
  const {
    profileId: _profileId,
    limit: _limit,
    range: _range,
    ...requestOptions
  } = options;

  return api.dashboard.get<GetRecentActivityResponse>(path, requestOptions);
}

/**
 * Get recent activity with result pattern (no throw)
 *
 * Returns a result object with `ok: true` and data on success,
 * or `ok: false` and error on failure.
 *
 * @param options - Request options including profileId and optional limit/range
 * @returns A result object containing either the activities or an error
 *
 * @example
 * ```ts
 * const result = await getRecentActivitySafe({
 *   profileId: 'profile-123',
 *   limit: 10,
 * });
 *
 * if (result.ok) {
 *   console.log(`Found ${result.data.activities.length} recent activities`);
 *   for (const activity of result.data.activities) {
 *     console.log(`${activity.icon} ${activity.description}`);
 *   }
 * } else {
 *   if (result.error.status === 400) {
 *     console.error('Invalid request:', result.error.message);
 *   } else {
 *     console.error('Error:', result.error.message);
 *   }
 * }
 * ```
 */
export async function getRecentActivitySafe(
  options: GetActivityOptions
): Promise<ApiResult<GetRecentActivityResponse>> {
  const queryString = buildActivityQueryString(options);
  const path = `/activity/recent?${queryString}`;

  // Extract non-query options for the request
  const {
    profileId: _profileId,
    limit: _limit,
    range: _range,
    ...requestOptions
  } = options;

  return api.dashboard.request<GetRecentActivityResponse>(
    'GET',
    path,
    requestOptions
  );
}

// =============================================================================
// Convenience Methods
// =============================================================================

/**
 * Get activity for the last week
 *
 * @param profileId - The profile ID to fetch activity for
 * @param limit - Maximum number of activities (default: 5)
 * @param options - Optional request options
 * @returns Recent activity response
 * @throws {ApiError} If the request fails
 *
 * @example
 * ```ts
 * const { activities } = await getWeekActivity('profile-123');
 * ```
 */
export async function getWeekActivity(
  profileId: string,
  limit: number = 5,
  options?: Omit<RequestOptions, 'body'>
): Promise<GetRecentActivityResponse> {
  return getRecentActivity({
    profileId,
    limit,
    range: '7d',
    ...options,
  });
}

/**
 * Get activity for the last month
 *
 * @param profileId - The profile ID to fetch activity for
 * @param limit - Maximum number of activities (default: 10)
 * @param options - Optional request options
 * @returns Recent activity response
 * @throws {ApiError} If the request fails
 *
 * @example
 * ```ts
 * const { activities } = await getMonthActivity('profile-123', 15);
 * ```
 */
export async function getMonthActivity(
  profileId: string,
  limit: number = 10,
  options?: Omit<RequestOptions, 'body'>
): Promise<GetRecentActivityResponse> {
  return getRecentActivity({
    profileId,
    limit,
    range: '30d',
    ...options,
  });
}

/**
 * Get activity for the last quarter (90 days)
 *
 * @param profileId - The profile ID to fetch activity for
 * @param limit - Maximum number of activities (default: 20)
 * @param options - Optional request options
 * @returns Recent activity response
 * @throws {ApiError} If the request fails
 *
 * @example
 * ```ts
 * const { activities } = await getQuarterActivity('profile-123');
 * ```
 */
export async function getQuarterActivity(
  profileId: string,
  limit: number = 20,
  options?: Omit<RequestOptions, 'body'>
): Promise<GetRecentActivityResponse> {
  return getRecentActivity({
    profileId,
    limit,
    range: '90d',
    ...options,
  });
}

// =============================================================================
// Namespace Export
// =============================================================================

/**
 * Dashboard activity API methods
 *
 * Provides typed methods for interacting with the dashboard activity API.
 * Import and use as a namespace for cleaner code organization.
 *
 * @example
 * ```ts
 * import { dashboardActivity } from '@/lib/api-client/endpoints/dashboard/activity';
 *
 * // Get recent activity
 * const { activities } = await dashboardActivity.get({
 *   profileId: 'profile-123',
 *   limit: 10,
 * });
 *
 * // Convenience methods
 * const weekActivity = await dashboardActivity.getWeek('profile-123');
 * const monthActivity = await dashboardActivity.getMonth('profile-123', 15);
 * const quarterActivity = await dashboardActivity.getQuarter('profile-123');
 *
 * // Safe version (no throw)
 * const result = await dashboardActivity.getSafe({
 *   profileId: 'profile-123',
 * });
 * ```
 */
export const dashboardActivity = {
  /**
   * Get recent activity for a profile
   * @see {@link getRecentActivity}
   */
  get: getRecentActivity,

  /**
   * Get recent activity with result pattern (no throw)
   * @see {@link getRecentActivitySafe}
   */
  getSafe: getRecentActivitySafe,

  /**
   * Get activity for the last week
   * @see {@link getWeekActivity}
   */
  getWeek: getWeekActivity,

  /**
   * Get activity for the last month
   * @see {@link getMonthActivity}
   */
  getMonth: getMonthActivity,

  /**
   * Get activity for the last quarter
   * @see {@link getQuarterActivity}
   */
  getQuarter: getQuarterActivity,
} as const;

// Default export for convenient importing
export default dashboardActivity;
