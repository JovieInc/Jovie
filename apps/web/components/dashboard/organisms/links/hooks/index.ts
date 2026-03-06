/**
 * Link Hooks
 *
 * Barrel export for link-related custom hooks.
 * Re-exports all hooks for clean imports.
 */

export type {
  UseDragAndDropOptions,
  UseDragAndDropReturn,
} from './useDragAndDrop';
export { useDragAndDrop } from './useDragAndDrop';
export type {
  UseLinksManagerOptions,
  UseLinksManagerReturn,
  YouTubePromptState,
} from './useLinksManager';
export { useLinksManager } from './useLinksManager';
export type {
  UseLinksPersistenceOptions,
  UseLinksPersistenceReturn,
} from './useLinksPersistence';
export { useLinksPersistence } from './useLinksPersistence';
export type {
  EditingField,
  UseProfileEditorOptions,
  UseProfileEditorReturn,
} from './useProfileEditor';
export { useProfileEditor } from './useProfileEditor';
export type {
  UseSuggestionSyncOptions,
  UseSuggestionSyncReturn,
} from './useSuggestionSync';
export { useSuggestionSync } from './useSuggestionSync';
export type {
  SuggestedLink,
  UseSuggestionsOptions,
  UseSuggestionsReturn,
} from './useSuggestions';
export { useSuggestions } from './useSuggestions';
