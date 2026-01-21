/**
 * Releases Empty State Module
 *
 * Re-exports for the releases empty state component.
 */

export {
  type SearchResult,
  type UseSearchKeyboardParams,
  useSearchKeyboard,
} from './hooks/useSearchKeyboard';
export {
  type SpotifyArtist,
  type UseSpotifyConnectParams,
  useSpotifyConnect,
} from './hooks/useSpotifyConnect';
export { releasesEmptyStateReducer } from './reducer';
export {
  initialState,
  type ReleasesEmptyStateAction,
  type ReleasesEmptyStateState,
} from './types';
export { formatFollowers } from './utils/format-followers';
