'use client';

/**
 * Search Keyboard Hook
 *
 * Handles keyboard navigation for search results.
 */

import { useCallback } from 'react';
import type { ReleasesEmptyStateAction } from '../types';

export interface SearchResult {
  id: string;
  name: string;
  url: string;
}

export interface UseSearchKeyboardParams {
  showResults: boolean;
  activeResultIndex: number;
  results: SearchResult[];
  dispatch: React.Dispatch<ReleasesEmptyStateAction>;
  onSelect: (result: SearchResult) => void;
}

export function useSearchKeyboard({
  showResults,
  activeResultIndex,
  results,
  dispatch,
  onSelect,
}: UseSearchKeyboardParams) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showResults || results.length === 0) {
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          dispatch({
            type: 'SET_ACTIVE_RESULT_INDEX',
            payload:
              activeResultIndex < results.length - 1
                ? activeResultIndex + 1
                : 0,
          });
          break;
        case 'ArrowUp':
          e.preventDefault();
          dispatch({
            type: 'SET_ACTIVE_RESULT_INDEX',
            payload:
              activeResultIndex > 0
                ? activeResultIndex - 1
                : results.length - 1,
          });
          break;
        case 'Enter':
          e.preventDefault();
          if (activeResultIndex >= 0 && results[activeResultIndex]) {
            onSelect(results[activeResultIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          dispatch({ type: 'SET_SHOW_RESULTS', payload: false });
          dispatch({ type: 'SET_ACTIVE_RESULT_INDEX', payload: -1 });
          break;
      }
    },
    [activeResultIndex, showResults, dispatch, onSelect, results]
  );

  return { handleKeyDown };
}
