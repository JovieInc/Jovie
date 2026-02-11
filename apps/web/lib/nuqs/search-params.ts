/**
 * Type-safe URL search params configuration using nuqs.
 *
 * This file defines all shared search param parsers used across the application.
 * Using nuqs provides:
 * - Type-safe URL state management
 * - Automatic serialization/deserialization
 * - React hooks for reactive updates
 * - Server-side parsing support
 *
 * @see https://nuqs.dev
 */

import {
  createSearchParamsCache,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs/server';

export { parseAsString as sortFieldParser } from 'nuqs/server';

// ============================================================================
// Pagination Parsers
// ============================================================================

/**
 * Parser for page number.
 * Defaults to 1. Consumers should validate bounds if needed.
 */
export const pageParser = parseAsInteger.withDefault(1);

/**
 * Parser for page size.
 * Defaults to 20. Consumers should enforce max limits if needed.
 */
export const pageSizeParser = parseAsInteger.withDefault(20);

// ============================================================================
// Sorting Parsers
// ============================================================================

/**
 * Sort direction literal type for type-safe sorting.
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Parser for sort direction.
 * Defaults to 'desc' which is common for showing newest items first.
 */
export const sortDirectionParser = parseAsStringLiteral([
  'asc',
  'desc',
] as const).withDefault('desc');

// sortFieldParser is re-exported from nuqs/server at the top of this file

// ============================================================================
// Search Parsers
// ============================================================================

/**
 * Parser for search query strings.
 * Returns null when empty to keep URLs clean.
 */
export const searchQueryParser = parseAsString;

// ============================================================================
// Release Table Search Params
// ============================================================================

/**
 * Valid sort fields for the release table.
 */
export const releaseSortFields = [
  'release',
  'releaseType',
  'popularity',
  'primaryIsrc',
  'upc',
  'label',
  'totalTracks',
  'totalDurationMs',
] as const;

export type ReleaseSortField = (typeof releaseSortFields)[number];

/**
 * Parser for release table sort field.
 */
export const releaseSortParser =
  parseAsStringLiteral(releaseSortFields).withDefault('release');

/**
 * Search params cache for release table pages.
 * Use this in server components to parse URL params.
 *
 * @example
 * ```tsx
 * // In a server component
 * export default async function ReleasesPage({ searchParams }) {
 *   const { sort, direction } = await releaseSearchParams.parse(searchParams);
 *   // Use type-safe params
 * }
 * ```
 */
export const releaseSearchParams = createSearchParamsCache({
  sort: releaseSortParser,
  direction: sortDirectionParser,
});

// ============================================================================
// Audience Table Search Params
// ============================================================================

/**
 * Valid view filters for the audience table.
 * - 'all': All audience members (visitors + identified)
 * - 'subscribers': Notification subscribers only
 * - 'anonymous': Anonymous visitors only
 */
export const audienceViews = ['all', 'subscribers', 'anonymous'] as const;

export type AudienceView = (typeof audienceViews)[number];

/**
 * Parser for audience view filter.
 */
export const audienceViewParser =
  parseAsStringLiteral(audienceViews).withDefault('all');

/**
 * Valid segment filters for the audience table.
 * Applied on top of the view filter to narrow results.
 * - 'highIntent': Only show high-intent visitors
 * - 'returning': Only show returning visitors (visits > 1)
 * - 'frequent': Only show visitors with 3+ visits
 * - 'recent24h': Only show visitors seen in the last 24 hours
 */
export const audienceFilters = [
  'highIntent',
  'returning',
  'frequent',
  'recent24h',
] as const;

export type AudienceFilter = (typeof audienceFilters)[number];

/**
 * Valid sort fields for the audience table.
 */
export const audienceSortFields = [
  'lastSeen',
  'visits',
  'intent',
  'type',
  'engagement',
  'createdAt',
] as const;

export type AudienceSortField = (typeof audienceSortFields)[number];

/**
 * Parser for audience table sort field.
 */
export const audienceSortParser =
  parseAsStringLiteral(audienceSortFields).withDefault('lastSeen');

/**
 * Search params cache for audience table pages.
 * Use this in server components to parse URL params.
 *
 * @example
 * ```tsx
 * // In a server component
 * export default async function AudiencePage({ searchParams }) {
 *   const { page, pageSize, sort, direction, view, segments } = await audienceSearchParams.parse(searchParams);
 *   // Use type-safe params
 * }
 * ```
 */
export const audienceSearchParams = createSearchParamsCache({
  page: pageParser,
  pageSize: pageSizeParser,
  sort: audienceSortParser,
  direction: sortDirectionParser,
  view: audienceViewParser,
  segments: parseAsArrayOf(parseAsString).withDefault([]),
});

// ============================================================================
// Admin Table Search Params
// ============================================================================

/**
 * Valid sort fields for admin creators table.
 * Note: Admin tables use combined field+direction sort values (e.g., 'created_desc')
 * to match existing backend/API expectations, unlike audienceSearchParams which
 * uses separate 'sort' and 'direction' fields.
 */
export const adminCreatorsSortFields = [
  'created_asc',
  'created_desc',
  'verified_desc',
  'verified_asc',
  'claimed_desc',
  'claimed_asc',
] as const;

export type AdminCreatorsSort = (typeof adminCreatorsSortFields)[number];

/**
 * Parser for admin creators sort field.
 */
export const adminCreatorsSortParser = parseAsStringLiteral(
  adminCreatorsSortFields
).withDefault('created_desc');

/**
 * Search params cache for admin creators page.
 */
export const adminCreatorsSearchParams = createSearchParamsCache({
  page: pageParser,
  pageSize: pageSizeParser,
  sort: adminCreatorsSortParser,
  q: searchQueryParser,
});

/**
 * Valid sort fields for admin users table.
 */
export const adminUsersSortFields = [
  'created_asc',
  'created_desc',
  'name_asc',
  'name_desc',
  'email_asc',
  'email_desc',
] as const;

export type AdminUsersSort = (typeof adminUsersSortFields)[number];

/**
 * Parser for admin users sort field.
 */
export const adminUsersSortParser =
  parseAsStringLiteral(adminUsersSortFields).withDefault('created_desc');

/**
 * Search params cache for admin users page.
 */
export const adminUsersSearchParams = createSearchParamsCache({
  page: pageParser,
  pageSize: pageSizeParser,
  sort: adminUsersSortParser,
  q: searchQueryParser,
});

/**
 * Search params cache for admin waitlist page.
 */
export const adminWaitlistSearchParams = createSearchParamsCache({
  page: pageParser,
  pageSize: pageSizeParser,
});

// ============================================================================
// Profile Mode Search Params
// ============================================================================

/**
 * Valid modes for profile page view.
 */
export const profileModes = ['profile', 'listen', 'tip', 'subscribe'] as const;

export type ProfileMode = (typeof profileModes)[number];

/**
 * Parser for profile mode.
 */
export const profileModeParser =
  parseAsStringLiteral(profileModes).withDefault('profile');

/**
 * Search params cache for profile pages.
 */
export const profileSearchParams = createSearchParamsCache({
  mode: profileModeParser,
});

// ============================================================================
// Analytics Search Params
// ============================================================================

/**
 * Valid time range options for analytics.
 */
export const analyticsRanges = ['1d', '7d', '30d', '90d', 'all'] as const;

export type AnalyticsRange = (typeof analyticsRanges)[number];

/**
 * Parser for analytics time range.
 */
export const analyticsRangeParser =
  parseAsStringLiteral(analyticsRanges).withDefault('7d');

/**
 * Valid view options for analytics.
 */
export const analyticsViews = ['traffic', 'engagement', 'referrers'] as const;

export type AnalyticsView = (typeof analyticsViews)[number];

/**
 * Parser for analytics view.
 */
export const analyticsViewParser =
  parseAsStringLiteral(analyticsViews).withDefault('traffic');

/**
 * Search params cache for analytics pages.
 */
export const analyticsSearchParams = createSearchParamsCache({
  range: analyticsRangeParser,
  view: analyticsViewParser,
});

// ============================================================================
// Re-export nuqs primitives for convenience
// ============================================================================

export {
  createSearchParamsCache,
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsJson,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs/server';
