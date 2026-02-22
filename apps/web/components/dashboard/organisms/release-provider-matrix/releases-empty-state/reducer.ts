/**
 * Releases Empty State Reducer
 *
 * State management for the releases empty state component.
 */

import type {
  ReleasesEmptyStateAction,
  ReleasesEmptyStateState,
} from './types';
import { initialState } from './types';

export function releasesEmptyStateReducer(
  state: ReleasesEmptyStateState,
  action: ReleasesEmptyStateAction
): ReleasesEmptyStateState {
  switch (action.type) {
    case 'SET_SEARCH_QUERY':
      return {
        ...state,
        searchQuery: action.payload,
        activeResultIndex: -1,
        error: null,
      };
    case 'SET_SHOW_RESULTS':
      return { ...state, showResults: action.payload };
    case 'SET_ACTIVE_RESULT_INDEX':
      return { ...state, activeResultIndex: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'CLEAR_SEARCH':
      return {
        ...state,
        searchQuery: '',
        showResults: false,
        activeResultIndex: -1,
      };
    case 'RESET_STATE':
      return initialState;
    default:
      return state;
  }
}
