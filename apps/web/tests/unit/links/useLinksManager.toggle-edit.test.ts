/**
 * Unit tests for useLinksManager hook - toggle/remove/edit
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

describe('useLinksManager - toggle/remove/edit', () => {
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
});
