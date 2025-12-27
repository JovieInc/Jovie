/**
 * Dashboard API Endpoints
 *
 * Centralized exports for all dashboard API endpoint methods.
 * Import from this module to access typed methods for dashboard operations.
 *
 * @example
 * ```ts
 * // Import specific namespaces
 * import {
 *   dashboardProfile,
 *   dashboardSocialLinks,
 *   dashboardAnalytics,
 *   dashboardAudience,
 *   dashboardActivity,
 *   dashboardTheme,
 * } from '@/lib/api-client/endpoints/dashboard';
 *
 * // Or import everything
 * import * as dashboard from '@/lib/api-client/endpoints/dashboard';
 *
 * // Use individual methods
 * const { profile } = await dashboardProfile.get();
 * const stats = await dashboardAnalytics.get({ range: '7d' });
 * const { members } = await dashboardAudience.getMembers({ profileId: 'id' });
 * ```
 */

// =============================================================================
// Type Exports
// =============================================================================

// Export all types from the types module
export * from './types';

// =============================================================================
// Module Exports
// =============================================================================

// Activity exports
export {
  // Namespace
  dashboardActivity,
  // Types
  type GetActivityOptions,
  getMonthActivity,
  getQuarterActivity,
  // Individual methods
  getRecentActivity,
  getRecentActivitySafe,
  getWeekActivity,
} from './activity';
// Analytics exports
export {
  // Types
  type AnalyticsRequestOptions,
  // Namespace
  dashboardAnalytics,
  // Individual methods
  getAnalytics,
  getAnalyticsSafe,
  getFullAnalytics,
  getTrafficAnalytics,
  refreshAnalytics,
} from './analytics';
// Audience exports
export {
  // Namespace
  dashboardAudience,
  // Types
  type GetMembersOptions,
  type GetSubscribersOptions,
  getAllMembers,
  getAllSubscribers,
  // Individual methods
  getAudienceMembers,
  getAudienceMembersSafe,
  getMostEngaged,
  getRecentSubscribers,
  getRecentVisitors,
  getSubscribers,
  getSubscribersSafe,
  getSuperfans,
} from './audience';
// Profile exports
export {
  // Namespace
  dashboardProfile,
  // Individual methods
  getProfile,
  getProfileSafe,
  // Types
  type UpdateProfileOptions,
  updateAvatar,
  updateBio,
  updateDisplayName,
  updateProfile,
  updateProfileSafe,
  updateSettings,
  updateTheme as updateProfileTheme,
  updateVenmoHandle,
} from './profile';
// Social Links exports
export {
  acceptSuggestion,
  acceptSuggestionSafe,
  addLink,
  // Namespace
  dashboardSocialLinks,
  dismissSuggestion,
  dismissSuggestionSafe,
  getActiveLinks,
  // Individual methods
  getSocialLinks,
  getSocialLinksSafe,
  getSuggestedLinks,
  removeLink,
  // Types
  type SocialLinksRequestOptions,
  type UpdateLinkStateParams,
  type UpdateSocialLinksParams,
  updateSocialLinks,
  updateSocialLinksSafe,
} from './social-links';

// Theme exports
export {
  type CurrentTheme,
  // Namespace
  dashboardTheme,
  // Individual methods
  getTheme,
  getThemeSafe,
  setDark,
  setLight,
  setSystem,
  setTheme,
  setThemeSafe,
  // Types
  type ThemeRequestOptions,
  toggleTheme,
} from './theme';

// =============================================================================
// Combined Namespace
// =============================================================================

import { dashboardActivity } from './activity';
import { dashboardAnalytics } from './analytics';
import { dashboardAudience } from './audience';
import { dashboardProfile } from './profile';
import { dashboardSocialLinks } from './social-links';
import { dashboardTheme } from './theme';

/**
 * Combined dashboard API namespace
 *
 * Provides access to all dashboard endpoint methods through a single object.
 * Useful for dependency injection or when you want all methods in one place.
 *
 * @example
 * ```ts
 * import { dashboard } from '@/lib/api-client/endpoints/dashboard';
 *
 * // Access all endpoint groups
 * const profile = await dashboard.profile.get();
 * const links = await dashboard.socialLinks.get('profile-id');
 * const stats = await dashboard.analytics.get();
 * const members = await dashboard.audience.getMembers({ profileId: 'id' });
 * const activity = await dashboard.activity.get({ profileId: 'id' });
 * const theme = await dashboard.theme.get();
 * ```
 */
export const dashboard = {
  /**
   * Profile endpoint methods
   * @see {@link dashboardProfile}
   */
  profile: dashboardProfile,

  /**
   * Social links endpoint methods
   * @see {@link dashboardSocialLinks}
   */
  socialLinks: dashboardSocialLinks,

  /**
   * Analytics endpoint methods
   * @see {@link dashboardAnalytics}
   */
  analytics: dashboardAnalytics,

  /**
   * Audience endpoint methods
   * @see {@link dashboardAudience}
   */
  audience: dashboardAudience,

  /**
   * Activity endpoint methods
   * @see {@link dashboardActivity}
   */
  activity: dashboardActivity,

  /**
   * Theme endpoint methods
   * @see {@link dashboardTheme}
   */
  theme: dashboardTheme,
} as const;

// Default export
export default dashboard;
