/**
 * UTM Builder Module
 *
 * Comprehensive UTM tracking system for smart links.
 * Provides presets, custom builder, templates, and analytics.
 *
 * @example
 * ```ts
 * import {
 *   buildUTMUrl,
 *   UTM_PRESET_CATEGORIES,
 *   UTM_PRESET_MAP,
 * } from '@/lib/utm';
 *
 * // Build a URL with a preset
 * const preset = UTM_PRESET_MAP['instagram-story'];
 * const result = buildUTMUrl({
 *   url: 'https://example.com/r/my-release',
 *   params: preset.params,
 *   context: { releaseSlug: 'my-release' },
 * });
 * ```
 */

// URL Builder
export {
  buildUTMUrl,
  buildUTMUrlString,
  createSimpleUTMParams,
  formatUTMParamsForDisplay,
  hasUTMParams,
  parseUTMParams,
  resolveUTMParams,
  slugify,
  stripUTMParams,
  validateUTMParams,
} from './build-url';
// Hooks
export {
  getDefaultPopularPresets,
  mergeWithDefaults,
  type SmartSortedPresets,
  type UseUTMPresetSearchOptions,
  type UseUTMPresetSearchReturn,
  type UseUTMSmartSortOptions,
  type UseUTMUsageTrackingOptions,
  type UseUTMUsageTrackingReturn,
  type UTMPresetSearchResult,
  type UTMTrackingMetadata,
  usePresetFilter,
  useUTMPresetRanking,
  useUTMPresetSearch,
  useUTMSmartSort,
  useUTMUsageTracking,
} from './hooks';
// Presets
export {
  ALL_UTM_PRESETS,
  COMMON_UTM_MEDIUMS,
  COMMON_UTM_SOURCES,
  getDefaultQuickPresets,
  getPresetsByCategory,
  searchPresets,
  UTM_PRESET_CATEGORIES,
  UTM_PRESET_CATEGORY_MAP,
  UTM_PRESET_MAP,
} from './presets';
// Share menu item generators
export {
  buildUTMContext,
  getUTMShareActionMenuItems,
  getUTMShareContextMenuItems,
  getUTMShareDropdownItems,
} from './share-menu-items';
// Storage utilities
export {
  calculateScore,
  clearUsageData,
  getAllUsageRecords,
  getPopularPresetIds,
  getPresetUsage,
  getRecentPresetIds,
  loadUsageData,
  recordPresetUsage,
  saveUsageData,
} from './storage';
// Types
export type {
  UTMAnalyticsEvent,
  UTMAnalyticsEventProperties,
  UTMBuildOptions,
  UTMBuildResult,
  UTMContext,
  UTMDropdownConfig,
  UTMParams,
  UTMPlaceholder,
  UTMPreset,
  UTMPresetCategory,
  UTMSortOption,
  UTMTemplate,
  UTMUsageData,
  UTMUsageRecord,
} from './types';
