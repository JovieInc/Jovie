/**
 * Dashboard Profile API Endpoint Methods
 *
 * Typed methods for GET and PUT operations on /api/dashboard/profile.
 * Handles profile updates including displayName, bio, avatarUrl, venmo_handle, and settings.
 *
 * @example
 * ```ts
 * import { dashboardProfile } from '@/lib/api-client/endpoints/dashboard/profile';
 *
 * // Get the current user's profile
 * const { profile } = await dashboardProfile.get();
 *
 * // Update profile fields
 * const { profile: updated } = await dashboardProfile.update({
 *   displayName: 'New Name',
 *   bio: 'Updated bio',
 * });
 *
 * // Update with result pattern for error handling
 * const result = await dashboardProfile.updateSafe({
 *   venmo_handle: '@username',
 * });
 * if (result.ok) {
 *   console.log('Updated:', result.data.profile);
 * } else {
 *   console.error('Error:', result.error.message);
 * }
 * ```
 */

import { api } from '../../client';
import type { ApiResult, RequestOptions } from '../../types';
import type {
  DashboardProfile,
  GetProfileResponse,
  ProfileSettings,
  ProfileUpdatePayload,
  ThemeSettings,
  UpdateProfileResponse,
} from './types';

// =============================================================================
// Response Types (re-exported for convenience)
// =============================================================================

export type {
  DashboardProfile,
  GetProfileResponse,
  ProfileSettings,
  ProfileUpdatePayload,
  ThemeSettings,
  UpdateProfileResponse,
};

// =============================================================================
// Helper Types
// =============================================================================

/**
 * Options for profile update operations
 */
export interface UpdateProfileOptions extends Omit<RequestOptions, 'body'> {
  /** AbortSignal for request cancellation */
  signal?: AbortSignal;
}

// =============================================================================
// Profile Endpoint Methods
// =============================================================================

/**
 * Get the current user's profile
 *
 * @param options - Optional request options (timeout, signal, etc.)
 * @returns The profile response containing the user's profile data
 * @throws {ApiError} If the request fails (401 unauthorized, 404 not found, etc.)
 *
 * @example
 * ```ts
 * // Basic usage
 * const { profile } = await getProfile();
 *
 * // With timeout
 * const { profile } = await getProfile({ timeout: 5000 });
 *
 * // With abort signal
 * const controller = new AbortController();
 * const { profile } = await getProfile({ signal: controller.signal });
 * ```
 */
export async function getProfile(
  options?: RequestOptions
): Promise<GetProfileResponse> {
  return api.dashboard.get<GetProfileResponse>('/profile', options);
}

/**
 * Get the current user's profile with result pattern (no throw)
 *
 * Returns a result object with `ok: true` and data on success,
 * or `ok: false` and error on failure.
 *
 * @param options - Optional request options
 * @returns A result object containing either the profile or an error
 *
 * @example
 * ```ts
 * const result = await getProfileSafe();
 * if (result.ok) {
 *   console.log('Profile:', result.data.profile);
 * } else {
 *   if (result.error.isNotFound()) {
 *     console.log('Profile not found');
 *   } else {
 *     console.error('Error:', result.error.message);
 *   }
 * }
 * ```
 */
export async function getProfileSafe(
  options?: RequestOptions
): Promise<ApiResult<GetProfileResponse>> {
  return api.dashboard.request<GetProfileResponse>('GET', '/profile', options);
}

/**
 * Update the current user's profile
 *
 * @param updates - The profile fields to update
 * @param options - Optional request options
 * @returns The updated profile response (may include warning if Clerk sync failed)
 * @throws {ApiError} If the request fails (400 validation error, 401 unauthorized, etc.)
 *
 * @example
 * ```ts
 * // Update display name and bio
 * const { profile } = await updateProfile({
 *   displayName: 'New Artist Name',
 *   bio: 'Singer-songwriter from Nashville',
 * });
 *
 * // Update avatar
 * const { profile, warning } = await updateProfile({
 *   avatarUrl: 'https://example.com/avatar.jpg',
 * });
 * if (warning) {
 *   console.warn('Avatar sync warning:', warning);
 * }
 *
 * // Update settings
 * const { profile } = await updateProfile({
 *   settings: { hide_branding: true },
 * });
 *
 * // Update Venmo handle
 * const { profile } = await updateProfile({
 *   venmo_handle: '@myhandle',
 * });
 *
 * // Update theme preference
 * const { profile } = await updateProfile({
 *   theme: { preference: 'dark' },
 * });
 * ```
 */
export async function updateProfile(
  updates: ProfileUpdatePayload,
  options?: UpdateProfileOptions
): Promise<UpdateProfileResponse> {
  return api.dashboard.put<UpdateProfileResponse>('/profile', {
    ...options,
    body: { updates },
  });
}

/**
 * Update the current user's profile with result pattern (no throw)
 *
 * Returns a result object with `ok: true` and data on success,
 * or `ok: false` and error on failure.
 *
 * @param updates - The profile fields to update
 * @param options - Optional request options
 * @returns A result object containing either the updated profile or an error
 *
 * @example
 * ```ts
 * const result = await updateProfileSafe({
 *   displayName: 'New Name',
 * });
 *
 * if (result.ok) {
 *   console.log('Updated profile:', result.data.profile);
 *   if (result.data.warning) {
 *     console.warn('Warning:', result.data.warning);
 *   }
 * } else {
 *   if (result.error.status === 400) {
 *     console.error('Validation error:', result.error.message);
 *   } else {
 *     console.error('Error:', result.error.message);
 *   }
 * }
 * ```
 */
export async function updateProfileSafe(
  updates: ProfileUpdatePayload,
  options?: UpdateProfileOptions
): Promise<ApiResult<UpdateProfileResponse>> {
  return api.dashboard.request<UpdateProfileResponse>('PUT', '/profile', {
    ...options,
    body: { updates },
  });
}

// =============================================================================
// Convenience Methods
// =============================================================================

/**
 * Update just the display name
 *
 * @param displayName - The new display name
 * @param options - Optional request options
 * @returns The updated profile response
 * @throws {ApiError} If the request fails
 *
 * @example
 * ```ts
 * const { profile } = await updateDisplayName('New Artist Name');
 * ```
 */
export async function updateDisplayName(
  displayName: string,
  options?: UpdateProfileOptions
): Promise<UpdateProfileResponse> {
  return updateProfile({ displayName }, options);
}

/**
 * Update just the bio
 *
 * @param bio - The new bio text (max 512 characters)
 * @param options - Optional request options
 * @returns The updated profile response
 * @throws {ApiError} If the request fails
 *
 * @example
 * ```ts
 * const { profile } = await updateBio('Singer-songwriter from Nashville');
 * ```
 */
export async function updateBio(
  bio: string,
  options?: UpdateProfileOptions
): Promise<UpdateProfileResponse> {
  return updateProfile({ bio }, options);
}

/**
 * Update just the avatar URL
 *
 * @param avatarUrl - The new avatar URL (must be http/https)
 * @param options - Optional request options
 * @returns The updated profile response (may include warning if Clerk sync failed)
 * @throws {ApiError} If the request fails
 *
 * @example
 * ```ts
 * const { profile, warning } = await updateAvatar('https://example.com/avatar.jpg');
 * if (warning) {
 *   console.warn('Avatar sync warning:', warning);
 * }
 * ```
 */
export async function updateAvatar(
  avatarUrl: string,
  options?: UpdateProfileOptions
): Promise<UpdateProfileResponse> {
  return updateProfile({ avatarUrl }, options);
}

/**
 * Update the Venmo handle
 *
 * @param venmoHandle - The Venmo handle (with or without @)
 * @param options - Optional request options
 * @returns The updated profile response
 * @throws {ApiError} If the request fails
 *
 * @example
 * ```ts
 * // With @ prefix
 * const { profile } = await updateVenmoHandle('@myhandle');
 *
 * // Without @ prefix (will be normalized)
 * const { profile } = await updateVenmoHandle('myhandle');
 * ```
 */
export async function updateVenmoHandle(
  venmoHandle: string,
  options?: UpdateProfileOptions
): Promise<UpdateProfileResponse> {
  return updateProfile({ venmo_handle: venmoHandle }, options);
}

/**
 * Update profile settings (branding, marketing preferences, etc.)
 *
 * @param settings - The settings to update
 * @param options - Optional request options
 * @returns The updated profile response
 * @throws {ApiError} If the request fails
 *
 * @example
 * ```ts
 * // Hide Jovie branding
 * const { profile } = await updateSettings({ hide_branding: true });
 *
 * // Update marketing preferences
 * const { profile } = await updateSettings({ marketing_emails: false });
 * ```
 */
export async function updateSettings(
  settings: ProfileSettings,
  options?: UpdateProfileOptions
): Promise<UpdateProfileResponse> {
  return updateProfile({ settings }, options);
}

/**
 * Update theme preference
 *
 * @param theme - The theme settings (preference: 'light' | 'dark' | 'system')
 * @param options - Optional request options
 * @returns The updated profile response
 * @throws {ApiError} If the request fails
 *
 * @example
 * ```ts
 * // Set dark mode
 * const { profile } = await updateTheme({ preference: 'dark' });
 *
 * // Set system preference
 * const { profile } = await updateTheme({ preference: 'system' });
 * ```
 */
export async function updateTheme(
  theme: ThemeSettings,
  options?: UpdateProfileOptions
): Promise<UpdateProfileResponse> {
  return updateProfile({ theme }, options);
}

// =============================================================================
// Namespace Export
// =============================================================================

/**
 * Dashboard profile API methods
 *
 * Provides typed methods for interacting with the dashboard profile API.
 * Import and use as a namespace for cleaner code organization.
 *
 * @example
 * ```ts
 * import { dashboardProfile } from '@/lib/api-client/endpoints/dashboard/profile';
 *
 * // Get profile
 * const { profile } = await dashboardProfile.get();
 *
 * // Update profile
 * const { profile } = await dashboardProfile.update({
 *   displayName: 'New Name',
 *   bio: 'Updated bio',
 * });
 *
 * // Safe versions (no throw)
 * const result = await dashboardProfile.getSafe();
 * const updateResult = await dashboardProfile.updateSafe({ displayName: 'New Name' });
 * ```
 */
export const dashboardProfile = {
  /**
   * Get the current user's profile
   * @see {@link getProfile}
   */
  get: getProfile,

  /**
   * Get the current user's profile with result pattern (no throw)
   * @see {@link getProfileSafe}
   */
  getSafe: getProfileSafe,

  /**
   * Update the current user's profile
   * @see {@link updateProfile}
   */
  update: updateProfile,

  /**
   * Update the current user's profile with result pattern (no throw)
   * @see {@link updateProfileSafe}
   */
  updateSafe: updateProfileSafe,

  /**
   * Update just the display name
   * @see {@link updateDisplayName}
   */
  updateDisplayName,

  /**
   * Update just the bio
   * @see {@link updateBio}
   */
  updateBio,

  /**
   * Update just the avatar URL
   * @see {@link updateAvatar}
   */
  updateAvatar,

  /**
   * Update the Venmo handle
   * @see {@link updateVenmoHandle}
   */
  updateVenmoHandle,

  /**
   * Update profile settings
   * @see {@link updateSettings}
   */
  updateSettings,

  /**
   * Update theme preference
   * @see {@link updateTheme}
   */
  updateTheme,
} as const;

// Default export for convenient importing
export default dashboardProfile;
