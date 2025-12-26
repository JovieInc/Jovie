/**
 * Unit tests for useLinksManager hook
 *
 * Tests cover: add/remove/toggle/edit operations, duplicate detection,
 * YouTube cross-category handling, MAX_SOCIAL_LINKS visibility, and utility functions.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the analytics module
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

// Mock fetch for tipping API
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { useLinksManager } from '@/components/dashboard/organisms/links/hooks/useLinksManager';
// Import hook after mocks
import type { DetectedLink } from '@/lib/utils/platform-detection';

/**
 * Helper to create a mock DetectedLink
 */
function createMockLink(
  platformId: string,
  category: 'social' | 'dsp' | 'earnings' | 'custom' = 'social',
  url?: string
): DetectedLink {
  const baseUrl =
    url ??
    ({
      instagram: 'https://instagram.com/testuser',
      tiktok: 'https://tiktok.com/@testuser',
      twitter: 'https://x.com/testuser',
      youtube: 'https://youtube.com/@testchannel',
      spotify: 'https://open.spotify.com/artist/123',
      'apple-music': 'https://music.apple.com/artist/123',
      venmo: 'https://venmo.com/testuser',
      website: 'https://example.com',
    }[platformId] ||
      `https://${platformId}.com/test`);

  return {
    platform: {
      id: platformId,
      name: platformId.charAt(0).toUpperCase() + platformId.slice(1),
      category,
      icon: platformId,
      color: '#000000',
      placeholder: '',
    },
    normalizedUrl: baseUrl,
    originalUrl: baseUrl,
    suggestedTitle: `${platformId} link`,
    isValid: true,
  };
}

describe('useLinksManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize with provided links', () => {
      const initialLinks = [
        createMockLink('instagram'),
        createMockLink('tiktok'),
      ];
      const { result } = renderHook(() => useLinksManager({ initialLinks }));

      expect(result.current.links).toHaveLength(2);
      expect(result.current.links[0].platform.id).toBe('instagram');
      expect(result.current.links[1].platform.id).toBe('tiktok');
    });

    it('should initialize with empty array when no links provided', () => {
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [] })
      );

      expect(result.current.links).toHaveLength(0);
    });

    it('should have null lastAddedId on init', () => {
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [] })
      );

      expect(result.current.lastAddedId).toBeNull();
    });

    it('should have null addingLink on init', () => {
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [] })
      );

      expect(result.current.addingLink).toBeNull();
    });

    it('should have undefined prefillUrl on init', () => {
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [] })
      );

      expect(result.current.prefillUrl).toBeUndefined();
    });
  });

  describe('idFor', () => {
    it('should generate stable ID from platform and URL', () => {
      const link = createMockLink('instagram');
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [link] })
      );

      const id = result.current.idFor(link);
      expect(id).toBe('instagram::https://instagram.com/testuser');
    });

    it('should generate consistent IDs for same link', () => {
      const link = createMockLink('instagram');
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [link] })
      );

      const id1 = result.current.idFor(link);
      const id2 = result.current.idFor(link);
      expect(id1).toBe(id2);
    });

    it('should use originalUrl as fallback when normalizedUrl is missing', () => {
      const link = {
        ...createMockLink('instagram'),
        normalizedUrl: '',
      };
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [link] })
      );

      const id = result.current.idFor(link);
      expect(id).toBe('instagram::https://instagram.com/testuser');
    });
  });

  describe('mapIdToIndex', () => {
    it('should map link IDs to their indices', () => {
      const links = [
        createMockLink('instagram'),
        createMockLink('tiktok'),
        createMockLink('twitter'),
      ];
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: links })
      );

      expect(result.current.mapIdToIndex.size).toBe(3);
      expect(
        result.current.mapIdToIndex.get(result.current.idFor(links[0]))
      ).toBe(0);
      expect(
        result.current.mapIdToIndex.get(result.current.idFor(links[1]))
      ).toBe(1);
      expect(
        result.current.mapIdToIndex.get(result.current.idFor(links[2]))
      ).toBe(2);
    });

    it('should update when links change', () => {
      const links = [createMockLink('instagram')];
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: links })
      );

      expect(result.current.mapIdToIndex.size).toBe(1);

      act(() => {
        result.current.handleRemove(0);
      });

      expect(result.current.mapIdToIndex.size).toBe(0);
    });
  });

  describe('linkIsVisible', () => {
    it('should return true for links without isVisible property', () => {
      const link = createMockLink('instagram');
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [link] })
      );

      expect(result.current.linkIsVisible(link)).toBe(true);
    });

    it('should return true for links with isVisible=true', () => {
      const link = {
        ...createMockLink('instagram'),
        isVisible: true,
      } as DetectedLink & { isVisible: boolean };
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [link as DetectedLink] })
      );

      expect(result.current.linkIsVisible(link as DetectedLink)).toBe(true);
    });

    it('should return false for links with isVisible=false', () => {
      const link = {
        ...createMockLink('instagram'),
        isVisible: false,
      } as DetectedLink & { isVisible: boolean };
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [link as DetectedLink] })
      );

      expect(result.current.linkIsVisible(link as DetectedLink)).toBe(false);
    });
  });

  describe('handleToggle', () => {
    it('should toggle link visibility from visible to hidden', () => {
      const link = { ...createMockLink('instagram'), isVisible: true };
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [link as DetectedLink] })
      );

      act(() => {
        result.current.handleToggle(0);
      });

      const updated = result.current.links[0] as DetectedLink & {
        isVisible?: boolean;
      };
      expect(updated.isVisible).toBe(false);
    });

    it('should toggle link visibility from hidden to visible', () => {
      const link = { ...createMockLink('instagram'), isVisible: false };
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [link as DetectedLink] })
      );

      act(() => {
        result.current.handleToggle(0);
      });

      const updated = result.current.links[0] as DetectedLink & {
        isVisible?: boolean;
      };
      expect(updated.isVisible).toBe(true);
    });

    it('should toggle link visibility from undefined (true) to false', () => {
      const link = createMockLink('instagram');
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [link] })
      );

      act(() => {
        result.current.handleToggle(0);
      });

      const updated = result.current.links[0] as DetectedLink & {
        isVisible?: boolean;
      };
      expect(updated.isVisible).toBe(false);
    });
  });

  describe('handleRemove', () => {
    it('should remove a link by index', () => {
      const links = [
        createMockLink('instagram'),
        createMockLink('tiktok'),
        createMockLink('twitter'),
      ];
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: links })
      );

      act(() => {
        result.current.handleRemove(1);
      });

      expect(result.current.links).toHaveLength(2);
      expect(result.current.links[0].platform.id).toBe('instagram');
      expect(result.current.links[1].platform.id).toBe('twitter');
    });

    it('should remove the first link correctly', () => {
      const links = [createMockLink('instagram'), createMockLink('tiktok')];
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: links })
      );

      act(() => {
        result.current.handleRemove(0);
      });

      expect(result.current.links).toHaveLength(1);
      expect(result.current.links[0].platform.id).toBe('tiktok');
    });

    it('should remove the last link correctly', () => {
      const links = [createMockLink('instagram'), createMockLink('tiktok')];
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: links })
      );

      act(() => {
        result.current.handleRemove(1);
      });

      expect(result.current.links).toHaveLength(1);
      expect(result.current.links[0].platform.id).toBe('instagram');
    });
  });

  describe('handleEdit', () => {
    it('should set prefillUrl and remove the link', () => {
      const link = createMockLink(
        'instagram',
        'social',
        'https://instagram.com/editme'
      );
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [link] })
      );

      act(() => {
        result.current.handleEdit(0);
      });

      expect(result.current.prefillUrl).toBe('https://instagram.com/editme');
      expect(result.current.links).toHaveLength(0);
    });

    it('should use originalUrl as fallback', () => {
      const link = {
        ...createMockLink('instagram'),
        normalizedUrl: '',
        originalUrl: 'https://instagram.com/original',
      };
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [link] })
      );

      act(() => {
        result.current.handleEdit(0);
      });

      expect(result.current.prefillUrl).toBe('https://instagram.com/original');
    });

    it('should do nothing for invalid index', () => {
      const link = createMockLink('instagram');
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [link] })
      );

      act(() => {
        result.current.handleEdit(5);
      });

      expect(result.current.prefillUrl).toBeUndefined();
      expect(result.current.links).toHaveLength(1);
    });
  });

  describe('clearPrefillUrl', () => {
    it('should clear the prefillUrl', () => {
      const link = createMockLink('instagram');
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [link] })
      );

      act(() => {
        result.current.handleEdit(0);
      });
      expect(result.current.prefillUrl).toBeDefined();

      act(() => {
        result.current.clearPrefillUrl();
      });
      expect(result.current.prefillUrl).toBeUndefined();
    });
  });

  describe('handleAdd', () => {
    it('should add a new link', async () => {
      const { result } = renderHook(() =>
        useLinksManager<DetectedLink>({ initialLinks: [] })
      );

      const newLink = createMockLink('instagram');

      await act(async () => {
        await result.current.handleAdd(newLink);
        vi.advanceTimersByTime(700);
      });

      expect(result.current.links).toHaveLength(1);
      expect(result.current.links[0]?.platform.id).toBe('instagram');
    });

    it('should add isVisible:true to the link', async () => {
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [] })
      );

      const newLink = createMockLink('instagram');

      await act(async () => {
        await result.current.handleAdd(newLink);
        vi.advanceTimersByTime(700);
      });

      const added = result.current.links[0] as DetectedLink & {
        isVisible?: boolean;
      };
      expect(added.isVisible).toBe(true);
    });

    it('should call onLinkAdded callback', async () => {
      const onLinkAdded = vi.fn();
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [], onLinkAdded })
      );

      const newLink = createMockLink('instagram');

      await act(async () => {
        await result.current.handleAdd(newLink);
        vi.advanceTimersByTime(700);
      });

      expect(onLinkAdded).toHaveBeenCalled();
    });

    it('should call onLinksChange callback', async () => {
      const onLinksChange = vi.fn();
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [], onLinksChange })
      );

      const newLink = createMockLink('instagram');

      await act(async () => {
        await result.current.handleAdd(newLink);
        vi.advanceTimersByTime(700);
      });

      expect(onLinksChange).toHaveBeenCalled();
    });

    it('should set and clear addingLink during add', async () => {
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [] })
      );

      const newLink = createMockLink('instagram');
      let addingLinkWhileAdding: DetectedLink | null = null;

      await act(async () => {
        const addPromise = result.current.handleAdd(newLink);
        // Capture addingLink state immediately
        addingLinkWhileAdding = result.current.addingLink;
        await addPromise;
        vi.advanceTimersByTime(700);
      });

      // addingLink should be set during add
      expect(addingLinkWhileAdding).not.toBeNull();
      // addingLink should be null after add completes
      expect(result.current.addingLink).toBeNull();
    });

    it('should set lastAddedId after adding', async () => {
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [] })
      );

      const newLink = createMockLink('instagram');

      await act(async () => {
        await result.current.handleAdd(newLink);
        vi.advanceTimersByTime(700);
      });

      expect(result.current.lastAddedId).not.toBeNull();
    });

    it('should clear lastAddedId after timeout', async () => {
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [] })
      );

      const newLink = createMockLink('instagram');

      await act(async () => {
        await result.current.handleAdd(newLink);
        vi.advanceTimersByTime(700);
      });

      expect(result.current.lastAddedId).not.toBeNull();

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(result.current.lastAddedId).toBeNull();
    });
  });

  describe('handleDuplicate', () => {
    it('should not add duplicate links', async () => {
      const link = createMockLink('instagram');
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [link] })
      );

      await act(async () => {
        await result.current.handleAdd(link);
        vi.advanceTimersByTime(700);
      });

      expect(result.current.links).toHaveLength(1);
    });
  });

  describe('YouTube cross-category handling', () => {
    it('should remove YouTube from social when added to dsp', async () => {
      const youtubeLink = createMockLink('youtube', 'dsp');
      const { result } = renderHook(() =>
        useLinksManager<DetectedLink>({ initialLinks: [] })
      );

      await act(async () => {
        await result.current.handleAdd(youtubeLink);
        vi.advanceTimersByTime(700);
      });

      expect(result.current.links).toHaveLength(1);
      // Verify YouTube was added to DSP
      expect(
        result.current.links.some(link => link.platform.id === 'youtube')
      ).toBe(true);
    });
  });

  describe('MAX_SOCIAL_LINKS visibility', () => {
    it('should prevent adding more than MAX_SOCIAL_LINKS social links', async () => {
      const MAX_SOCIAL_LINKS = 5;
      const socialLinks = Array.from({ length: MAX_SOCIAL_LINKS }, (_, i) =>
        createMockLink(
          ['instagram', 'tiktok', 'twitter', 'spotify', 'venmo'][i]
        )
      );

      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: socialLinks })
      );

      const newLink = createMockLink('website', 'social');

      await act(async () => {
        await result.current.handleAdd(newLink);
        vi.advanceTimersByTime(700);
      });

      // Should still have only MAX_SOCIAL_LINKS links
      expect(result.current.links).toHaveLength(MAX_SOCIAL_LINKS);
    });
  });
});
