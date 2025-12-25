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

async function addLinkAndFlushTimers(
  result: { current: { handleAdd: (link: DetectedLink) => Promise<void> } },
  link: DetectedLink
): Promise<void> {
  const addPromise = result.current.handleAdd(link);
  vi.advanceTimersByTime(700);
  await addPromise;
}
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
    vi.useFakeTimers();
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
        useLinksManager<DetectedLink>({ initialLinks: [] })
      );

      expect(result.current.links).toHaveLength(0);
    });

    it('should have null lastAddedId on init', () => {
      const { result } = renderHook(() =>
        useLinksManager<DetectedLink>({ initialLinks: [] })
      );

      expect(result.current.lastAddedId).toBeNull();
    });

    it('should have null addingLink on init', () => {
      const { result } = renderHook(() =>
        useLinksManager<DetectedLink>({ initialLinks: [] })
      );

      expect(result.current.addingLink).toBeNull();
    });

    it('should have undefined prefillUrl on init', () => {
      const { result } = renderHook(() =>
        useLinksManager<DetectedLink>({ initialLinks: [] })
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
        await addLinkAndFlushTimers(result, newLink);
      });

      expect(result.current.links).toHaveLength(1);
      expect(result.current.links[0].platform.id).toBe('instagram');
    });

    it('should add isVisible:true to the link', async () => {
      const { result } = renderHook(() =>
        useLinksManager<DetectedLink>({ initialLinks: [] })
      );

      const newLink = createMockLink('instagram');

      await act(async () => {
        await addLinkAndFlushTimers(result, newLink);
      });

      const added = result.current.links[0] as DetectedLink & {
        isVisible?: boolean;
      };
      expect(added.isVisible).toBe(true);
    });

    it('should call onLinkAdded callback', async () => {
      const onLinkAdded = vi.fn();
      const { result } = renderHook(() =>
        useLinksManager<DetectedLink>({ initialLinks: [], onLinkAdded })
      );

      const newLink = createMockLink('instagram');

      await act(async () => {
        await addLinkAndFlushTimers(result, newLink);
      });

      expect(onLinkAdded).toHaveBeenCalled();
    });

    it('should call onLinksChange callback', async () => {
      const onLinksChange = vi.fn();
      const { result } = renderHook(() =>
        useLinksManager<DetectedLink>({ initialLinks: [], onLinksChange })
      );

      const newLink = createMockLink('instagram');

      await act(async () => {
        await addLinkAndFlushTimers(result, newLink);
      });

      expect(onLinksChange).toHaveBeenCalled();
    });

    it('should set and clear addingLink during add', async () => {
      const { result } = renderHook(() =>
        useLinksManager<DetectedLink>({ initialLinks: [] })
      );

      const newLink = createMockLink('instagram');
      let addPromise: Promise<void> | null = null;
      act(() => {
        addPromise = result.current.handleAdd(newLink);
      });

      // addingLink should be set during add
      expect(result.current.addingLink).not.toBeNull();

      await act(async () => {
        vi.advanceTimersByTime(700);
        await addPromise;
      });
      // addingLink should be null after add completes
      expect(result.current.addingLink).toBeNull();
    });

    it('should set lastAddedId after adding', async () => {
      const { result } = renderHook(() =>
        useLinksManager<DetectedLink>({ initialLinks: [] })
      );

      const newLink = createMockLink('instagram');

      await act(async () => {
        await addLinkAndFlushTimers(result, newLink);
      });

      expect(result.current.lastAddedId).not.toBeNull();
    });

    it('should clear lastAddedId after timeout', async () => {
      const { result } = renderHook(() =>
        useLinksManager<DetectedLink>({ initialLinks: [] })
      );

      const newLink = createMockLink('instagram');

      await act(async () => {
        await addLinkAndFlushTimers(result, newLink);
      });

      expect(result.current.lastAddedId).not.toBeNull();

      act(() => {
        vi.advanceTimersByTime(1500);
      });

      expect(result.current.lastAddedId).toBeNull();
    });
  });

  describe('handleAdd - Venmo special case', () => {
    it('should force earnings category for Venmo', async () => {
      const { result } = renderHook(() =>
        useLinksManager<DetectedLink>({ initialLinks: [] })
      );

      const venmoLink = createMockLink('venmo', 'social'); // Intentionally wrong category

      await act(async () => {
        await addLinkAndFlushTimers(result, venmoLink);
      });

      expect(result.current.links[0].platform.category).toBe('earnings');
    });

    it('should call tipping API for Venmo', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const { result } = renderHook(() =>
        useLinksManager<DetectedLink>({ initialLinks: [] })
      );

      const venmoLink = createMockLink('venmo', 'earnings');

      await act(async () => {
        await addLinkAndFlushTimers(result, venmoLink);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/dashboard/tipping/enable', {
        method: 'POST',
      });
    });
  });

  describe('handleAdd - duplicate detection', () => {
    it('should not add exact duplicate link', async () => {
      const existingLink = createMockLink(
        'instagram',
        'social',
        'https://instagram.com/testuser'
      );
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [existingLink] })
      );

      const duplicateLink = createMockLink(
        'instagram',
        'social',
        'https://instagram.com/testuser'
      );

      await act(async () => {
        await addLinkAndFlushTimers(result, duplicateLink);
      });

      // Should not add duplicate
      expect(result.current.links).toHaveLength(1);
    });

    it('should merge URL and title for duplicate link', async () => {
      const existingLink = createMockLink(
        'instagram',
        'social',
        'https://instagram.com/olduser'
      );
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [existingLink] })
      );

      // Same canonical identity (depends on canonicalIdentity implementation)
      const duplicateLink = {
        ...createMockLink(
          'instagram',
          'social',
          'https://instagram.com/olduser'
        ),
        normalizedUrl: 'https://instagram.com/olduser',
        suggestedTitle: 'New Title',
      };

      await act(async () => {
        await addLinkAndFlushTimers(result, duplicateLink);
      });

      // Should remain 1 link (merged)
      expect(result.current.links).toHaveLength(1);
    });
  });

  describe('handleAdd - YouTube cross-category', () => {
    it('should trigger ytPrompt when YouTube already exists in social section', async () => {
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

      // Should trigger prompt instead of adding
      expect(result.current.ytPrompt).not.toBeNull();
      expect(result.current.ytPrompt?.target).toBe('dsp');
    });

    it('should trigger ytPrompt when YouTube already exists in dsp section', async () => {
      const existingYouTube = createMockLink(
        'youtube',
        'dsp',
        'https://youtube.com/@existing'
      );
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [existingYouTube] })
      );

      const newYouTube = createMockLink(
        'youtube',
        'dsp',
        'https://youtube.com/@new'
      );

      await act(async () => {
        await addLinkAndFlushTimers(result, newYouTube);
      });

      // Should trigger prompt for other section
      expect(result.current.ytPrompt).not.toBeNull();
      expect(result.current.ytPrompt?.target).toBe('social');
    });
  });

  describe('YouTube prompt flow', () => {
    it('should cancel ytPrompt', async () => {
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

      expect(result.current.ytPrompt).not.toBeNull();

      act(() => {
        result.current.cancelYtPrompt();
      });

      expect(result.current.ytPrompt).toBeNull();
    });

    it('should confirm ytPrompt and add link with target category', async () => {
      const existingYouTube = createMockLink(
        'youtube',
        'social',
        'https://youtube.com/@existing'
      );
      const onLinkAdded = vi.fn();
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [existingYouTube], onLinkAdded })
      );

      const newYouTube = createMockLink(
        'youtube',
        'social',
        'https://youtube.com/@new'
      );

      await act(async () => {
        await addLinkAndFlushTimers(result, newYouTube);
      });

      expect(result.current.ytPrompt).not.toBeNull();
      expect(result.current.links).toHaveLength(1);

      act(() => {
        result.current.confirmYtPrompt();
      });

      expect(result.current.ytPrompt).toBeNull();
      expect(result.current.links).toHaveLength(2);
      // The new link should have the target category (dsp)
      expect(result.current.links[1].platform.category).toBe('dsp');
      expect(onLinkAdded).toHaveBeenCalled();
    });

    it('should not add when YouTube exists in both sections', async () => {
      const youTubeSocial = createMockLink(
        'youtube',
        'social',
        'https://youtube.com/@social'
      );
      const youTubeDsp = createMockLink(
        'youtube',
        'dsp',
        'https://youtube.com/@dsp'
      );
      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: [youTubeSocial, youTubeDsp] })
      );

      const newYouTube = createMockLink(
        'youtube',
        'social',
        'https://youtube.com/@new'
      );

      await act(async () => {
        await addLinkAndFlushTimers(result, newYouTube);
      });

      // Should not add or prompt - YouTube already in both sections
      expect(result.current.links).toHaveLength(2);
      expect(result.current.ytPrompt).toBeNull();
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

      // Instagram is typically more popular than Twitter in GLOBAL_PLATFORM_POPULARITY
      const existingLinks: DetectedLink[] = [
        createMockLink('twitter', 'social'),
      ];
      const newLink = createMockLink('instagram', 'social');
      const newLinks = result.current.insertLinkWithSectionOrdering(
        existingLinks,
        newLink
      );

      expect(newLinks).toHaveLength(2);
      // Instagram should be inserted before Twitter if more popular
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

  describe('MAX_SOCIAL_LINKS visibility enforcement', () => {
    it('should hide social links beyond MAX_SOCIAL_LINKS limit', async () => {
      // Create 6 visible social links (the MAX)
      const existingLinks = Array.from(
        { length: 6 },
        (_, i) =>
          ({
            ...createMockLink(
              `platform${i}`,
              'social',
              `https://social${i}.com/user`
            ),
            isVisible: true,
          }) as DetectedLink & { isVisible: boolean }
      );

      const { result } = renderHook(() =>
        useLinksManager({ initialLinks: existingLinks as DetectedLink[] })
      );

      // Add a 7th social link
      const newLink = createMockLink(
        'instagram',
        'social',
        'https://instagram.com/newuser'
      );

      await act(async () => {
        await addLinkAndFlushTimers(result, newLink);
      });

      // The new link should be added but marked as hidden
      expect(result.current.links).toHaveLength(7);
      const addedLink = result.current.links[6] as DetectedLink & {
        isVisible?: boolean;
      };
      expect(addedLink.isVisible).toBe(false);
    });
  });
});
