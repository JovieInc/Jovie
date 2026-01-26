/**
 * UTM Builder Hooks
 *
 * React hooks for UTM functionality including search, usage tracking, and sorting.
 */

export {
  type UseUTMPresetSearchOptions,
  type UseUTMPresetSearchReturn,
  type UTMPresetSearchResult,
  usePresetFilter,
  useUTMPresetSearch,
} from './useUTMPresetSearch';
export {
  getDefaultPopularPresets,
  mergeWithDefaults,
  type SmartSortedPresets,
  type UseUTMSmartSortOptions,
  useUTMSmartSort,
} from './useUTMSmartSort';
export {
  type UseUTMUsageTrackingOptions,
  type UseUTMUsageTrackingReturn,
  type UTMTrackingMetadata,
  useUTMPresetRanking,
  useUTMUsageTracking,
} from './useUTMUsageTracking';
