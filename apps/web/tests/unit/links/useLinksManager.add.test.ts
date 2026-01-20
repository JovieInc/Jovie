/**
 * Unit tests for useLinksManager hook - adding links
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

describe('useLinksManager - add', () => {
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

      expect(result.current.addingLink).not.toBeNull();

      await act(async () => {
        vi.advanceTimersByTime(700);
        await addPromise;
      });
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

      const venmoLink = createMockLink('venmo', 'social');

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

      expect(result.current.links).toHaveLength(1);
    });
  });

  describe('MAX_SOCIAL_LINKS visibility enforcement', () => {
    it('should hide social links beyond MAX_SOCIAL_LINKS limit', async () => {
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

      const newLink = createMockLink(
        'instagram',
        'social',
        'https://instagram.com/newuser'
      );

      await act(async () => {
        await addLinkAndFlushTimers(result, newLink);
      });

      expect(result.current.links).toHaveLength(7);
      const addedLink = result.current.links[6] as DetectedLink & {
        isVisible?: boolean;
      };
      expect(addedLink.isVisible).toBe(false);
    });
  });
});
