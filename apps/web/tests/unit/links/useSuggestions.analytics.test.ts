/**
 * useSuggestions Tests - Surfaced Analytics Tracking
 */
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSuggestions } from '@/components/dashboard/organisms/links/hooks/useSuggestions';
import * as analytics from '@/lib/analytics';
import { createMockSuggestion } from './useSuggestions.test-utils';

describe('useSuggestions - Analytics', () => {
  let trackSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    trackSpy = vi.spyOn(analytics, 'track');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('surfaced analytics tracking', () => {
    it('should track surfaced event for each suggestion when enabled', async () => {
      const suggestions = [
        createMockSuggestion('instagram', { suggestionId: 'sug-1' }),
        createMockSuggestion('tiktok', { suggestionId: 'sug-2' }),
      ];

      renderHook(() =>
        useSuggestions({
          suggestedLinks: suggestions,
          suggestionsEnabled: true,
          profileId: 'profile-123',
        })
      );

      await waitFor(() => {
        expect(trackSpy).toHaveBeenCalledWith('link_suggestion_surfaced', {
          platformId: 'instagram',
          sourcePlatform: 'instagram',
          sourceType: 'bio',
          confidence: 0.85,
          profileId: 'profile-123',
        });
        expect(trackSpy).toHaveBeenCalledWith('link_suggestion_surfaced', {
          platformId: 'tiktok',
          sourcePlatform: 'instagram',
          sourceType: 'bio',
          confidence: 0.85,
          profileId: 'profile-123',
        });
      });
    });

    it('should not track surfaced when suggestions disabled', async () => {
      const suggestions = [createMockSuggestion('instagram')];

      renderHook(() =>
        useSuggestions({
          suggestedLinks: suggestions,
          suggestionsEnabled: false,
        })
      );

      // Flush any pending microtasks
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(trackSpy).not.toHaveBeenCalledWith(
        'link_suggestion_surfaced',
        expect.anything()
      );
    });

    it('should not track same suggestion twice', async () => {
      const suggestion = createMockSuggestion('instagram', {
        suggestionId: 'sug-same',
      });

      const { rerender } = renderHook(
        ({ suggestions }) =>
          useSuggestions({
            suggestedLinks: suggestions,
            suggestionsEnabled: true,
          }),
        { initialProps: { suggestions: [suggestion] } }
      );

      await waitFor(() => {
        expect(trackSpy).toHaveBeenCalledWith(
          'link_suggestion_surfaced',
          expect.objectContaining({ platformId: 'instagram' })
        );
      });

      const initialCallCount = trackSpy.mock.calls.filter(
        call => call[0] === 'link_suggestion_surfaced'
      ).length;

      // Trigger re-render with same suggestions
      rerender({ suggestions: [suggestion] });

      // Flush any pending microtasks
      await new Promise(resolve => setTimeout(resolve, 0));

      const finalCallCount = trackSpy.mock.calls.filter(
        call => call[0] === 'link_suggestion_surfaced'
      ).length;

      // Should not have increased
      expect(finalCallCount).toBe(initialCallCount);
    });
  });
});
