/**
 * nuqs - Type-safe URL search params for React/Next.js
 *
 * This module provides a centralized configuration for URL state management
 * using the nuqs library. It includes:
 *
 * - Server-side search params parsers and caches
 * - Client-side hooks for reactive URL state
 * - Type-safe definitions for all URL params used in the app
 *
 * @module @/lib/nuqs
 * @see https://nuqs.dev
 *
 * @example Server Component Usage
 * ```tsx
 * import { audienceSearchParams } from '@/lib/nuqs';
 *
 * export default async function AudiencePage({ searchParams }) {
 *   const { page, pageSize, sort } = await audienceSearchParams.parse(searchParams);
 *   // Type-safe params!
 * }
 * ```
 *
 * @example Client Component Usage
 * ```tsx
 * 'use client';
 * import { useTableParams } from '@/lib/nuqs';
 *
 * function DataTable() {
 *   const [{ page, sort }, { setPage, toggleSort }] = useTableParams();
 *   // Reactive URL state!
 * }
 * ```
 */

// Re-export server primitives for convenience
export { createSearchParamsCache } from 'nuqs/server';

// Client-side hooks
export {
  type PaginationActions,
  type PaginationState,
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsJson,
  parseAsString,
  parseAsStringLiteral,
  type SearchActions,
  type SearchState,
  type SortActions,
  type SortState,
  type TableActions,
  type TableState,
  type UsePaginationParamsOptions,
  type UseSearchParamsOptions,
  type UseSortParamsOptions,
  type UseTableParamsOptions,
  // Pagination
  usePaginationParams,
  // Re-exported nuqs primitives
  useQueryState,
  useQueryStates,
  // Search
  useSearchQuery,
  // Sorting
  useSortParams,
  // Combined table state
  useTableParams,
} from './hooks';
// Server-side parsers and caches
export {
  type AdminCreatorsSort,
  type AdminUsersSort,
  type AnalyticsRange,
  type AnalyticsView,
  type AudienceFilter,
  type AudienceSortField,
  type AudienceView,
  adminCreatorsSearchParams,
  // Admin creators
  adminCreatorsSortFields,
  adminCreatorsSortParser,
  adminUsersSearchParams,
  // Admin users
  adminUsersSortFields,
  adminUsersSortParser,
  // Admin waitlist
  adminWaitlistSearchParams,
  analyticsRangeParser,
  // Analytics
  analyticsRanges,
  analyticsSearchParams,
  analyticsViewParser,
  analyticsViews,
  audienceFilters,
  audienceSearchParams,
  // Audience table
  audienceSortFields,
  audienceSortParser,
  audienceViewParser,
  audienceViews,
  type ProfileMode,
  // Base parsers
  pageParser,
  pageSizeParser,
  profileModeParser,
  // Profile
  profileModes,
  profileSearchParams,
  // Types
  type SortDirection,
  searchQueryParser,
  sortDirectionParser,
  sortFieldParser,
} from './search-params';
