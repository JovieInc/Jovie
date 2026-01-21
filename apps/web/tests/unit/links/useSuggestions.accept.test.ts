/**
 * useSuggestions Tests - handleAccept
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSuggestions } from '@/components/dashboard/organisms/links/hooks/useSuggestions';
import { track } from '@/lib/analytics';
import { createMockSuggestion } from './useSuggestions.test-utils';

describe('useSuggestions - handleAccept', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
});
