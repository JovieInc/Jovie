/**
 * Dashboard Social Links API Endpoint Methods
 *
 * Typed methods for GET, PUT, and PATCH operations on /api/dashboard/social-links.
 * Handles fetching links by profileId, bulk updating links, and accepting/dismissing suggestions.
 *
 * @example
 * ```ts
 * import { dashboardSocialLinks } from '@/lib/api-client/endpoints/dashboard/social-links';
 *
 * // Get social links for a profile
 * const { links } = await dashboardSocialLinks.get('profile-id');
 *
 * // Update all links (bulk replace manual/admin links)
 * const { version } = await dashboardSocialLinks.update({
 *   profileId: 'profile-id',
 *   links: [{ platform: 'spotify', url: 'https://open.spotify.com/artist/...' }],
 * });
 *
 * // Accept a suggested link
 * const { link } = await dashboardSocialLinks.acceptSuggestion({
 *   profileId: 'profile-id',
 *   linkId: 'link-id',
 * });
 *
 * // Dismiss a suggested link
 * const { link } = await dashboardSocialLinks.dismissSuggestion({
 *   profileId: 'profile-id',
 *   linkId: 'link-id',
 * });
 * ```
 */

import { api } from '../../client';
import type { ApiResult, RequestOptions } from '../../types';
import type {
  DashboardSocialLink,
  GetSocialLinksResponse,
  LinkEvidence,
  SocialLinkInput,
  UpdateLinkStateRequest,
  UpdateLinkStateResponse,
  UpdateSocialLinksRequest,
  UpdateSocialLinksResponse,
} from './types';

// =============================================================================
// Response Types (re-exported for convenience)
// =============================================================================

export type {
  DashboardSocialLink,
  GetSocialLinksResponse,
  LinkEvidence,
  SocialLinkInput,
  UpdateLinkStateRequest,
  UpdateLinkStateResponse,
  UpdateSocialLinksRequest,
  UpdateSocialLinksResponse,
};

// =============================================================================
// Helper Types
// =============================================================================

/**
 * Options for social links operations
 */
export interface SocialLinksRequestOptions
  extends Omit<RequestOptions, 'body'> {
  /** AbortSignal for request cancellation */
  signal?: AbortSignal;
}

/**
 * Parameters for updating social links
 */
export interface UpdateSocialLinksParams {
  /** The profile ID to update links for */
  profileId: string;
  /** Array of links to set (replaces existing manual/admin links) */
  links?: SocialLinkInput[];
  /** Idempotency key for deduplication (optional, max 128 chars) */
  idempotencyKey?: string;
  /** Expected version for optimistic locking (optional) */
  expectedVersion?: number;
}

/**
 * Parameters for accepting or dismissing a link suggestion
 */
export interface UpdateLinkStateParams {
  /** The profile ID the link belongs to */
  profileId: string;
  /** The link ID to update */
  linkId: string;
  /** Expected version for optimistic locking (optional) */
  expectedVersion?: number;
}

// =============================================================================
// Social Links Endpoint Methods
// =============================================================================

/**
 * Get social links for a profile
 *
 * @param profileId - The profile ID to fetch links for
 * @param options - Optional request options (timeout, signal, etc.)
 * @returns The social links response containing an array of links
 * @throws {ApiError} If the request fails (400 missing profileId, 401 unauthorized, 404 not found, etc.)
 *
 * @example
 * ```ts
 * // Basic usage
 * const { links } = await getSocialLinks('profile-123');
 *
 * // Filter active links
 * const activeLinks = links.filter(link => link.state === 'active');
 *
 * // Filter suggested links
 * const suggestions = links.filter(link => link.state === 'suggested');
 *
 * // With timeout
 * const { links } = await getSocialLinks('profile-123', { timeout: 5000 });
 * ```
 */
export async function getSocialLinks(
  profileId: string,
  options?: SocialLinksRequestOptions
): Promise<GetSocialLinksResponse> {
  const queryParams = new URLSearchParams({ profileId });
  return api.dashboard.get<GetSocialLinksResponse>(
    `/social-links?${queryParams.toString()}`,
    options
  );
}

/**
 * Get social links for a profile with result pattern (no throw)
 *
 * Returns a result object with `ok: true` and data on success,
 * or `ok: false` and error on failure.
 *
 * @param profileId - The profile ID to fetch links for
 * @param options - Optional request options
 * @returns A result object containing either the links or an error
 *
 * @example
 * ```ts
 * const result = await getSocialLinksSafe('profile-123');
 * if (result.ok) {
 *   console.log('Links:', result.data.links);
 * } else {
 *   if (result.error.isNotFound()) {
 *     console.log('Profile not found');
 *   } else {
 *     console.error('Error:', result.error.message);
 *   }
 * }
 * ```
 */
export async function getSocialLinksSafe(
  profileId: string,
  options?: SocialLinksRequestOptions
): Promise<ApiResult<GetSocialLinksResponse>> {
  const queryParams = new URLSearchParams({ profileId });
  return api.dashboard.request<GetSocialLinksResponse>(
    'GET',
    `/social-links?${queryParams.toString()}`,
    options
  );
}

/**
 * Update social links for a profile (bulk replace)
 *
 * This replaces all manual/admin links with the provided links.
 * Ingested links (suggestions) are preserved.
 *
 * @param params - The update parameters including profileId and links
 * @param options - Optional request options
 * @returns The update response with version number
 * @throws {ApiError} If the request fails (400 validation, 401 unauthorized, 404 not found, 409 version conflict, 429 rate limited)
 *
 * @example
 * ```ts
 * // Replace all manual links
 * const { version } = await updateSocialLinks({
 *   profileId: 'profile-123',
 *   links: [
 *     { platform: 'spotify', url: 'https://open.spotify.com/artist/...' },
 *     { platform: 'instagram', url: 'https://instagram.com/username' },
 *   ],
 * });
 *
 * // With optimistic locking
 * const { version } = await updateSocialLinks({
 *   profileId: 'profile-123',
 *   links: [...],
 *   expectedVersion: 5,
 * });
 *
 * // With idempotency key
 * const { version } = await updateSocialLinks({
 *   profileId: 'profile-123',
 *   links: [...],
 *   idempotencyKey: 'unique-request-id',
 * });
 * ```
 */
export async function updateSocialLinks(
  params: UpdateSocialLinksParams,
  options?: SocialLinksRequestOptions
): Promise<UpdateSocialLinksResponse> {
  const body: UpdateSocialLinksRequest = {
    profileId: params.profileId,
    links: params.links,
    idempotencyKey: params.idempotencyKey,
    expectedVersion: params.expectedVersion,
  };
  return api.dashboard.put<UpdateSocialLinksResponse>('/social-links', {
    ...options,
    body,
  });
}

/**
 * Update social links for a profile with result pattern (no throw)
 *
 * Returns a result object with `ok: true` and data on success,
 * or `ok: false` and error on failure.
 *
 * @param params - The update parameters including profileId and links
 * @param options - Optional request options
 * @returns A result object containing either the update result or an error
 *
 * @example
 * ```ts
 * const result = await updateSocialLinksSafe({
 *   profileId: 'profile-123',
 *   links: [...],
 *   expectedVersion: 5,
 * });
 *
 * if (result.ok) {
 *   console.log('Updated to version:', result.data.version);
 * } else {
 *   if (result.error.status === 409) {
 *     // Version conflict - refresh and retry
 *     console.error('Version conflict, please refresh');
 *   } else if (result.error.isRateLimited()) {
 *     console.error('Rate limited, try again later');
 *   } else {
 *     console.error('Error:', result.error.message);
 *   }
 * }
 * ```
 */
export async function updateSocialLinksSafe(
  params: UpdateSocialLinksParams,
  options?: SocialLinksRequestOptions
): Promise<ApiResult<UpdateSocialLinksResponse>> {
  const body: UpdateSocialLinksRequest = {
    profileId: params.profileId,
    links: params.links,
    idempotencyKey: params.idempotencyKey,
    expectedVersion: params.expectedVersion,
  };
  return api.dashboard.request<UpdateSocialLinksResponse>(
    'PUT',
    '/social-links',
    {
      ...options,
      body,
    }
  );
}

/**
 * Accept a suggested link (changes state from 'suggested' to 'active')
 *
 * Only works on links with state 'suggested'. Will fail if the link
 * is already active or rejected.
 *
 * @param params - The accept parameters including profileId and linkId
 * @param options - Optional request options
 * @returns The update response with the updated link
 * @throws {ApiError} If the request fails (400 invalid state transition, 401 unauthorized, 404 not found, 409 version conflict)
 *
 * @example
 * ```ts
 * // Accept a suggestion
 * const { link } = await acceptSuggestion({
 *   profileId: 'profile-123',
 *   linkId: 'link-456',
 * });
 * console.log('Accepted link:', link.url, 'now active:', link.isActive);
 *
 * // With optimistic locking
 * const { link } = await acceptSuggestion({
 *   profileId: 'profile-123',
 *   linkId: 'link-456',
 *   expectedVersion: 3,
 * });
 * ```
 */
export async function acceptSuggestion(
  params: UpdateLinkStateParams,
  options?: SocialLinksRequestOptions
): Promise<UpdateLinkStateResponse> {
  const body: UpdateLinkStateRequest = {
    profileId: params.profileId,
    linkId: params.linkId,
    action: 'accept',
    expectedVersion: params.expectedVersion,
  };
  return api.dashboard.patch<UpdateLinkStateResponse>('/social-links', {
    ...options,
    body,
  });
}

/**
 * Accept a suggested link with result pattern (no throw)
 *
 * @param params - The accept parameters including profileId and linkId
 * @param options - Optional request options
 * @returns A result object containing either the updated link or an error
 *
 * @example
 * ```ts
 * const result = await acceptSuggestionSafe({
 *   profileId: 'profile-123',
 *   linkId: 'link-456',
 * });
 *
 * if (result.ok) {
 *   console.log('Link accepted:', result.data.link);
 * } else {
 *   if (result.error.status === 400) {
 *     console.error('Cannot accept this link:', result.error.message);
 *   } else {
 *     console.error('Error:', result.error.message);
 *   }
 * }
 * ```
 */
export async function acceptSuggestionSafe(
  params: UpdateLinkStateParams,
  options?: SocialLinksRequestOptions
): Promise<ApiResult<UpdateLinkStateResponse>> {
  const body: UpdateLinkStateRequest = {
    profileId: params.profileId,
    linkId: params.linkId,
    action: 'accept',
    expectedVersion: params.expectedVersion,
  };
  return api.dashboard.request<UpdateLinkStateResponse>(
    'PATCH',
    '/social-links',
    {
      ...options,
      body,
    }
  );
}

/**
 * Dismiss a suggested link (changes state from 'suggested' to 'rejected')
 *
 * Only works on links with state 'suggested'. Will fail if the link
 * is already active or rejected. Dismissed links won't appear in future
 * link fetches.
 *
 * @param params - The dismiss parameters including profileId and linkId
 * @param options - Optional request options
 * @returns The update response with the updated link
 * @throws {ApiError} If the request fails (400 invalid state transition, 401 unauthorized, 404 not found, 409 version conflict)
 *
 * @example
 * ```ts
 * // Dismiss a suggestion
 * const { link } = await dismissSuggestion({
 *   profileId: 'profile-123',
 *   linkId: 'link-456',
 * });
 * console.log('Dismissed link:', link.url);
 *
 * // With optimistic locking
 * const { link } = await dismissSuggestion({
 *   profileId: 'profile-123',
 *   linkId: 'link-456',
 *   expectedVersion: 3,
 * });
 * ```
 */
export async function dismissSuggestion(
  params: UpdateLinkStateParams,
  options?: SocialLinksRequestOptions
): Promise<UpdateLinkStateResponse> {
  const body: UpdateLinkStateRequest = {
    profileId: params.profileId,
    linkId: params.linkId,
    action: 'dismiss',
    expectedVersion: params.expectedVersion,
  };
  return api.dashboard.patch<UpdateLinkStateResponse>('/social-links', {
    ...options,
    body,
  });
}

/**
 * Dismiss a suggested link with result pattern (no throw)
 *
 * @param params - The dismiss parameters including profileId and linkId
 * @param options - Optional request options
 * @returns A result object containing either the updated link or an error
 *
 * @example
 * ```ts
 * const result = await dismissSuggestionSafe({
 *   profileId: 'profile-123',
 *   linkId: 'link-456',
 * });
 *
 * if (result.ok) {
 *   console.log('Link dismissed:', result.data.link);
 * } else {
 *   console.error('Error:', result.error.message);
 * }
 * ```
 */
export async function dismissSuggestionSafe(
  params: UpdateLinkStateParams,
  options?: SocialLinksRequestOptions
): Promise<ApiResult<UpdateLinkStateResponse>> {
  const body: UpdateLinkStateRequest = {
    profileId: params.profileId,
    linkId: params.linkId,
    action: 'dismiss',
    expectedVersion: params.expectedVersion,
  };
  return api.dashboard.request<UpdateLinkStateResponse>(
    'PATCH',
    '/social-links',
    {
      ...options,
      body,
    }
  );
}

// =============================================================================
// Convenience Methods
// =============================================================================

/**
 * Get only active links for a profile
 *
 * @param profileId - The profile ID to fetch links for
 * @param options - Optional request options
 * @returns Array of active links only
 * @throws {ApiError} If the request fails
 *
 * @example
 * ```ts
 * const activeLinks = await getActiveLinks('profile-123');
 * ```
 */
export async function getActiveLinks(
  profileId: string,
  options?: SocialLinksRequestOptions
): Promise<DashboardSocialLink[]> {
  const { links } = await getSocialLinks(profileId, options);
  return links.filter(link => link.state === 'active');
}

/**
 * Get only suggested links for a profile
 *
 * @param profileId - The profile ID to fetch links for
 * @param options - Optional request options
 * @returns Array of suggested links only
 * @throws {ApiError} If the request fails
 *
 * @example
 * ```ts
 * const suggestions = await getSuggestedLinks('profile-123');
 * if (suggestions.length > 0) {
 *   console.log('You have link suggestions to review!');
 * }
 * ```
 */
export async function getSuggestedLinks(
  profileId: string,
  options?: SocialLinksRequestOptions
): Promise<DashboardSocialLink[]> {
  const { links } = await getSocialLinks(profileId, options);
  return links.filter(link => link.state === 'suggested');
}

/**
 * Add a single link to the profile
 *
 * This fetches existing links, adds the new one, and saves.
 * Uses optimistic locking if existing links have versions.
 *
 * @param profileId - The profile ID to add the link to
 * @param link - The link to add
 * @param options - Optional request options
 * @returns The update response with version number
 * @throws {ApiError} If the request fails
 *
 * @example
 * ```ts
 * const { version } = await addLink('profile-123', {
 *   platform: 'twitter',
 *   url: 'https://twitter.com/username',
 * });
 * ```
 */
export async function addLink(
  profileId: string,
  link: SocialLinkInput,
  options?: SocialLinksRequestOptions
): Promise<UpdateSocialLinksResponse> {
  // Fetch existing links to merge
  const { links: existingLinks } = await getSocialLinks(profileId, options);

  // Get current max version for optimistic locking
  const currentVersion =
    existingLinks.length > 0
      ? Math.max(...existingLinks.map(l => l.version))
      : 0;

  // Convert existing active links to input format and add new link
  const updatedLinks: SocialLinkInput[] = [
    ...existingLinks
      .filter(l => l.state === 'active' && l.sourceType !== 'ingested')
      .map(l => ({
        platform: l.platform,
        platformType: l.platformType,
        url: l.url,
        sortOrder: l.sortOrder,
        isActive: l.isActive,
        displayText: l.displayText ?? undefined,
        state: l.state as 'active' | 'suggested' | 'rejected',
        confidence: l.confidence,
        sourcePlatform: l.sourcePlatform ?? undefined,
        sourceType: l.sourceType as 'manual' | 'admin' | 'ingested',
        evidence: l.evidence ?? undefined,
      })),
    {
      ...link,
      sortOrder: link.sortOrder ?? existingLinks.length,
    },
  ];

  return updateSocialLinks(
    {
      profileId,
      links: updatedLinks,
      expectedVersion: currentVersion,
    },
    options
  );
}

/**
 * Remove a link from the profile by ID
 *
 * This fetches existing links, removes the specified one, and saves.
 * Uses optimistic locking.
 *
 * @param profileId - The profile ID to remove the link from
 * @param linkId - The link ID to remove
 * @param options - Optional request options
 * @returns The update response with version number
 * @throws {ApiError} If the request fails or link not found
 *
 * @example
 * ```ts
 * const { version } = await removeLink('profile-123', 'link-456');
 * ```
 */
export async function removeLink(
  profileId: string,
  linkId: string,
  options?: SocialLinksRequestOptions
): Promise<UpdateSocialLinksResponse> {
  // Fetch existing links
  const { links: existingLinks } = await getSocialLinks(profileId, options);

  // Get current max version for optimistic locking
  const currentVersion =
    existingLinks.length > 0
      ? Math.max(...existingLinks.map(l => l.version))
      : 0;

  // Filter out the link to remove and non-ingested active links only
  const updatedLinks: SocialLinkInput[] = existingLinks
    .filter(
      l =>
        l.id !== linkId && l.state === 'active' && l.sourceType !== 'ingested'
    )
    .map((l, idx) => ({
      platform: l.platform,
      platformType: l.platformType,
      url: l.url,
      sortOrder: idx,
      isActive: l.isActive,
      displayText: l.displayText ?? undefined,
      state: l.state as 'active' | 'suggested' | 'rejected',
      confidence: l.confidence,
      sourcePlatform: l.sourcePlatform ?? undefined,
      sourceType: l.sourceType as 'manual' | 'admin' | 'ingested',
      evidence: l.evidence ?? undefined,
    }));

  return updateSocialLinks(
    {
      profileId,
      links: updatedLinks,
      expectedVersion: currentVersion,
    },
    options
  );
}

// =============================================================================
// Namespace Export
// =============================================================================

/**
 * Dashboard social links API methods
 *
 * Provides typed methods for interacting with the dashboard social links API.
 * Import and use as a namespace for cleaner code organization.
 *
 * @example
 * ```ts
 * import { dashboardSocialLinks } from '@/lib/api-client/endpoints/dashboard/social-links';
 *
 * // Get links
 * const { links } = await dashboardSocialLinks.get('profile-123');
 *
 * // Update links
 * const { version } = await dashboardSocialLinks.update({
 *   profileId: 'profile-123',
 *   links: [...],
 * });
 *
 * // Accept/dismiss suggestions
 * await dashboardSocialLinks.acceptSuggestion({ profileId: 'profile-123', linkId: 'link-456' });
 * await dashboardSocialLinks.dismissSuggestion({ profileId: 'profile-123', linkId: 'link-789' });
 *
 * // Convenience methods
 * const activeLinks = await dashboardSocialLinks.getActive('profile-123');
 * const suggestions = await dashboardSocialLinks.getSuggested('profile-123');
 * await dashboardSocialLinks.add('profile-123', { platform: 'twitter', url: '...' });
 * await dashboardSocialLinks.remove('profile-123', 'link-456');
 * ```
 */
export const dashboardSocialLinks = {
  /**
   * Get social links for a profile
   * @see {@link getSocialLinks}
   */
  get: getSocialLinks,

  /**
   * Get social links for a profile with result pattern (no throw)
   * @see {@link getSocialLinksSafe}
   */
  getSafe: getSocialLinksSafe,

  /**
   * Update social links for a profile (bulk replace)
   * @see {@link updateSocialLinks}
   */
  update: updateSocialLinks,

  /**
   * Update social links for a profile with result pattern (no throw)
   * @see {@link updateSocialLinksSafe}
   */
  updateSafe: updateSocialLinksSafe,

  /**
   * Accept a suggested link
   * @see {@link acceptSuggestion}
   */
  acceptSuggestion,

  /**
   * Accept a suggested link with result pattern (no throw)
   * @see {@link acceptSuggestionSafe}
   */
  acceptSuggestionSafe,

  /**
   * Dismiss a suggested link
   * @see {@link dismissSuggestion}
   */
  dismissSuggestion,

  /**
   * Dismiss a suggested link with result pattern (no throw)
   * @see {@link dismissSuggestionSafe}
   */
  dismissSuggestionSafe,

  /**
   * Get only active links for a profile
   * @see {@link getActiveLinks}
   */
  getActive: getActiveLinks,

  /**
   * Get only suggested links for a profile
   * @see {@link getSuggestedLinks}
   */
  getSuggested: getSuggestedLinks,

  /**
   * Add a single link to the profile
   * @see {@link addLink}
   */
  add: addLink,

  /**
   * Remove a link from the profile
   * @see {@link removeLink}
   */
  remove: removeLink,
} as const;

// Default export for convenient importing
export default dashboardSocialLinks;
