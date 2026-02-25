import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useSuggestedProfiles } from '@/components/jovie/hooks/useSuggestedProfiles';

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
      new Response(
        JSON.stringify({
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
          starterContext: {
            conversationCount: 2,
            isRecentlyOnboarded: false,
            latestReleaseTitle: null,
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
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
});
