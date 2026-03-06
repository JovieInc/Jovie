/**
 * Unit tests for useLinksManager hook - YouTube flow + ordering
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { useLinksManager } from '@/components/dashboard/organisms/links/hooks/useLinksManager';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import {
  addLinkAndFlushTimers,
  createMockLink,
} from './useLinksManager.test-utils';

describe('useLinksManager - YouTube + ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('handleAdd - YouTube classification', () => {
    it('should merge duplicate YouTube links in the social section without prompting', async () => {
      const existingYouTube = createMockLink(
        'youtube',
        'social',
        'https://youtube.com/@existing'
      );
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [existingYouTube] })
      );

      const newYouTube = createMockLink(
        'youtube',
        'social',
        'https://youtube.com/@new'
      );

      await act(async () => {
        await addLinkAndFlushTimers(result, newYouTube);
      });

      expect(result.current.ytPrompt).toBeNull();
      expect(result.current.links).toHaveLength(1);
    });
  });

  describe('YouTube prompt flow', () => {
    it('should not open a ytPrompt for duplicate YouTube social links', async () => {
      const existingYouTube = createMockLink(
        'youtube',
        'social',
        'https://youtube.com/@existing'
      );
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [existingYouTube] })
      );

      const newYouTube = createMockLink(
        'youtube',
        'social',
        'https://youtube.com/@new'
      );

      await act(async () => {
        await addLinkAndFlushTimers(result, newYouTube);
      });

      expect(result.current.ytPrompt).toBeNull();
    });

    it('should allow a social YouTube link and a YouTube Music DSP link to coexist', async () => {
      const youTubeSocial = createMockLink(
        'youtube',
        'social',
        'https://youtube.com/@social'
      );
      const youTubeMusic = createMockLink(
        'youtube_music',
        'dsp',
        'https://music.youtube.com/channel/dsp'
      );
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [youTubeSocial] })
      );

      await act(async () => {
        await addLinkAndFlushTimers(result, youTubeMusic);
      });

      expect(result.current.links).toHaveLength(2);
      expect(result.current.ytPrompt).toBeNull();
      expect(result.current.links[1].platform.id).toBe('youtube_music');
      expect(result.current.links[1].platform.category).toBe('dsp');
    });
  });

  describe('insertLinkWithSectionOrdering', () => {
    it('should insert link at end of empty array', () => {
      const { result } = renderHook(() =>
        useLinksManager<DetectedLink>({ initialLinks: [] })
      );

      const newLink = createMockLink('instagram');
      const newLinks = result.current.insertLinkWithSectionOrdering(
        [] as DetectedLink[],
        newLink
      );

      expect(newLinks).toHaveLength(1);
      expect(newLinks[0]).toBe(newLink);
    });

    it('should insert link at end when no matching section exists', () => {
      const { result } = renderHook(() =>
        useLinksManager<DetectedLink>({ initialLinks: [] })
      );

      const existingLinks: DetectedLink[] = [createMockLink('spotify', 'dsp')];
      const newLink = createMockLink('instagram', 'social');
      const newLinks = result.current.insertLinkWithSectionOrdering(
        existingLinks,
        newLink
      );

      expect(newLinks).toHaveLength(2);
      expect(newLinks[1].platform.id).toBe('instagram');
    });

    it('should insert link within section based on popularity', () => {
      const { result } = renderHook(() =>
        useLinksManager<DetectedLink>({ initialLinks: [] })
      );

      const existingLinks: DetectedLink[] = [
        createMockLink('twitter', 'social'),
      ];
      const newLink = createMockLink('instagram', 'social');
      const newLinks = result.current.insertLinkWithSectionOrdering(
        existingLinks,
        newLink
      );

      expect(newLinks).toHaveLength(2);
      expect(newLinks[0].platform.id).toBe('instagram');
      expect(newLinks[1].platform.id).toBe('twitter');
    });
  });

  describe('setLinks', () => {
    it('should allow direct manipulation of links', () => {
      const { result } = renderHook(() =>
        useLinksManager<DetectedLink>({ initialLinks: [] })
      );

      act(() => {
        result.current.setLinks([
          createMockLink('instagram'),
          createMockLink('tiktok'),
        ]);
      });

      expect(result.current.links).toHaveLength(2);
    });

    it('should accept a function to update links', () => {
      const initialLinks = [createMockLink('instagram')];
      const { result } = renderHook(() => useLinksManager({ initialLinks }));

      act(() => {
        result.current.setLinks(prev => [...prev, createMockLink('tiktok')]);
      });

      expect(result.current.links).toHaveLength(2);
    });
  });

  describe('setYtPrompt', () => {
    it('should allow direct manipulation of ytPrompt', () => {
      const { result } = renderHook(() =>
        useLinksManager<DetectedLink>({ initialLinks: [] })
      );

      const candidate = createMockLink('youtube', 'social');

      act(() => {
        result.current.setYtPrompt({
          candidate,
          target: 'dsp',
        });
      });

      expect(result.current.ytPrompt).not.toBeNull();
      expect(result.current.ytPrompt?.target).toBe('dsp');
    });
  });

  describe('setPrefillUrl', () => {
    it('should allow direct manipulation of prefillUrl', () => {
      const { result } = renderHook(() =>
        useLinksManager<DetectedLink>({ initialLinks: [] })
      );

      act(() => {
        result.current.setPrefillUrl('https://instagram.com/newuser');
      });

      expect(result.current.prefillUrl).toBe('https://instagram.com/newuser');
    });
  });
});
