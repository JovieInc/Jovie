/**
 * API Client
 *
 * A centralized, type-safe API client for making requests to dashboard and admin endpoints.
 * This module provides consistent error handling, response parsing, and full TypeScript support.
 *
 * ## Features
 *
 * - **Type-safe requests**: Full TypeScript support with inferred response types
 * - **Consistent error handling**: Unified `ApiError` class with helper methods
 * - **Multiple error handling patterns**: Try/catch or Result pattern (ok/error)
 * - **Endpoint groups**: Pre-configured groups for `/api/dashboard/*` and `/api/admin/*`
 * - **Typed endpoint methods**: Pre-built methods for all common operations
 * - **Request cancellation**: AbortSignal support for all requests
 * - **Configurable**: Timeouts, custom headers, callbacks, and more
 *
 * ## Quick Start
 *
 * ### Using pre-built endpoint methods (recommended)
 *
 * The easiest way to use the API client is through the pre-built endpoint methods:
 *
 * ```ts
 * import {
 *   getProfile,
 *   updateProfile,
 *   getSocialLinks,
 *   setThemeSafe,
 * } from '@/lib/api-client/endpoints/dashboard';
 *
 * // Get the user's profile
 * const { profile } = await getProfile();
 *
 * // Update profile with type-safe payload
 * const { profile: updated } = await updateProfile({
 *   displayName: 'New Name',
 *   bio: 'Updated bio',
 * });
 *
 * // Use the "Safe" variant for result-based error handling
 * const result = await setThemeSafe('dark');
 * if (result.ok) {
 *   console.log('Theme updated!');
 * } else {
 *   console.error('Failed:', result.error.message);
 * }
 * ```
 *
 * ### Using namespace imports
 *
 * For better organization, import via namespaces:
 *
 * ```ts
 * import { dashboardProfile, dashboardTheme } from '@/lib/api-client/endpoints/dashboard';
 * import { adminCreators } from '@/lib/api-client/endpoints/admin';
 *
 * // Dashboard operations
 * const { profile } = await dashboardProfile.get();
 * await dashboardTheme.setDark();
 *
 * // Admin operations
 * const { profile: ingested } = await adminCreators.ingest({
 *   url: 'https://linktr.ee/artist',
 * });
 * ```
 *
 * ### Using the raw API client
 *
 * For custom endpoints or advanced use cases:
 *
 * ```ts
 * import { api } from '@/lib/api-client';
 *
 * // GET request
 * const profile = await api.dashboard.get<Profile>('/profile');
 *
 * // PUT request with body
 * await api.dashboard.put('/profile', {
 *   body: { updates: { displayName: 'New Name' } }
 * });
 *
 * // Custom endpoint group
 * const customApi = api.createGroup('/api/custom');
 * const data = await customApi.get<Data>('/endpoint');
 * ```
 *
 * ## Error Handling
 *
 * ### Try/Catch Pattern
 *
 * ```ts
 * import { api, ApiError } from '@/lib/api-client';
 *
 * try {
 *   const profile = await api.dashboard.get<Profile>('/profile');
 * } catch (error) {
 *   if (error instanceof ApiError) {
 *     // Use helper methods to check error type
 *     if (error.isUnauthorized()) {
 *       redirectToLogin();
 *     } else if (error.isNotFound()) {
 *       showNotFoundMessage();
 *     } else if (error.isRateLimited()) {
 *       showRetryLaterMessage();
 *     }
 *     console.error(error.message);
 *   }
 * }
 * ```
 *
 * ### Result Pattern (No Throw)
 *
 * All endpoint methods have a `*Safe` variant that returns a result object:
 *
 * ```ts
 * import { getProfileSafe } from '@/lib/api-client/endpoints/dashboard';
 *
 * const result = await getProfileSafe();
 * if (result.ok) {
 *   // TypeScript knows result.data is the response type
 *   console.log(result.data.profile);
 * } else {
 *   // TypeScript knows result.error is ApiError
 *   console.error(result.error.message);
 * }
 * ```
 *
 * ## Architecture
 *
 * ```
 * @/lib/api-client/
 * ├── index.ts              # Main exports (this file)
 * ├── types.ts              # Core types: ApiError, ApiResult, etc.
 * ├── fetcher.ts            # Low-level fetch wrapper
 * ├── client.ts             # API client factory with endpoint groups
 * └── endpoints/
 *     ├── dashboard/        # Dashboard endpoint methods
 *     │   ├── profile.ts    # getProfile, updateProfile, etc.
 *     │   ├── social-links.ts
 *     │   ├── analytics.ts
 *     │   ├── audience.ts
 *     │   ├── activity.ts
 *     │   ├── theme.ts
 *     │   └── index.ts      # Combined exports
 *     └── admin/            # Admin endpoint methods
 *         ├── creators.ts   # ingestCreator, updateAvatar, etc.
 *         └── index.ts      # Combined exports
 * ```
 *
 * @example Basic usage with the default client
 * ```ts
 * import { api } from '@/lib/api-client';
 *
 * // GET request to /api/dashboard/profile
 * const profile = await api.dashboard.get<Profile>('/profile');
 *
 * // PUT request with body to /api/dashboard/profile
 * await api.dashboard.put('/profile', {
 *   body: { updates: { displayName: 'New Name' } }
 * });
 *
 * // POST request to /api/admin/creator-ingest
 * const result = await api.admin.post<IngestResult>('/creator-ingest', {
 *   body: { url: 'https://linktr.ee/username' }
 * });
 * ```
 *
 * @example Error handling with try/catch
 * ```ts
 * import { api, ApiError } from '@/lib/api-client';
 *
 * try {
 *   const profile = await api.dashboard.get<Profile>('/profile');
 * } catch (error) {
 *   if (error instanceof ApiError) {
 *     if (error.isUnauthorized()) {
 *       // Handle 401
 *     } else if (error.isNotFound()) {
 *       // Handle 404
 *     }
 *     console.error(error.message);
 *   }
 * }
 * ```
 *
 * @example Error handling with result pattern
 * ```ts
 * import { api } from '@/lib/api-client';
 *
 * const result = await api.dashboard.request<Profile>('GET', '/profile');
 * if (result.ok) {
 *   console.log(result.data);
 * } else {
 *   console.error(result.error.message);
 * }
 * ```
 *
 * @example Creating a custom client with configuration
 * ```ts
 * import { createApiClient } from '@/lib/api-client';
 *
 * const customApi = createApiClient({
 *   timeout: 5000,
 *   onError: (error) => {
 *     console.error('API error:', error.message);
 *   },
 * });
 * ```
 *
 * @module api-client
 */

// =============================================================================
// Main Client Exports
// =============================================================================

export type { ApiClient, EndpointGroup } from './client';
export { api, createApiClient } from './client';

// =============================================================================
// Type Exports
// =============================================================================

export type {
  // Configuration
  ApiClientConfig,
  // Error types
  ApiErrorOptions,
  ApiErrorResponse,
  // Response types
  ApiResponse,
  ApiResult,
  // HTTP types
  HttpMethod,
  HttpStatusCode,
  // Request types
  RequestOptions,
  RequestWithBodyOptions,
} from './types';
export {
  // Error handling
  ApiError,
  ApiErrorCode,
  // Default configuration
  DEFAULT_API_CLIENT_CONFIG,
  isApiError,
  isApiErrorResponse,
} from './types';

// =============================================================================
// Fetcher Exports (for advanced use cases)
// =============================================================================

export {
  configureGlobalFetcher,
  // Factory and configuration
  createFetcher,
  del,
  // Default fetcher instance
  fetcher,
  // Convenience methods
  get,
  patch,
  post,
  put,
  request,
  resetGlobalFetcher,
} from './fetcher';

// =============================================================================
// Dashboard Endpoint Exports
// =============================================================================

// Dashboard types
export type {
  // Activity types
  ActivityItem,
  AnalyticsRequestOptions,
  // Audience types
  AudienceMember,
  CurrentTheme,
  // Profile types
  DashboardProfile,
  // Social links types
  DashboardSocialLink,
  GetActivityOptions,
  // Analytics types
  GetAnalyticsResponse,
  GetAudienceMembersResponse,
  GetMembersOptions,
  GetProfileResponse,
  GetRecentActivityResponse,
  GetSocialLinksResponse,
  GetSubscribersOptions,
  GetSubscribersResponse,
  ProfileSettings,
  ProfileUpdatePayload,
  SocialLinkInput,
  SocialLinksRequestOptions,
  Subscriber,
  // Theme types
  ThemePreference,
  ThemeRequestOptions,
  ThemeSettings,
  UpdateLinkStateParams,
  UpdateProfileOptions,
  UpdateProfileResponse,
  UpdateSocialLinksParams,
  UpdateSocialLinksResponse,
} from './endpoints/dashboard';
/**
 * Dashboard endpoint methods and types
 *
 * These provide typed, pre-built methods for all dashboard API operations.
 * See individual modules for detailed documentation.
 *
 * @example
 * ```ts
 * import { dashboardProfile, getProfile, updateProfile } from '@/lib/api-client';
 *
 * // Using namespace
 * const { profile } = await dashboardProfile.get();
 *
 * // Using individual methods
 * const { profile: updated } = await updateProfile({ displayName: 'New Name' });
 * ```
 */
export {
  acceptSuggestion,
  acceptSuggestionSafe,
  addLink,
  // Combined namespace
  dashboard,
  // Activity
  dashboardActivity,
  // Analytics
  dashboardAnalytics,
  // Audience
  dashboardAudience,
  // Profile
  dashboardProfile,
  // Social Links
  dashboardSocialLinks,
  // Theme
  dashboardTheme,
  dismissSuggestion,
  dismissSuggestionSafe,
  getActiveLinks,
  getAllMembers,
  getAllSubscribers,
  getAnalytics,
  getAnalyticsSafe,
  getAudienceMembers,
  getAudienceMembersSafe,
  getFullAnalytics,
  getMonthActivity,
  getMostEngaged,
  getProfile,
  getProfileSafe,
  getQuarterActivity,
  getRecentActivity,
  getRecentActivitySafe,
  getRecentSubscribers,
  getRecentVisitors,
  getSocialLinks,
  getSocialLinksSafe,
  getSubscribers,
  getSubscribersSafe,
  getSuggestedLinks,
  getSuperfans,
  getTheme,
  getThemeSafe,
  getTrafficAnalytics,
  getWeekActivity,
  refreshAnalytics,
  removeLink,
  setDark,
  setLight,
  setSystem,
  setTheme,
  setThemeSafe,
  toggleTheme,
  updateAvatar,
  updateBio,
  updateDisplayName,
  updateProfile,
  updateProfileSafe,
  updateProfileTheme,
  updateSettings,
  updateSocialLinks,
  updateSocialLinksSafe,
  updateVenmoHandle,
} from './endpoints/dashboard';

// =============================================================================
// Admin Endpoint Exports
// =============================================================================

// Admin types
export type {
  // Request options
  AdminCreatorRequestOptions,
  // Social links types
  AdminSocialLink,
  GetCreatorSocialLinksResponse,
  IngestCreatorParams,
  IngestCreatorPartialResponse,
  // Ingest types
  IngestCreatorRequest,
  IngestCreatorResponse,
  IngestCreatorResult,
  IngestedProfile,
  RerunIngestionParams,
  // Rerun types
  RerunIngestionRequest,
  RerunIngestionResponse,
  UpdateCreatorAvatarParams,
  // Avatar types
  UpdateCreatorAvatarRequest,
  UpdateCreatorAvatarResponse,
} from './endpoints/admin';
/**
 * Admin endpoint methods and types
 *
 * These provide typed, pre-built methods for all admin API operations.
 * See individual modules for detailed documentation.
 *
 * @example
 * ```ts
 * import { adminCreators, ingestCreator } from '@/lib/api-client';
 *
 * // Using namespace
 * const { profile } = await adminCreators.ingest({ url: 'https://linktr.ee/artist' });
 *
 * // Using individual methods
 * const { profile } = await ingestCreator({ url: 'https://linktr.ee/artist' });
 * ```
 */
export {
  // Combined namespace
  admin,
  // Creators
  adminCreators,
  getCreatorSocialLinks,
  getCreatorSocialLinksSafe,
  ingestCreator,
  ingestCreatorSafe,
  ingestFromLaylo,
  ingestFromLinktree,
  refreshProfile,
  refreshProfileSafe,
  rerunIngestion,
  rerunIngestionSafe,
  updateCreatorAvatar,
  updateCreatorAvatarSafe,
} from './endpoints/admin';
