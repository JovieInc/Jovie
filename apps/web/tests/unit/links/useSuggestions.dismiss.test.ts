/**
 * useSuggestions Tests - handleDismiss
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSuggestions } from '@/components/dashboard/organisms/links/hooks/useSuggestions';
import { track } from '@/lib/analytics';
import { createMockSuggestion } from './useSuggestions.test-utils';

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

describe('useSuggestions - handleDismiss', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
});
