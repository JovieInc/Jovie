/**
 * Link Management Components
 *
 * Selective exports for the links module.
 * Direct imports to specific files are preferred for better tree-shaking.
 *
 * Example: import { useLinksManager } from './links/hooks/useLinksManager'
 */

// Main orchestration component
export type { GroupedLinksManagerProps } from '../GroupedLinksManager';
export { GroupedLinksManager } from '../GroupedLinksManager';

// UI Components - selectively exported
export { ChatStyleLinkItem } from './ChatStyleLinkItem';
export { ChatStyleLinkList } from './ChatStyleLinkList';
// Hooks - prefer direct imports for better tree-shaking
export {
  type UseDragAndDropOptions,
  type UseDragAndDropReturn,
  useDragAndDrop,
} from './hooks/useDragAndDrop';
export {
  type UseLinksManagerOptions,
  type UseLinksManagerReturn,
  useLinksManager,
  type YouTubePromptState,
} from './hooks/useLinksManager';
export { useLinksPersistence } from './hooks/useLinksPersistence';
export {
  type EditingField,
  useProfileEditor,
} from './hooks/useProfileEditor';
export { useSuggestionSync } from './hooks/useSuggestionSync';
export {
  type SuggestedLink,
  type UseSuggestionsReturn,
  useSuggestions,
} from './hooks/useSuggestions';
export { IngestedSuggestions } from './IngestedSuggestions';
export { QuickAddSuggestions } from './QuickAddSuggestions';
export { SortableLinkItem } from './SortableLinkItem';
// Types - commonly used
export type { LinkItem, Platform, PlatformType } from './types';
// Utilities - commonly used
export {
  CROSS_CATEGORY,
  type LinkSection,
  sectionOf,
} from './utils/link-categorization';
export { compactUrlDisplay, labelFor } from './utils/link-display-utils';
export { getPlatformCategory } from './utils/platform-category';
export { YouTubeCrossCategoryPrompt } from './YouTubeCrossCategoryPrompt';
