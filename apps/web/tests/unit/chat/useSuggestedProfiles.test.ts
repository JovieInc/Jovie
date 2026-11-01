import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useSuggestedProfiles } from '@/components/jovie/hooks/useSuggestedProfiles';

const defaultStarterContext = {
  conversationCount: 2,
  isRecentlyOnboarded: false,
  latestReleaseTitle: null,
  profileReadiness: {
    hasPhoto: true,
    hasName: true,
    hasHandle: true,
    hasMusicDsp: true,
    isComplete: true,
  },
};

const incompleteReadiness = {
  hasPhoto: false,
  hasName: false,
  hasHandle: false,
  hasMusicDsp: false,
  isComplete: false,
};

const playlistFallbackSuggestion = {
  id: '37i9dQZF1DZ06evO2SKVTu',
  type: 'playlist_fallback' as const,
  platform: 'spotify',
  platformLabel: 'Spotify',
  title: 'This Is Tim White',
  subtitle: 'Official playlist fallback suggestion',
  imageUrl: null,
  externalUrl: 'https://open.spotify.com/playlist/37i9dQZF1DZ06evO2SKVTu',
  confidence: null,
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('useSuggestedProfiles', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not fetch suggestions when disabled', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    const { result } = renderHook(() =>
      useSuggestedProfiles('profile_1', { enabled: false })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.total).toBe(0);
  });

  it('fetches suggestions when enabled', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        suggestions: [
          {
            id: 'suggestion_1',
            type: 'dsp_match',
            platform: 'spotify',
            platformLabel: 'Spotify',
            title: 'Artist Match',
            subtitle: 'Potential profile',
            imageUrl: null,
            externalUrl: null,
            confidence: 0.96,
          },
        ],
        starterContext: defaultStarterContext,
      })
    );

    const { result } = renderHook(() => useSuggestedProfiles('profile_1'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/suggestions?profileId=profile_1'
    );
    expect(result.current.total).toBe(1);
    expect(result.current.starterContext?.conversationCount).toBe(2);
  });

  it('routes playlist confirmation to the playlist fallback approve endpoint', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          suggestions: [playlistFallbackSuggestion],
          starterContext: defaultStarterContext,
        })
      )
      .mockResolvedValueOnce(jsonResponse({ success: true }));

    const { result } = renderHook(() => useSuggestedProfiles('profile_1'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.total).toBe(1);
    });

    await result.current.confirm();

    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      '/api/suggestions/playlist-fallback/37i9dQZF1DZ06evO2SKVTu/approve',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('routes playlist rejection to the playlist fallback reject endpoint', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          suggestions: [playlistFallbackSuggestion],
          starterContext: defaultStarterContext,
        })
      )
      .mockResolvedValueOnce(jsonResponse({ success: true }));

    const { result } = renderHook(() => useSuggestedProfiles('profile_1'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.total).toBe(1);
    });

    await result.current.reject();

    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      '/api/suggestions/playlist-fallback/37i9dQZF1DZ06evO2SKVTu/reject',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  // JOV-8137: liveness claims are gated on server-computed readiness.
  describe('profile readiness gating (JOV-8137)', () => {
    function mockFetchWithContext(context: Record<string, unknown>) {
      return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({
          success: true,
          suggestions: [],
          starterContext: context,
        })
      );
    }

    it('does not show "Your profile is live" for an incomplete profile', async () => {
      mockFetchWithContext({
        ...defaultStarterContext,
        isRecentlyOnboarded: true,
        profileReadiness: incompleteReadiness,
      });

      const { result } = renderHook(() => useSuggestedProfiles('profile_1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(
        result.current.suggestions.some(s => s.type === 'profile_ready')
      ).toBe(false);
    });

    it('shows one nudge card per missing essential instead', async () => {
      mockFetchWithContext({
        ...defaultStarterContext,
        isRecentlyOnboarded: true,
        profileReadiness: incompleteReadiness,
      });

      const { result } = renderHook(() => useSuggestedProfiles('profile_1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const titles = result.current.suggestions.map(s => s.title);
      expect(titles).toEqual([
        'Set a profile photo',
        'Set your artist name',
        'Claim your handle',
        'Add your music (connect Spotify)',
      ]);
    });

    it('shows the live card only when all four essentials are set', async () => {
      mockFetchWithContext({
        ...defaultStarterContext,
        isRecentlyOnboarded: true,
      });

      const { result } = renderHook(() => useSuggestedProfiles('profile_1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0]?.type).toBe('profile_ready');
      expect(result.current.suggestions[0]?.title).toBe('Your profile is live');
    });

    it('shows a single music nudge when only the DSP essential is missing', async () => {
      mockFetchWithContext({
        ...defaultStarterContext,
        isRecentlyOnboarded: true,
        profileReadiness: {
          hasPhoto: true,
          hasName: true,
          hasHandle: true,
          hasMusicDsp: false,
          isComplete: false,
        },
      });

      const { result } = renderHook(() => useSuggestedProfiles('profile_1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0]?.title).toBe(
        'Add your music (connect Spotify)'
      );
    });

    it('never claims liveness when readiness data is missing', async () => {
      const { profileReadiness: _omitted, ...withoutReadiness } =
        defaultStarterContext;
      mockFetchWithContext({
        ...withoutReadiness,
        isRecentlyOnboarded: true,
      });

      const { result } = renderHook(() => useSuggestedProfiles('profile_1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.suggestions).toHaveLength(0);
    });
  });
});
