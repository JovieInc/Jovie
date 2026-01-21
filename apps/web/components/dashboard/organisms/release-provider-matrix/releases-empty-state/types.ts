/**
 * Releases Empty State Types
 *
 * State and action types for the releases empty state component.
 */

export interface ReleasesEmptyStateState {
  searchQuery: string;
  showResults: boolean;
  activeResultIndex: number;
  manualMode: boolean;
  manualUrl: string;
  error: string | null;
}

export type ReleasesEmptyStateAction =
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'SET_SHOW_RESULTS'; payload: boolean }
  | { type: 'SET_ACTIVE_RESULT_INDEX'; payload: number }
  | { type: 'SET_MANUAL_MODE'; payload: boolean }
  | { type: 'SET_MANUAL_URL'; payload: string }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'CLEAR_SEARCH' }
  | { type: 'RESET_MANUAL_MODE' };

export const initialState: ReleasesEmptyStateState = {
  searchQuery: '',
  showResults: false,
  activeResultIndex: -1,
  manualMode: false,
  manualUrl: '',
  error: null,
};
