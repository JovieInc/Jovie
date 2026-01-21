/**
 * Unit tests for useLinksManager hook - initialization and helpers
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
import { createMockLink } from './useLinksManager.test-utils';

describe('useLinksManager - init + helpers', () => {
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
});
