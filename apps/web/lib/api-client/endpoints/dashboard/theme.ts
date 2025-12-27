/**
 * Dashboard Theme API Endpoint Methods
 *
 * Typed methods for theme operations via the profile API.
 * Provides a focused interface for getting and updating theme preferences.
 *
 * Note: Theme updates go through the profile API endpoint (PUT /api/dashboard/profile)
 * but this module provides a specialized interface for theme-specific operations.
 *
 * @example
 * ```ts
 * import { dashboardTheme } from '@/lib/api-client/endpoints/dashboard/theme';
 *
 * // Get current theme preference
 * const theme = await dashboardTheme.get();
 * console.log('Current theme:', theme.preference);
 *
 * // Set theme to dark mode
 * await dashboardTheme.setDark();
 *
 * // Set theme to system preference
 * await dashboardTheme.setSystem();
 *
 * // Safe version with result pattern
 * const result = await dashboardTheme.setSafe('dark');
 * if (result.ok) {
 *   console.log('Theme updated to:', result.data.profile.theme?.preference);
 * }
 * ```
 */

import { api } from '../../client';
import type { ApiResult, RequestOptions } from '../../types';
import type {
  DashboardProfile,
  ThemePreference,
  ThemeSettings,
  UpdateProfileResponse,
  UpdateThemeResponse,
} from './types';

// =============================================================================
// Response Types (re-exported for convenience)
// =============================================================================

export type { ThemePreference, ThemeSettings, UpdateThemeResponse };

// =============================================================================
// Helper Types
// =============================================================================

/**
 * Options for theme operations
 */
export interface ThemeRequestOptions extends Omit<RequestOptions, 'body'> {
  /** AbortSignal for request cancellation */
  signal?: AbortSignal;
}

/**
 * Current theme state extracted from profile
 */
export interface CurrentTheme {
  /** Current theme preference ('light', 'dark', or 'system') */
  preference: ThemePreference;
  /** Raw theme settings from profile */
  settings: ThemeSettings | null;
}

// =============================================================================
// Theme Endpoint Methods
// =============================================================================

/**
 * Get the current theme preference
 *
 * Fetches the profile and extracts the theme settings.
 *
 * @param options - Optional request options
 * @returns The current theme settings
 * @throws {ApiError} If the request fails
 *
 * @example
 * ```ts
 * const theme = await getTheme();
 * console.log('Current preference:', theme.preference);
 *
 * // Use the preference for UI
 * if (theme.preference === 'dark') {
 *   enableDarkMode();
 * } else if (theme.preference === 'system') {
 *   enableSystemTheme();
 * } else {
 *   enableLightMode();
 * }
 * ```
 */
export async function getTheme(
  options?: ThemeRequestOptions
): Promise<CurrentTheme> {
  interface ProfileResponse {
    profile: DashboardProfile;
  }

  const { profile } = await api.dashboard.get<ProfileResponse>(
    '/profile',
    options
  );

  const settings = profile.theme;
  const preference: ThemePreference =
    settings?.preference ?? settings?.mode ?? 'system';

  return {
    preference,
    settings,
  };
}

/**
 * Get theme with result pattern (no throw)
 *
 * @param options - Optional request options
 * @returns A result object containing either the theme or an error
 *
 * @example
 * ```ts
 * const result = await getThemeSafe();
 * if (result.ok) {
 *   console.log('Theme:', result.data.preference);
 * } else {
 *   console.error('Failed to get theme:', result.error.message);
 * }
 * ```
 */
export async function getThemeSafe(
  options?: ThemeRequestOptions
): Promise<ApiResult<CurrentTheme>> {
  interface ProfileResponse {
    profile: DashboardProfile;
  }

  const result = await api.dashboard.request<ProfileResponse>(
    'GET',
    '/profile',
    options
  );

  if (!result.ok) {
    return result;
  }

  const settings = result.data.profile.theme;
  const preference: ThemePreference =
    settings?.preference ?? settings?.mode ?? 'system';

  return {
    ok: true,
    data: {
      preference,
      settings,
    },
  };
}

/**
 * Set the theme preference
 *
 * @param preference - The theme preference to set ('light', 'dark', or 'system')
 * @param options - Optional request options
 * @returns The updated profile response
 * @throws {ApiError} If the request fails
 *
 * @example
 * ```ts
 * // Set dark mode
 * await setTheme('dark');
 *
 * // Set light mode
 * await setTheme('light');
 *
 * // Use system preference
 * await setTheme('system');
 * ```
 */
export async function setTheme(
  preference: ThemePreference,
  options?: ThemeRequestOptions
): Promise<UpdateThemeResponse> {
  return api.dashboard.put<UpdateThemeResponse>('/profile', {
    ...options,
    body: {
      updates: {
        theme: { preference },
      },
    },
  });
}

/**
 * Set theme with result pattern (no throw)
 *
 * @param preference - The theme preference to set
 * @param options - Optional request options
 * @returns A result object containing either the updated profile or an error
 *
 * @example
 * ```ts
 * const result = await setThemeSafe('dark');
 * if (result.ok) {
 *   console.log('Theme updated:', result.data.profile.theme);
 * } else {
 *   console.error('Failed to update theme:', result.error.message);
 * }
 * ```
 */
export async function setThemeSafe(
  preference: ThemePreference,
  options?: ThemeRequestOptions
): Promise<ApiResult<UpdateThemeResponse>> {
  return api.dashboard.request<UpdateThemeResponse>('PUT', '/profile', {
    ...options,
    body: {
      updates: {
        theme: { preference },
      },
    },
  });
}

// =============================================================================
// Convenience Methods
// =============================================================================

/**
 * Set theme to light mode
 *
 * @param options - Optional request options
 * @returns The updated profile response
 * @throws {ApiError} If the request fails
 *
 * @example
 * ```ts
 * await setLight();
 * ```
 */
export async function setLight(
  options?: ThemeRequestOptions
): Promise<UpdateProfileResponse> {
  return setTheme('light', options);
}

/**
 * Set theme to dark mode
 *
 * @param options - Optional request options
 * @returns The updated profile response
 * @throws {ApiError} If the request fails
 *
 * @example
 * ```ts
 * await setDark();
 * ```
 */
export async function setDark(
  options?: ThemeRequestOptions
): Promise<UpdateProfileResponse> {
  return setTheme('dark', options);
}

/**
 * Set theme to follow system preference
 *
 * @param options - Optional request options
 * @returns The updated profile response
 * @throws {ApiError} If the request fails
 *
 * @example
 * ```ts
 * await setSystem();
 * ```
 */
export async function setSystem(
  options?: ThemeRequestOptions
): Promise<UpdateProfileResponse> {
  return setTheme('system', options);
}

/**
 * Toggle between light and dark themes
 *
 * If current theme is dark, switches to light.
 * If current theme is light or system, switches to dark.
 *
 * @param options - Optional request options
 * @returns The updated profile response
 * @throws {ApiError} If the request fails
 *
 * @example
 * ```ts
 * // Toggle on button click
 * button.onClick = () => toggleTheme();
 * ```
 */
export async function toggleTheme(
  options?: ThemeRequestOptions
): Promise<UpdateProfileResponse> {
  const current = await getTheme(options);
  const newPreference: ThemePreference =
    current.preference === 'dark' ? 'light' : 'dark';
  return setTheme(newPreference, options);
}

// =============================================================================
// Namespace Export
// =============================================================================

/**
 * Dashboard theme API methods
 *
 * Provides typed methods for interacting with theme settings.
 * Import and use as a namespace for cleaner code organization.
 *
 * @example
 * ```ts
 * import { dashboardTheme } from '@/lib/api-client/endpoints/dashboard/theme';
 *
 * // Get current theme
 * const theme = await dashboardTheme.get();
 *
 * // Set theme
 * await dashboardTheme.set('dark');
 *
 * // Convenience methods
 * await dashboardTheme.setLight();
 * await dashboardTheme.setDark();
 * await dashboardTheme.setSystem();
 * await dashboardTheme.toggle();
 *
 * // Safe versions (no throw)
 * const result = await dashboardTheme.getSafe();
 * const setResult = await dashboardTheme.setSafe('dark');
 * ```
 */
export const dashboardTheme = {
  /**
   * Get the current theme preference
   * @see {@link getTheme}
   */
  get: getTheme,

  /**
   * Get theme with result pattern (no throw)
   * @see {@link getThemeSafe}
   */
  getSafe: getThemeSafe,

  /**
   * Set the theme preference
   * @see {@link setTheme}
   */
  set: setTheme,

  /**
   * Set theme with result pattern (no throw)
   * @see {@link setThemeSafe}
   */
  setSafe: setThemeSafe,

  /**
   * Set theme to light mode
   * @see {@link setLight}
   */
  setLight,

  /**
   * Set theme to dark mode
   * @see {@link setDark}
   */
  setDark,

  /**
   * Set theme to follow system preference
   * @see {@link setSystem}
   */
  setSystem,

  /**
   * Toggle between light and dark themes
   * @see {@link toggleTheme}
   */
  toggle: toggleTheme,
} as const;

// Default export for convenient importing
export default dashboardTheme;
