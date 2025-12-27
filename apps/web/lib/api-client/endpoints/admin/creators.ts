/**
 * Admin Creator Management API Endpoint Methods
 *
 * Typed methods for creator ingestion, avatar updates, social links fetching,
 * and profile refresh operations. These are admin-only operations.
 *
 * @example
 * ```ts
 * import { adminCreators } from '@/lib/api-client/endpoints/admin/creators';
 *
 * // Ingest a creator profile from Linktree or Laylo
 * const { profile, links } = await adminCreators.ingest({
 *   url: 'https://linktr.ee/artist_name',
 * });
 *
 * // Rerun ingestion for an existing profile
 * const { jobId } = await adminCreators.rerunIngestion({
 *   profileId: 'profile-uuid',
 * });
 *
 * // Update creator avatar
 * const { avatarUrl } = await adminCreators.updateAvatar({
 *   profileId: 'profile-uuid',
 *   avatarUrl: 'https://example.com/avatar.jpg',
 * });
 *
 * // Get creator social links
 * const { links } = await adminCreators.getSocialLinks('profile-uuid');
 * ```
 */

import { api } from '../../client';
import { ApiResult, RequestOptions } from '../../types';
import {
  AdminSocialLink,
  GetCreatorSocialLinksResponse,
  IngestCreatorPartialResponse,
  IngestCreatorRequest,
  IngestCreatorResponse,
  RerunIngestionRequest,
  RerunIngestionResponse,
  UpdateCreatorAvatarRequest,
  UpdateCreatorAvatarResponse,
} from './types';

// =============================================================================
// Response Types (re-exported for convenience)
// =============================================================================

export type {
  AdminSocialLink,
  GetCreatorSocialLinksResponse,
  IngestCreatorRequest,
  IngestCreatorResponse,
  IngestCreatorPartialResponse,
  RerunIngestionRequest,
  RerunIngestionResponse,
  UpdateCreatorAvatarRequest,
  UpdateCreatorAvatarResponse,
};

// =============================================================================
// Helper Types
// =============================================================================

/**
 * Options for admin creator operations
 */
export interface AdminCreatorRequestOptions
  extends Omit<RequestOptions, 'body'> {
  /** AbortSignal for request cancellation */
  signal?: AbortSignal;
}

/**
 * Combined response type for ingestion (success or partial success)
 */
export type IngestCreatorResult =
  | IngestCreatorResponse
  | IngestCreatorPartialResponse;

/**
 * Parameters for ingesting a creator profile
 */
export interface IngestCreatorParams {
  /** Full URL to the profile to ingest (Linktree or Laylo) */
  url: string;
  /** Optional idempotency key to prevent duplicate ingestion */
  idempotencyKey?: string;
}

/**
 * Parameters for rerunning ingestion
 */
export interface RerunIngestionParams {
  /** The profile ID to rerun ingestion for */
  profileId: string;
}

/**
 * Parameters for updating creator avatar
 */
export interface UpdateCreatorAvatarParams {
  /** The profile ID to update */
  profileId: string;
  /** The new avatar URL (must be HTTPS) */
  avatarUrl: string;
}

// =============================================================================
// Creator Ingestion Methods
// =============================================================================

/**
 * Ingest a creator profile from Linktree or Laylo
 *
 * Creates a new creator profile or updates an existing unclaimed profile.
 * Extracts links, avatar, and display name from the source profile.
 *
 * @param params - The ingestion parameters
 * @param options - Optional request options
 * @returns The ingestion response with profile data and link count
 * @throws {ApiError} If the request fails (400 invalid URL, 401 unauthorized, 403 forbidden, 409 conflict, 502 fetch failed)
 *
 * @example
 * ```ts
 * // Ingest from Linktree
 * const { ok, profile, links, warning } = await ingestCreator({
 *   url: 'https://linktr.ee/artist_name',
 * });
 *
 * if (warning) {
 *   console.warn('Partial success:', warning);
 * }
 *
 * console.log(`Created profile ${profile.username} with ${links} links`);
 *
 * // Ingest from Laylo
 * const result = await ingestCreator({
 *   url: 'https://laylo.com/artist',
 * });
 *
 * // With idempotency key (prevent double-click duplicates)
 * const { profile } = await ingestCreator({
 *   url: 'https://linktr.ee/username',
 *   idempotencyKey: crypto.randomUUID(),
 * });
 * ```
 */
export async function ingestCreator(
  params: IngestCreatorParams,
  options?: AdminCreatorRequestOptions
): Promise<IngestCreatorResult> {
  const body: IngestCreatorRequest = {
    url: params.url,
    idempotencyKey: params.idempotencyKey,
  };
  return api.admin.post<IngestCreatorResult>('/creator-ingest', {
    ...options,
    body,
  });
}

/**
 * Ingest a creator profile with result pattern (no throw)
 *
 * Returns a result object with `ok: true` and data on success,
 * or `ok: false` and error on failure.
 *
 * @param params - The ingestion parameters
 * @param options - Optional request options
 * @returns A result object containing either the ingestion result or an error
 *
 * @example
 * ```ts
 * const result = await ingestCreatorSafe({
 *   url: 'https://linktr.ee/artist_name',
 * });
 *
 * if (result.ok) {
 *   console.log('Profile created:', result.data.profile.username);
 *   if (result.data.warning) {
 *     console.warn('Warning:', result.data.warning);
 *   }
 * } else {
 *   if (result.error.status === 409) {
 *     console.error('Profile already exists or claimed');
 *   } else if (result.error.status === 502) {
 *     console.error('Could not fetch source profile');
 *   } else {
 *     console.error('Error:', result.error.message);
 *   }
 * }
 * ```
 */
export async function ingestCreatorSafe(
  params: IngestCreatorParams,
  options?: AdminCreatorRequestOptions
): Promise<ApiResult<IngestCreatorResult>> {
  const body: IngestCreatorRequest = {
    url: params.url,
    idempotencyKey: params.idempotencyKey,
  };
  return api.admin.request<IngestCreatorResult>('POST', '/creator-ingest', {
    ...options,
    body,
  });
}

// =============================================================================
// Ingestion Rerun Methods
// =============================================================================

/**
 * Rerun ingestion for an existing profile
 *
 * Queues a background job to re-fetch and update links for an existing profile.
 * Useful for refreshing stale profile data.
 *
 * @param params - The rerun parameters with profileId
 * @param options - Optional request options
 * @returns The rerun response with job ID
 * @throws {ApiError} If the request fails (400 invalid profileId, 401 unauthorized, 403 forbidden, 404 profile not found, 500 queue failed)
 *
 * @example
 * ```ts
 * // Rerun ingestion for a profile
 * const { jobId, profile } = await rerunIngestion({
 *   profileId: 'clx1234567890',
 * });
 *
 * console.log(`Queued job ${jobId} for profile ${profile.username}`);
 * ```
 */
export async function rerunIngestion(
  params: RerunIngestionParams,
  options?: AdminCreatorRequestOptions
): Promise<RerunIngestionResponse> {
  const body: RerunIngestionRequest = {
    profileId: params.profileId,
  };
  return api.admin.post<RerunIngestionResponse>('/creator-ingest/rerun', {
    ...options,
    body,
  });
}

/**
 * Rerun ingestion with result pattern (no throw)
 *
 * @param params - The rerun parameters with profileId
 * @param options - Optional request options
 * @returns A result object containing either the rerun result or an error
 *
 * @example
 * ```ts
 * const result = await rerunIngestionSafe({
 *   profileId: 'clx1234567890',
 * });
 *
 * if (result.ok) {
 *   console.log('Ingestion job queued:', result.data.jobId);
 * } else {
 *   if (result.error.isNotFound()) {
 *     console.error('Profile not found');
 *   } else {
 *     console.error('Error:', result.error.message);
 *   }
 * }
 * ```
 */
export async function rerunIngestionSafe(
  params: RerunIngestionParams,
  options?: AdminCreatorRequestOptions
): Promise<ApiResult<RerunIngestionResponse>> {
  const body: RerunIngestionRequest = {
    profileId: params.profileId,
  };
  return api.admin.request<RerunIngestionResponse>(
    'POST',
    '/creator-ingest/rerun',
    {
      ...options,
      body,
    }
  );
}

// =============================================================================
// Avatar Update Methods
// =============================================================================

/**
 * Update a creator's avatar
 *
 * Admin-only operation to update a creator's avatar URL.
 * The URL must use HTTPS and be from an allowed host.
 *
 * @param params - The update parameters with profileId and avatarUrl
 * @param options - Optional request options
 * @returns The response with the new avatar URL
 * @throws {ApiError} If the request fails (400 invalid URL, 401 unauthorized, 403 forbidden, 500 update failed)
 *
 * @example
 * ```ts
 * const { avatarUrl } = await updateCreatorAvatar({
 *   profileId: 'clx1234567890',
 *   avatarUrl: 'https://example.com/new-avatar.jpg',
 * });
 *
 * console.log('Avatar updated to:', avatarUrl);
 * ```
 */
export async function updateCreatorAvatar(
  params: UpdateCreatorAvatarParams,
  options?: AdminCreatorRequestOptions
): Promise<UpdateCreatorAvatarResponse> {
  const body: UpdateCreatorAvatarRequest = {
    profileId: params.profileId,
    avatarUrl: params.avatarUrl,
  };
  return api.admin.post<UpdateCreatorAvatarResponse>('/creator-avatar', {
    ...options,
    body,
  });
}

/**
 * Update a creator's avatar with result pattern (no throw)
 *
 * @param params - The update parameters with profileId and avatarUrl
 * @param options - Optional request options
 * @returns A result object containing either the update result or an error
 *
 * @example
 * ```ts
 * const result = await updateCreatorAvatarSafe({
 *   profileId: 'clx1234567890',
 *   avatarUrl: 'https://example.com/new-avatar.jpg',
 * });
 *
 * if (result.ok) {
 *   console.log('Avatar updated:', result.data.avatarUrl);
 * } else {
 *   if (result.error.status === 400) {
 *     console.error('Invalid avatar URL:', result.error.message);
 *   } else {
 *     console.error('Error:', result.error.message);
 *   }
 * }
 * ```
 */
export async function updateCreatorAvatarSafe(
  params: UpdateCreatorAvatarParams,
  options?: AdminCreatorRequestOptions
): Promise<ApiResult<UpdateCreatorAvatarResponse>> {
  const body: UpdateCreatorAvatarRequest = {
    profileId: params.profileId,
    avatarUrl: params.avatarUrl,
  };
  return api.admin.request<UpdateCreatorAvatarResponse>(
    'POST',
    '/creator-avatar',
    {
      ...options,
      body,
    }
  );
}

// =============================================================================
// Social Links Methods
// =============================================================================

/**
 * Get social links for a creator profile
 *
 * Fetches all non-rejected social links for an admin view of a creator.
 * Links are ordered by sort order.
 *
 * @param profileId - The profile ID to fetch links for
 * @param options - Optional request options
 * @returns The response with array of social links
 * @throws {ApiError} If the request fails (400 missing profileId, 401 unauthorized, 403 forbidden, 500 fetch failed)
 *
 * @example
 * ```ts
 * const { links } = await getCreatorSocialLinks('clx1234567890');
 *
 * for (const link of links) {
 *   console.log(`${link.platform}: ${link.url}`);
 * }
 * ```
 */
export async function getCreatorSocialLinks(
  profileId: string,
  options?: AdminCreatorRequestOptions
): Promise<GetCreatorSocialLinksResponse> {
  const queryParams = new URLSearchParams({ profileId });
  return api.admin.get<GetCreatorSocialLinksResponse>(
    `/creator-social-links?${queryParams.toString()}`,
    options
  );
}

/**
 * Get social links for a creator profile with result pattern (no throw)
 *
 * @param profileId - The profile ID to fetch links for
 * @param options - Optional request options
 * @returns A result object containing either the links or an error
 *
 * @example
 * ```ts
 * const result = await getCreatorSocialLinksSafe('clx1234567890');
 *
 * if (result.ok) {
 *   console.log('Found links:', result.data.links.length);
 * } else {
 *   console.error('Error:', result.error.message);
 * }
 * ```
 */
export async function getCreatorSocialLinksSafe(
  profileId: string,
  options?: AdminCreatorRequestOptions
): Promise<ApiResult<GetCreatorSocialLinksResponse>> {
  const queryParams = new URLSearchParams({ profileId });
  return api.admin.request<GetCreatorSocialLinksResponse>(
    'GET',
    `/creator-social-links?${queryParams.toString()}`,
    options
  );
}

// =============================================================================
// Convenience Methods
// =============================================================================

/**
 * Ingest a Linktree profile
 *
 * Convenience method that prepends the Linktree base URL.
 *
 * @param username - The Linktree username (without URL)
 * @param options - Optional request options
 * @returns The ingestion response
 * @throws {ApiError} If the request fails
 *
 * @example
 * ```ts
 * const { profile } = await ingestFromLinktree('artist_name');
 * ```
 */
export async function ingestFromLinktree(
  username: string,
  options?: AdminCreatorRequestOptions
): Promise<IngestCreatorResult> {
  return ingestCreator({ url: `https://linktr.ee/${username}` }, options);
}

/**
 * Ingest a Laylo profile
 *
 * Convenience method that prepends the Laylo base URL.
 *
 * @param username - The Laylo username (without URL)
 * @param options - Optional request options
 * @returns The ingestion response
 * @throws {ApiError} If the request fails
 *
 * @example
 * ```ts
 * const { profile } = await ingestFromLaylo('artist_name');
 * ```
 */
export async function ingestFromLaylo(
  username: string,
  options?: AdminCreatorRequestOptions
): Promise<IngestCreatorResult> {
  return ingestCreator({ url: `https://laylo.com/${username}` }, options);
}

/**
 * Refresh a creator profile
 *
 * Alias for rerunIngestion for more intuitive naming.
 *
 * @param profileId - The profile ID to refresh
 * @param options - Optional request options
 * @returns The rerun response with job ID
 * @throws {ApiError} If the request fails
 *
 * @example
 * ```ts
 * const { jobId } = await refreshProfile('clx1234567890');
 * ```
 */
export async function refreshProfile(
  profileId: string,
  options?: AdminCreatorRequestOptions
): Promise<RerunIngestionResponse> {
  return rerunIngestion({ profileId }, options);
}

/**
 * Refresh a creator profile with result pattern (no throw)
 *
 * @param profileId - The profile ID to refresh
 * @param options - Optional request options
 * @returns A result object containing either the refresh result or an error
 *
 * @example
 * ```ts
 * const result = await refreshProfileSafe('clx1234567890');
 * if (result.ok) {
 *   console.log('Refresh queued:', result.data.jobId);
 * }
 * ```
 */
export async function refreshProfileSafe(
  profileId: string,
  options?: AdminCreatorRequestOptions
): Promise<ApiResult<RerunIngestionResponse>> {
  return rerunIngestionSafe({ profileId }, options);
}

// =============================================================================
// Namespace Export
// =============================================================================

/**
 * Admin creator management API methods
 *
 * Provides typed methods for admin operations on creator profiles.
 * Import and use as a namespace for cleaner code organization.
 *
 * @example
 * ```ts
 * import { adminCreators } from '@/lib/api-client/endpoints/admin/creators';
 *
 * // Ingest a new creator
 * const { profile } = await adminCreators.ingest({
 *   url: 'https://linktr.ee/artist',
 * });
 *
 * // Update their avatar
 * await adminCreators.updateAvatar({
 *   profileId: profile.id,
 *   avatarUrl: 'https://example.com/avatar.jpg',
 * });
 *
 * // Get their social links
 * const { links } = await adminCreators.getSocialLinks(profile.id);
 *
 * // Refresh their profile later
 * await adminCreators.refresh(profile.id);
 *
 * // Safe versions (no throw)
 * const result = await adminCreators.ingestSafe({ url: '...' });
 * if (!result.ok) {
 *   console.error(result.error.message);
 * }
 * ```
 */
export const adminCreators = {
  /**
   * Ingest a creator profile from Linktree or Laylo
   * @see {@link ingestCreator}
   */
  ingest: ingestCreator,

  /**
   * Ingest a creator profile with result pattern (no throw)
   * @see {@link ingestCreatorSafe}
   */
  ingestSafe: ingestCreatorSafe,

  /**
   * Ingest a Linktree profile by username
   * @see {@link ingestFromLinktree}
   */
  ingestFromLinktree,

  /**
   * Ingest a Laylo profile by username
   * @see {@link ingestFromLaylo}
   */
  ingestFromLaylo,

  /**
   * Rerun ingestion for an existing profile
   * @see {@link rerunIngestion}
   */
  rerunIngestion,

  /**
   * Rerun ingestion with result pattern (no throw)
   * @see {@link rerunIngestionSafe}
   */
  rerunIngestionSafe,

  /**
   * Refresh a creator profile (alias for rerunIngestion)
   * @see {@link refreshProfile}
   */
  refresh: refreshProfile,

  /**
   * Refresh a creator profile with result pattern (no throw)
   * @see {@link refreshProfileSafe}
   */
  refreshSafe: refreshProfileSafe,

  /**
   * Update a creator's avatar
   * @see {@link updateCreatorAvatar}
   */
  updateAvatar: updateCreatorAvatar,

  /**
   * Update a creator's avatar with result pattern (no throw)
   * @see {@link updateCreatorAvatarSafe}
   */
  updateAvatarSafe: updateCreatorAvatarSafe,

  /**
   * Get social links for a creator profile
   * @see {@link getCreatorSocialLinks}
   */
  getSocialLinks: getCreatorSocialLinks,

  /**
   * Get social links with result pattern (no throw)
   * @see {@link getCreatorSocialLinksSafe}
   */
  getSocialLinksSafe: getCreatorSocialLinksSafe,
} as const;

// Default export for convenient importing
export default adminCreators;
