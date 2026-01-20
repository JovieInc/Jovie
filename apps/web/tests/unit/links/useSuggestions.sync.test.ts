/**
 * useSuggestions Tests - Sync, setPendingSuggestions & Edge Cases
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSuggestions } from '@/components/dashboard/organisms/links/hooks/useSuggestions';
import * as analytics from '@/lib/analytics';
import { createMockSuggestion } from './useSuggestions.test-utils';

describe('useSuggestions - Sync & Edge Cases', () => {
  let trackSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    trackSpy = vi.spyOn(analytics, 'track');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sync with external suggestedLinks prop', () => {
    it('should update pendingSuggestions when suggestedLinks changes', async () => {
      const initialSuggestions = [
        createMockSuggestion('instagram', { suggestionId: 'sug-1' }),
      ];
      const newSuggestions = [
        createMockSuggestion('tiktok', { suggestionId: 'sug-2' }),
        createMockSuggestion('twitter', { suggestionId: 'sug-3' }),
      ];

      const { result, rerender } = renderHook(
        ({ suggestions }) =>
          useSuggestions({
            suggestedLinks: suggestions,
            suggestionsEnabled: true,
          }),
        { initialProps: { suggestions: initialSuggestions } }
      );

      expect(result.current.pendingSuggestions).toHaveLength(1);

      rerender({ suggestions: newSuggestions });

      await waitFor(() => {
        expect(result.current.pendingSuggestions).toHaveLength(2);
      });
    });

    it('should not update when suggestedLinks signature is the same', () => {
      const suggestion = createMockSuggestion('instagram', {
        suggestionId: 'sug-1',
      });

      const { result, rerender } = renderHook(
        ({ suggestions }) =>
          useSuggestions({
            suggestedLinks: suggestions,
            suggestionsEnabled: true,
          }),
        { initialProps: { suggestions: [suggestion] } }
      );

      // Remove one via dismiss
      act(() => {
        result.current.setPendingSuggestions([]);
      });

      expect(result.current.pendingSuggestions).toHaveLength(0);

      // Re-render with "same" external suggestions (same signature)
      rerender({ suggestions: [suggestion] });

      // Should NOT restore because signature hasn't changed
      expect(result.current.pendingSuggestions).toHaveLength(0);
    });

    it('should update when signature changes', async () => {
      const suggestion1 = createMockSuggestion('instagram', {
        suggestionId: 'sug-1',
      });
      const suggestion2 = createMockSuggestion('tiktok', {
        suggestionId: 'sug-2',
      });

      const { result, rerender } = renderHook(
        ({ suggestions }) =>
          useSuggestions({
            suggestedLinks: suggestions,
            suggestionsEnabled: true,
          }),
        { initialProps: { suggestions: [suggestion1] } }
      );

      expect(result.current.pendingSuggestions).toHaveLength(1);

      // Change to different suggestions (different signature)
      rerender({ suggestions: [suggestion2] });

      await waitFor(() => {
        expect(result.current.pendingSuggestions).toHaveLength(1);
        expect(result.current.pendingSuggestions[0].platform.id).toBe('tiktok');
      });
    });
  });

  describe('setPendingSuggestions', () => {
    it('should allow direct manipulation of pendingSuggestions', () => {
      const initialSuggestions = [createMockSuggestion('instagram')];
      const { result } = renderHook(() =>
        useSuggestions({
          suggestedLinks: initialSuggestions,
          suggestionsEnabled: true,
        })
      );

      act(() => {
        result.current.setPendingSuggestions([]);
      });

      expect(result.current.pendingSuggestions).toHaveLength(0);
    });

    it('should accept a function to update pendingSuggestions', () => {
      const initialSuggestions = [
        createMockSuggestion('instagram', { suggestionId: 'sug-1' }),
        createMockSuggestion('tiktok', { suggestionId: 'sug-2' }),
      ];
      const { result } = renderHook(() =>
        useSuggestions({
          suggestedLinks: initialSuggestions,
          suggestionsEnabled: true,
        })
      );

      act(() => {
        result.current.setPendingSuggestions(prev =>
          prev.filter(s => s.platform.id !== 'instagram')
        );
      });

      expect(result.current.pendingSuggestions).toHaveLength(1);
      expect(result.current.pendingSuggestions[0].platform.id).toBe('tiktok');
    });
  });

  describe('edge cases', () => {
    it('should handle suggestions with null confidence', async () => {
      const suggestion = createMockSuggestion('instagram');
      suggestion.confidence = null;

      const { result } = renderHook(() =>
        useSuggestions({
          suggestedLinks: [suggestion],
          suggestionsEnabled: true,
          profileId: 'profile-test',
        })
      );

      await act(async () => {
        await result.current.handleAccept(suggestion);
      });

      expect(trackSpy).toHaveBeenCalledWith(
        'dashboard_link_suggestion_accept',
        {
          platform: 'instagram',
          sourcePlatform: 'instagram',
          sourceType: 'bio',
          confidence: undefined,
          hasIdentity: true,
        }
      );
    });

    it('should handle suggestions with null sourcePlatform and sourceType', async () => {
      const suggestion = createMockSuggestion('instagram');
      suggestion.sourcePlatform = null;
      suggestion.sourceType = null;

      const { result } = renderHook(() =>
        useSuggestions({
          suggestedLinks: [suggestion],
          suggestionsEnabled: true,
        })
      );

      await act(async () => {
        await result.current.handleAccept(suggestion);
      });

      expect(trackSpy).toHaveBeenCalledWith(
        'dashboard_link_suggestion_accept',
        {
          platform: 'instagram',
          sourcePlatform: undefined,
          sourceType: undefined,
          confidence: 0.85,
          hasIdentity: true,
        }
      );
    });

    it('should handle undefined profileId', async () => {
      const suggestion = createMockSuggestion('instagram');

      renderHook(() =>
        useSuggestions({
          suggestedLinks: [suggestion],
          suggestionsEnabled: true,
          // no profileId
        })
      );

      await waitFor(() => {
        expect(trackSpy).toHaveBeenCalledWith('link_suggestion_surfaced', {
          platformId: 'instagram',
          sourcePlatform: 'instagram',
          sourceType: 'bio',
          confidence: 0.85,
          profileId: null,
        });
      });
    });

    it('should handle accepting all suggestions', async () => {
      const suggestions = [
        createMockSuggestion('instagram', { suggestionId: 'sug-1' }),
        createMockSuggestion('tiktok', { suggestionId: 'sug-2' }),
      ];

      const { result } = renderHook(() =>
        useSuggestions({
          suggestedLinks: suggestions,
          suggestionsEnabled: true,
        })
      );

      expect(result.current.hasPendingSuggestions).toBe(true);

      await act(async () => {
        await result.current.handleAccept(suggestions[0]);
        await result.current.handleAccept(suggestions[1]);
      });

      expect(result.current.pendingSuggestions).toHaveLength(0);
      expect(result.current.hasPendingSuggestions).toBe(false);
    });

    it('should handle dismissing all suggestions', async () => {
      const suggestions = [
        createMockSuggestion('instagram', { suggestionId: 'sug-1' }),
        createMockSuggestion('tiktok', { suggestionId: 'sug-2' }),
      ];

      const { result } = renderHook(() =>
        useSuggestions({
          suggestedLinks: suggestions,
          suggestionsEnabled: true,
        })
      );

      await act(async () => {
        await result.current.handleDismiss(suggestions[0]);
        await result.current.handleDismiss(suggestions[1]);
      });

      expect(result.current.pendingSuggestions).toHaveLength(0);
      expect(result.current.hasPendingSuggestions).toBe(false);
    });
  });
});
