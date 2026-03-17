/**
 * Link Utilities
 *
 * Barrel export for link-related utility functions.
 * Re-exports all utilities for clean imports.
 */

export {
  CROSS_CATEGORY,
  canMoveTo,
  groupLinks,
  sectionOf,
} from './link-categorization';
export type { LinkSection } from './link-display-utils';
export {
  buildPrefillUrl,
  compactUrlDisplay,
  labelFor,
  suggestionIdentity,
} from './link-display-utils';

export {
  areLinkItemsEqual,
  areSuggestionListsEqual,
  buildPlatformMeta,
  convertDbLinksToLinkItems,
  convertDbLinksToSuggestions,
  convertDbLinkToDetected,
  convertDetectedLinksToLinkItems,
  convertLinksToDashboardFormat,
  mapCategoryForPreview,
} from './link-transformers';

export {
  getHostnameForUrl,
  getPlatformCategory,
  isIngestableUrl,
} from './platform-category';
