/**
 * Unit tests for useSuggestions hook
 *
 * Tests cover: pending suggestions state, accept/dismiss flows with analytics,
 * suggestionKey generation, hasPendingSuggestions, and sync with external props.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the analytics module
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

import type { SuggestedLink } from '@/components/dashboard/organisms/links/hooks/useSuggestions';
import { useSuggestions } from '@/components/dashboard/organisms/links/hooks/useSuggestions';
// Import after mocks
import { track } from '@/lib/analytics';

/**
 * Helper to create a mock SuggestedLink
 */
function createMockSuggestion(
  platformId: string,
  options: {
    suggestionId?: string;
    confidence?: number;
    sourcePlatform?: string;
    sourceType?: string;
    normalizedUrl?: string;
  } = {}
): SuggestedLink {
  const {
    suggestionId = `suggestion-${platformId}-${Date.now()}`,
    confidence = 0.85,
    sourcePlatform = 'instagram',
    sourceType = 'bio',
    normalizedUrl = `https://${platformId}.com/testuser`,
  } = options;

  return {
    platform: {
      id: platformId,
      name: platformId.charAt(0).toUpperCase() + platformId.slice(1),
      category: 'social' as const,
      icon: platformId,
      color: '#000000',
      placeholder: '',
    },
    normalizedUrl,
    originalUrl: normalizedUrl,
    suggestedTitle: `${platformId} suggested link`,
    isValid: true,
    suggestionId,
    state: 'suggested' as const,
    confidence,
    sourcePlatform,
    sourceType,
  };
}

describe('useSuggestions', () => {
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
        expect(track).toHaveBeenCalledWith('link_suggestion_surfaced', {
          platformId: 'instagram',
          sourcePlatform: 'instagram',
          sourceType: 'bio',
          confidence: 0.85,
          profileId: 'profile-123',
        });
        expect(track).toHaveBeenCalledWith('link_suggestion_surfaced', {
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

      expect(track).not.toHaveBeenCalledWith(
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
        expect(track).toHaveBeenCalledWith(
          'link_suggestion_surfaced',
          expect.objectContaining({ platformId: 'instagram' })
        );
      });

      const initialCallCount = vi
        .mocked(track)
        .mock.calls.filter(
          call => call[0] === 'link_suggestion_surfaced'
        ).length;

      // Trigger re-render with same suggestions
      rerender({ suggestions: [suggestion] });

      // Flush any pending microtasks
      await new Promise(resolve => setTimeout(resolve, 0));

      const finalCallCount = vi
        .mocked(track)
        .mock.calls.filter(
          call => call[0] === 'link_suggestion_surfaced'
        ).length;

      // Should not have increased
      expect(finalCallCount).toBe(initialCallCount);
    });
  });

  describe('handleAccept', () => {
    it('should call onAcceptSuggestion callback', async () => {
      const onAcceptSuggestion = vi.fn().mockResolvedValue({
        platform: {
          id: 'instagram',
          name: 'Instagram',
          category: 'social',
          icon: 'instagram',
          color: '#000',
          placeholder: '',
        },
        normalizedUrl: 'https://instagram.com/accepted',
        originalUrl: 'https://instagram.com/accepted',
        suggestedTitle: 'Accepted',
        isValid: true,
      });
      const suggestion = createMockSuggestion('instagram');

      const { result } = renderHook(() =>
        useSuggestions({
          suggestedLinks: [suggestion],
          suggestionsEnabled: true,
          onAcceptSuggestion,
        })
      );

      await act(async () => {
        await result.current.handleAccept(suggestion);
      });

      expect(onAcceptSuggestion).toHaveBeenCalledWith(suggestion);
    });

    it('should track acceptance analytics', async () => {
      const onAcceptSuggestion = vi.fn().mockResolvedValue({
        platform: {
          id: 'instagram',
          name: 'Instagram',
          category: 'social',
          icon: 'instagram',
          color: '#000',
          placeholder: '',
        },
        normalizedUrl: 'https://instagram.com/accepted',
        originalUrl: 'https://instagram.com/accepted',
        suggestedTitle: 'Accepted',
        isValid: true,
      });
      const suggestion = createMockSuggestion('instagram', {
        confidence: 0.9,
        sourcePlatform: 'twitter',
        sourceType: 'post',
      });

      const { result } = renderHook(() =>
        useSuggestions({
          suggestedLinks: [suggestion],
          suggestionsEnabled: true,
          profileId: 'profile-456',
          onAcceptSuggestion,
        })
      );

      await act(async () => {
        await result.current.handleAccept(suggestion);
      });

      expect(track).toHaveBeenCalledWith('dashboard_link_suggestion_accept', {
        platform: 'instagram',
        sourcePlatform: 'twitter',
        sourceType: 'post',
        confidence: 0.9,
        hasIdentity: true,
      });

      expect(track).toHaveBeenCalledWith('link_suggestion_accepted', {
        platformId: 'instagram',
        sourcePlatform: 'twitter',
        sourceType: 'post',
        confidence: 0.9,
        profileId: 'profile-456',
      });
    });

    it('should remove suggestion from pending list', async () => {
      const suggestion1 = createMockSuggestion('instagram', {
        suggestionId: 'sug-1',
      });
      const suggestion2 = createMockSuggestion('tiktok', {
        suggestionId: 'sug-2',
      });

      const { result } = renderHook(() =>
        useSuggestions({
          suggestedLinks: [suggestion1, suggestion2],
          suggestionsEnabled: true,
        })
      );

      expect(result.current.pendingSuggestions).toHaveLength(2);

      await act(async () => {
        await result.current.handleAccept(suggestion1);
      });

      expect(result.current.pendingSuggestions).toHaveLength(1);
      expect(result.current.pendingSuggestions[0].platform.id).toBe('tiktok');
    });

    it('should return accepted link from callback', async () => {
      const acceptedLink = {
        platform: {
          id: 'instagram',
          name: 'Instagram',
          category: 'social' as const,
          icon: 'instagram',
          color: '#000',
          placeholder: '',
        },
        normalizedUrl: 'https://instagram.com/accepted',
        originalUrl: 'https://instagram.com/accepted',
        suggestedTitle: 'Accepted',
        isValid: true,
      };
      const onAcceptSuggestion = vi.fn().mockResolvedValue(acceptedLink);
      const suggestion = createMockSuggestion('instagram');

      const { result } = renderHook(() =>
        useSuggestions({
          suggestedLinks: [suggestion],
          suggestionsEnabled: true,
          onAcceptSuggestion,
        })
      );

      let returnedLink: unknown;
      await act(async () => {
        returnedLink = await result.current.handleAccept(suggestion);
      });

      expect(returnedLink).toEqual(acceptedLink);
    });

    it('should return null when no callback provided', async () => {
      const suggestion = createMockSuggestion('instagram');

      const { result } = renderHook(() =>
        useSuggestions({
          suggestedLinks: [suggestion],
          suggestionsEnabled: true,
        })
      );

      let returnedLink: unknown;
      await act(async () => {
        returnedLink = await result.current.handleAccept(suggestion);
      });

      expect(returnedLink).toBeNull();
    });

    it('should not track link_suggestion_accepted when callback returns null', async () => {
      const onAcceptSuggestion = vi.fn().mockResolvedValue(null);
      const suggestion = createMockSuggestion('instagram');

      const { result } = renderHook(() =>
        useSuggestions({
          suggestedLinks: [suggestion],
          suggestionsEnabled: true,
          onAcceptSuggestion,
        })
      );

      await act(async () => {
        await result.current.handleAccept(suggestion);
      });

      expect(track).toHaveBeenCalledWith(
        'dashboard_link_suggestion_accept',
        expect.anything()
      );
      expect(track).not.toHaveBeenCalledWith(
        'link_suggestion_accepted',
        expect.anything()
      );
    });
  });

  describe('handleDismiss', () => {
    it('should call onDismissSuggestion callback', async () => {
      const onDismissSuggestion = vi.fn().mockResolvedValue(undefined);
      const suggestion = createMockSuggestion('instagram');

      const { result } = renderHook(() =>
        useSuggestions({
          suggestedLinks: [suggestion],
          suggestionsEnabled: true,
          onDismissSuggestion,
        })
      );

      await act(async () => {
        await result.current.handleDismiss(suggestion);
      });

      expect(onDismissSuggestion).toHaveBeenCalledWith(suggestion);
    });

    it('should track dismissal analytics', async () => {
      const suggestion = createMockSuggestion('instagram', {
        confidence: 0.7,
        sourcePlatform: 'facebook',
        sourceType: 'linktree',
      });

      const { result } = renderHook(() =>
        useSuggestions({
          suggestedLinks: [suggestion],
          suggestionsEnabled: true,
          profileId: 'profile-789',
        })
      );

      await act(async () => {
        await result.current.handleDismiss(suggestion);
      });

      expect(track).toHaveBeenCalledWith('dashboard_link_suggestion_dismiss', {
        platform: 'instagram',
        sourcePlatform: 'facebook',
        sourceType: 'linktree',
        confidence: 0.7,
        hasIdentity: true,
      });

      expect(track).toHaveBeenCalledWith('link_suggestion_dismissed', {
        platformId: 'instagram',
        sourcePlatform: 'facebook',
        sourceType: 'linktree',
        confidence: 0.7,
        profileId: 'profile-789',
      });
    });

    it('should remove suggestion from pending list', async () => {
      const suggestion1 = createMockSuggestion('instagram', {
        suggestionId: 'sug-1',
      });
      const suggestion2 = createMockSuggestion('tiktok', {
        suggestionId: 'sug-2',
      });

      const { result } = renderHook(() =>
        useSuggestions({
          suggestedLinks: [suggestion1, suggestion2],
          suggestionsEnabled: true,
        })
      );

      expect(result.current.pendingSuggestions).toHaveLength(2);

      await act(async () => {
        await result.current.handleDismiss(suggestion1);
      });

      expect(result.current.pendingSuggestions).toHaveLength(1);
      expect(result.current.pendingSuggestions[0].platform.id).toBe('tiktok');
    });

    it('should work without callback', async () => {
      const suggestion = createMockSuggestion('instagram');

      const { result } = renderHook(() =>
        useSuggestions({
          suggestedLinks: [suggestion],
          suggestionsEnabled: true,
        })
      );

      await act(async () => {
        await result.current.handleDismiss(suggestion);
      });

      expect(result.current.pendingSuggestions).toHaveLength(0);
    });
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

      expect(track).toHaveBeenCalledWith('dashboard_link_suggestion_accept', {
        platform: 'instagram',
        sourcePlatform: 'instagram',
        sourceType: 'bio',
        confidence: undefined,
        hasIdentity: true,
      });
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

      expect(track).toHaveBeenCalledWith('dashboard_link_suggestion_accept', {
        platform: 'instagram',
        sourcePlatform: undefined,
        sourceType: undefined,
        confidence: 0.85,
        hasIdentity: true,
      });
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
        expect(track).toHaveBeenCalledWith('link_suggestion_surfaced', {
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
