/**
 * Dashboard Audience API Endpoint Methods
 *
 * Typed methods for GET operations on /api/dashboard/audience/members and
 * /api/dashboard/audience/subscribers endpoints.
 * Handles fetching audience members and notification subscribers with pagination and sorting.
 *
 * @example
 * ```ts
 * import { dashboardAudience } from '@/lib/api-client/endpoints/dashboard/audience';
 *
 * // Get audience members
 * const { members, total } = await dashboardAudience.getMembers({
 *   profileId: 'profile-123',
 *   sort: 'lastSeen',
 *   direction: 'desc',
 * });
 *
 * // Get subscribers
 * const { subscribers, total } = await dashboardAudience.getSubscribers({
 *   profileId: 'profile-123',
 *   page: 2,
 *   pageSize: 20,
 * });
 *
 * // Safe version with result pattern
 * const result = await dashboardAudience.getMembersSafe({
 *   profileId: 'profile-123',
 * });
 * if (result.ok) {
 *   console.log('Total members:', result.data.total);
 * }
 * ```
 */

import { api } from '../../client';
import { ApiResult, RequestOptions } from '../../types';
import {
  AudienceIntentLevel,
  AudienceMember,
  AudienceMemberSort,
  AudienceMemberType,
  DeviceType,
  GetAudienceMembersParams,
  GetAudienceMembersResponse,
  GetSubscribersParams,
  GetSubscribersResponse,
  Subscriber,
  SubscriberSort,
  SubscriptionChannel,
} from './types';

// =============================================================================
// Response Types (re-exported for convenience)
// =============================================================================

export type {
  AudienceIntentLevel,
  AudienceMember,
  AudienceMemberSort,
  AudienceMemberType,
  DeviceType,
  GetAudienceMembersParams,
  GetAudienceMembersResponse,
  GetSubscribersParams,
  GetSubscribersResponse,
  Subscriber,
  SubscriberSort,
  SubscriptionChannel,
};

// =============================================================================
// Helper Types
// =============================================================================

/**
 * Options for audience member requests
 */
export interface GetMembersOptions extends Omit<RequestOptions, 'body'> {
  /** The profile ID to fetch members for */
  profileId: string;
  /** Sort field (default: 'lastSeen') */
  sort?: AudienceMemberSort;
  /** Sort direction (default: 'desc') */
  direction?: 'asc' | 'desc';
  /** Page number (1-indexed, default: 1) */
  page?: number;
  /** Number of items per page (default: 10, max: 100) */
  pageSize?: number;
  /** AbortSignal for request cancellation */
  signal?: AbortSignal;
}

/**
 * Options for subscriber requests
 */
export interface GetSubscribersOptions extends Omit<RequestOptions, 'body'> {
  /** The profile ID to fetch subscribers for */
  profileId: string;
  /** Sort field (default: 'createdAt') */
  sort?: SubscriberSort;
  /** Sort direction (default: 'desc') */
  direction?: 'asc' | 'desc';
  /** Page number (1-indexed, default: 1) */
  page?: number;
  /** Number of items per page (default: 10, max: 100) */
  pageSize?: number;
  /** AbortSignal for request cancellation */
  signal?: AbortSignal;
}

// =============================================================================
// Audience Members Endpoint Methods
// =============================================================================

/**
 * Build query string for audience member requests
 */
function buildMembersQueryString(options: GetMembersOptions): string {
  const params = new URLSearchParams();
  params.set('profileId', options.profileId);

  if (options.sort) {
    params.set('sort', options.sort);
  }
  if (options.direction) {
    params.set('direction', options.direction);
  }
  if (options.page !== undefined) {
    params.set('page', String(options.page));
  }
  if (options.pageSize !== undefined) {
    params.set('pageSize', String(options.pageSize));
  }

  return params.toString();
}

/**
 * Get audience members for a profile
 *
 * Returns paginated list of audience members with engagement data, location info,
 * and interaction history.
 *
 * @param options - Request options including profileId and pagination
 * @returns Paginated audience members response
 * @throws {ApiError} If the request fails (400 invalid params, 401 unauthorized, etc.)
 *
 * @example
 * ```ts
 * // Basic usage with defaults
 * const { members, total } = await getAudienceMembers({
 *   profileId: 'profile-123',
 * });
 *
 * // With pagination and sorting
 * const { members, total } = await getAudienceMembers({
 *   profileId: 'profile-123',
 *   sort: 'engagement',
 *   direction: 'desc',
 *   page: 2,
 *   pageSize: 20,
 * });
 *
 * // Sort by intent level (superfans first)
 * const { members } = await getAudienceMembers({
 *   profileId: 'profile-123',
 *   sort: 'intent',
 *   direction: 'desc',
 * });
 * ```
 */
export async function getAudienceMembers(
  options: GetMembersOptions
): Promise<GetAudienceMembersResponse> {
  const queryString = buildMembersQueryString(options);
  const path = `/audience/members?${queryString}`;

  // Extract non-query options for the request
  const {
    profileId: _profileId,
    sort: _sort,
    direction: _direction,
    page: _page,
    pageSize: _pageSize,
    ...requestOptions
  } = options;

  return api.dashboard.get<GetAudienceMembersResponse>(path, requestOptions);
}

/**
 * Get audience members with result pattern (no throw)
 *
 * Returns a result object with `ok: true` and data on success,
 * or `ok: false` and error on failure.
 *
 * @param options - Request options including profileId and pagination
 * @returns A result object containing either the members or an error
 *
 * @example
 * ```ts
 * const result = await getAudienceMembersSafe({
 *   profileId: 'profile-123',
 *   sort: 'lastSeen',
 * });
 *
 * if (result.ok) {
 *   console.log(`Found ${result.data.total} members`);
 *   for (const member of result.data.members) {
 *     console.log(`${member.displayName}: ${member.intentLevel}`);
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
export async function getAudienceMembersSafe(
  options: GetMembersOptions
): Promise<ApiResult<GetAudienceMembersResponse>> {
  const queryString = buildMembersQueryString(options);
  const path = `/audience/members?${queryString}`;

  // Extract non-query options for the request
  const {
    profileId: _profileId,
    sort: _sort,
    direction: _direction,
    page: _page,
    pageSize: _pageSize,
    ...requestOptions
  } = options;

  return api.dashboard.request<GetAudienceMembersResponse>(
    'GET',
    path,
    requestOptions
  );
}

// =============================================================================
// Subscribers Endpoint Methods
// =============================================================================

/**
 * Build query string for subscriber requests
 */
function buildSubscribersQueryString(options: GetSubscribersOptions): string {
  const params = new URLSearchParams();
  params.set('profileId', options.profileId);

  if (options.sort) {
    params.set('sort', options.sort);
  }
  if (options.direction) {
    params.set('direction', options.direction);
  }
  if (options.page !== undefined) {
    params.set('page', String(options.page));
  }
  if (options.pageSize !== undefined) {
    params.set('pageSize', String(options.pageSize));
  }

  return params.toString();
}

/**
 * Get notification subscribers for a profile
 *
 * Returns paginated list of users who have subscribed to notifications
 * (email or SMS) for the creator.
 *
 * @param options - Request options including profileId and pagination
 * @returns Paginated subscribers response
 * @throws {ApiError} If the request fails (400 invalid params, 401 unauthorized, etc.)
 *
 * @example
 * ```ts
 * // Basic usage with defaults
 * const { subscribers, total } = await getSubscribers({
 *   profileId: 'profile-123',
 * });
 *
 * // With pagination and sorting
 * const { subscribers, total } = await getSubscribers({
 *   profileId: 'profile-123',
 *   sort: 'createdAt',
 *   direction: 'desc',
 *   page: 1,
 *   pageSize: 50,
 * });
 *
 * // Sort by email
 * const { subscribers } = await getSubscribers({
 *   profileId: 'profile-123',
 *   sort: 'email',
 *   direction: 'asc',
 * });
 * ```
 */
export async function getSubscribers(
  options: GetSubscribersOptions
): Promise<GetSubscribersResponse> {
  const queryString = buildSubscribersQueryString(options);
  const path = `/audience/subscribers?${queryString}`;

  // Extract non-query options for the request
  const {
    profileId: _profileId,
    sort: _sort,
    direction: _direction,
    page: _page,
    pageSize: _pageSize,
    ...requestOptions
  } = options;

  return api.dashboard.get<GetSubscribersResponse>(path, requestOptions);
}

/**
 * Get subscribers with result pattern (no throw)
 *
 * Returns a result object with `ok: true` and data on success,
 * or `ok: false` and error on failure.
 *
 * @param options - Request options including profileId and pagination
 * @returns A result object containing either the subscribers or an error
 *
 * @example
 * ```ts
 * const result = await getSubscribersSafe({
 *   profileId: 'profile-123',
 * });
 *
 * if (result.ok) {
 *   console.log(`Found ${result.data.total} subscribers`);
 *   for (const subscriber of result.data.subscribers) {
 *     console.log(`${subscriber.email ?? subscriber.phone}`);
 *   }
 * } else {
 *   console.error('Error:', result.error.message);
 * }
 * ```
 */
export async function getSubscribersSafe(
  options: GetSubscribersOptions
): Promise<ApiResult<GetSubscribersResponse>> {
  const queryString = buildSubscribersQueryString(options);
  const path = `/audience/subscribers?${queryString}`;

  // Extract non-query options for the request
  const {
    profileId: _profileId,
    sort: _sort,
    direction: _direction,
    page: _page,
    pageSize: _pageSize,
    ...requestOptions
  } = options;

  return api.dashboard.request<GetSubscribersResponse>(
    'GET',
    path,
    requestOptions
  );
}

// =============================================================================
// Convenience Methods
// =============================================================================

/**
 * Get all audience members (paginated fetch with reasonable limit)
 *
 * Fetches audience members with maximum page size for bulk operations.
 *
 * @param profileId - The profile ID to fetch members for
 * @param sort - Sort field (default: 'lastSeen')
 * @param options - Optional request options
 * @returns Audience members response
 * @throws {ApiError} If the request fails
 *
 * @example
 * ```ts
 * const { members, total } = await getAllMembers('profile-123');
 * ```
 */
export async function getAllMembers(
  profileId: string,
  sort: AudienceMemberSort = 'lastSeen',
  options?: Omit<RequestOptions, 'body'>
): Promise<GetAudienceMembersResponse> {
  return getAudienceMembers({
    profileId,
    sort,
    direction: 'desc',
    pageSize: 100,
    ...options,
  });
}

/**
 * Get superfans (high intent audience members)
 *
 * Fetches audience members sorted by intent level to find your most engaged fans.
 *
 * @param profileId - The profile ID to fetch superfans for
 * @param limit - Number of superfans to fetch (default: 10)
 * @param options - Optional request options
 * @returns Audience members response with high-intent members first
 * @throws {ApiError} If the request fails
 *
 * @example
 * ```ts
 * const { members } = await getSuperfans('profile-123', 5);
 * // members are sorted by intent level, highest first
 * ```
 */
export async function getSuperfans(
  profileId: string,
  limit: number = 10,
  options?: Omit<RequestOptions, 'body'>
): Promise<GetAudienceMembersResponse> {
  return getAudienceMembers({
    profileId,
    sort: 'intent',
    direction: 'desc',
    pageSize: limit,
    ...options,
  });
}

/**
 * Get most engaged audience members
 *
 * Fetches audience members sorted by engagement score.
 *
 * @param profileId - The profile ID to fetch engaged members for
 * @param limit - Number of members to fetch (default: 10)
 * @param options - Optional request options
 * @returns Audience members response with most engaged first
 * @throws {ApiError} If the request fails
 *
 * @example
 * ```ts
 * const { members } = await getMostEngaged('profile-123', 20);
 * // members are sorted by engagement score, highest first
 * ```
 */
export async function getMostEngaged(
  profileId: string,
  limit: number = 10,
  options?: Omit<RequestOptions, 'body'>
): Promise<GetAudienceMembersResponse> {
  return getAudienceMembers({
    profileId,
    sort: 'engagement',
    direction: 'desc',
    pageSize: limit,
    ...options,
  });
}

/**
 * Get recent visitors
 *
 * Fetches audience members sorted by last seen date.
 *
 * @param profileId - The profile ID to fetch recent visitors for
 * @param limit - Number of visitors to fetch (default: 10)
 * @param options - Optional request options
 * @returns Audience members response with most recent first
 * @throws {ApiError} If the request fails
 *
 * @example
 * ```ts
 * const { members } = await getRecentVisitors('profile-123');
 * // members are sorted by lastSeenAt, most recent first
 * ```
 */
export async function getRecentVisitors(
  profileId: string,
  limit: number = 10,
  options?: Omit<RequestOptions, 'body'>
): Promise<GetAudienceMembersResponse> {
  return getAudienceMembers({
    profileId,
    sort: 'lastSeen',
    direction: 'desc',
    pageSize: limit,
    ...options,
  });
}

/**
 * Get all subscribers (paginated fetch with reasonable limit)
 *
 * Fetches subscribers with maximum page size for bulk operations.
 *
 * @param profileId - The profile ID to fetch subscribers for
 * @param options - Optional request options
 * @returns Subscribers response
 * @throws {ApiError} If the request fails
 *
 * @example
 * ```ts
 * const { subscribers, total } = await getAllSubscribers('profile-123');
 * ```
 */
export async function getAllSubscribers(
  profileId: string,
  options?: Omit<RequestOptions, 'body'>
): Promise<GetSubscribersResponse> {
  return getSubscribers({
    profileId,
    sort: 'createdAt',
    direction: 'desc',
    pageSize: 100,
    ...options,
  });
}

/**
 * Get recent subscribers
 *
 * Fetches the most recently subscribed users.
 *
 * @param profileId - The profile ID to fetch recent subscribers for
 * @param limit - Number of subscribers to fetch (default: 10)
 * @param options - Optional request options
 * @returns Subscribers response with most recent first
 * @throws {ApiError} If the request fails
 *
 * @example
 * ```ts
 * const { subscribers } = await getRecentSubscribers('profile-123', 5);
 * // subscribers are sorted by createdAt, most recent first
 * ```
 */
export async function getRecentSubscribers(
  profileId: string,
  limit: number = 10,
  options?: Omit<RequestOptions, 'body'>
): Promise<GetSubscribersResponse> {
  return getSubscribers({
    profileId,
    sort: 'createdAt',
    direction: 'desc',
    pageSize: limit,
    ...options,
  });
}

// =============================================================================
// Namespace Export
// =============================================================================

/**
 * Dashboard audience API methods
 *
 * Provides typed methods for interacting with the dashboard audience API.
 * Import and use as a namespace for cleaner code organization.
 *
 * @example
 * ```ts
 * import { dashboardAudience } from '@/lib/api-client/endpoints/dashboard/audience';
 *
 * // Get members
 * const { members, total } = await dashboardAudience.getMembers({
 *   profileId: 'profile-123',
 *   sort: 'engagement',
 * });
 *
 * // Get subscribers
 * const { subscribers, total } = await dashboardAudience.getSubscribers({
 *   profileId: 'profile-123',
 * });
 *
 * // Convenience methods
 * const superfans = await dashboardAudience.getSuperfans('profile-123', 10);
 * const recentVisitors = await dashboardAudience.getRecentVisitors('profile-123');
 * const recentSubs = await dashboardAudience.getRecentSubscribers('profile-123');
 * ```
 */
export const dashboardAudience = {
  /**
   * Get audience members for a profile
   * @see {@link getAudienceMembers}
   */
  getMembers: getAudienceMembers,

  /**
   * Get audience members with result pattern (no throw)
   * @see {@link getAudienceMembersSafe}
   */
  getMembersSafe: getAudienceMembersSafe,

  /**
   * Get notification subscribers for a profile
   * @see {@link getSubscribers}
   */
  getSubscribers,

  /**
   * Get subscribers with result pattern (no throw)
   * @see {@link getSubscribersSafe}
   */
  getSubscribersSafe,

  /**
   * Get all audience members (max page size)
   * @see {@link getAllMembers}
   */
  getAllMembers,

  /**
   * Get superfans (high intent members)
   * @see {@link getSuperfans}
   */
  getSuperfans,

  /**
   * Get most engaged audience members
   * @see {@link getMostEngaged}
   */
  getMostEngaged,

  /**
   * Get recent visitors
   * @see {@link getRecentVisitors}
   */
  getRecentVisitors,

  /**
   * Get all subscribers (max page size)
   * @see {@link getAllSubscribers}
   */
  getAllSubscribers,

  /**
   * Get recent subscribers
   * @see {@link getRecentSubscribers}
   */
  getRecentSubscribers,
} as const;

// Default export for convenient importing
export default dashboardAudience;
