/**
 * useSuggestions Tests - Initialization & SuggestionKey
 */
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SuggestedLink } from '@/components/dashboard/organisms/links/hooks/useSuggestions';
import { useSuggestions } from '@/components/dashboard/organisms/links/hooks/useSuggestions';
import { createMockSuggestion } from './useSuggestions.test-utils';

describe('useSuggestions - Initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with provided suggestions', () => {
      const suggestions = [
        createMockSuggestion('instagram'),
        createMockSuggestion('tiktok'),
      ];
      const { result } = renderHook(() =>
        useSuggestions({
          suggestedLinks: suggestions,
          suggestionsEnabled: true,
        })
      );

      expect(result.current.pendingSuggestions).toHaveLength(2);
    });

    it('should initialize with empty array when no suggestions provided', () => {
      const { result } = renderHook(() =>
        useSuggestions({
          suggestedLinks: [],
          suggestionsEnabled: true,
        })
      );

      expect(result.current.pendingSuggestions).toHaveLength(0);
    });

    it('should have hasPendingSuggestions as false when suggestions disabled', () => {
      const suggestions = [createMockSuggestion('instagram')];
      const { result } = renderHook(() =>
        useSuggestions({
          suggestedLinks: suggestions,
          suggestionsEnabled: false,
        })
      );

      expect(result.current.hasPendingSuggestions).toBe(false);
    });

    it('should have hasPendingSuggestions as true when enabled with suggestions', () => {
      const suggestions = [createMockSuggestion('instagram')];
      const { result } = renderHook(() =>
        useSuggestions({
          suggestedLinks: suggestions,
          suggestionsEnabled: true,
        })
      );

      expect(result.current.hasPendingSuggestions).toBe(true);
    });

    it('should have hasPendingSuggestions as false when enabled but no suggestions', () => {
      const { result } = renderHook(() =>
        useSuggestions({
          suggestedLinks: [],
          suggestionsEnabled: true,
        })
      );

      expect(result.current.hasPendingSuggestions).toBe(false);
    });
  });

  describe('suggestionKey', () => {
    it('should return suggestionId when available', () => {
      const suggestion = createMockSuggestion('instagram', {
        suggestionId: 'unique-id-123',
      });
      const { result } = renderHook(() =>
        useSuggestions({
          suggestedLinks: [suggestion],
          suggestionsEnabled: true,
        })
      );

      const key = result.current.suggestionKey(suggestion);
      expect(key).toBe('unique-id-123');
    });

    it('should generate key from platform and URL when no suggestionId', () => {
      const suggestion: SuggestedLink = {
        ...createMockSuggestion('instagram'),
        suggestionId: undefined,
      };
      const { result } = renderHook(() =>
        useSuggestions({
          suggestedLinks: [suggestion],
          suggestionsEnabled: true,
        })
      );

      const key = result.current.suggestionKey(suggestion);
      expect(key).toBe('instagram::https://instagram.com/testuser');
    });

    it('should generate consistent keys for same suggestion', () => {
      const suggestion = createMockSuggestion('instagram');
      const { result } = renderHook(() =>
        useSuggestions({
          suggestedLinks: [suggestion],
          suggestionsEnabled: true,
        })
      );

      const key1 = result.current.suggestionKey(suggestion);
      const key2 = result.current.suggestionKey(suggestion);
      expect(key1).toBe(key2);
    });
  });
});
