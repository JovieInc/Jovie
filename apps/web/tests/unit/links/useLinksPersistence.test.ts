/**
 * Unit tests for useLinksPersistence hook
 *
 * Tests cover: persistence, debouncing, conflict resolution,
 * version tracking, cache behavior, and error handling.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock('@/lib/utils', () => ({
  cn: (...inputs: Array<string | undefined | null | false>) =>
    inputs.filter(Boolean).join(' '),
  debounce: <T extends (...args: unknown[]) => unknown>(
    func: T,
    _wait: number
  ): ((...args: Parameters<T>) => void) & {
    cancel: () => void;
    flush: () => void;
  } => {
    let pending: Parameters<T> | null = null;
    const debounced = (...args: Parameters<T>): void => {
      pending = args;
    };
    debounced.cancel = () => {
      pending = null;
    };
    debounced.flush = () => {
      if (pending) {
        try {
          const result = func(...pending);
          if (result instanceof Promise) {
            void result.catch(() => undefined);
          }
        } catch {
          // ignore
        }
        pending = null;
      }
    };
    return debounced;
  },
}));

import { toast } from 'sonner';
import type { ProfileSocialLink } from '@/app/app/dashboard/actions/social-links';
import { useLinksPersistence } from '@/components/dashboard/organisms/links/hooks/useLinksPersistence';
import type { LinkItem } from '@/components/dashboard/organisms/links/types';

const EMPTY_INITIAL_LINKS: ProfileSocialLink[] = [];

const mockFetch = vi.fn();
global.fetch = mockFetch;

async function flushMicrotasks(iterations = 10) {
  for (let i = 0; i < iterations; i++) {
    await Promise.resolve();
  }
}

async function waitForExpectation(
  expectation: () => void,
  maxTries = 50
): Promise<void> {
  let lastError: unknown;
  for (let i = 0; i < maxTries; i++) {
    try {
      expectation();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await flushMicrotasks(5);
      });
    }
  }
  throw lastError;
}

function createMockProfileLink(
  overrides: Partial<ProfileSocialLink> = {}
): ProfileSocialLink {
  return {
    id: `link-${Math.random().toString(36).slice(2)}`,
    platform: 'instagram',
    platformType: 'social',
    url: 'https://instagram.com/testuser',
    sortOrder: 0,
    isActive: true,
    displayText: null,
    state: 'active',
    confidence: 0.9,
    sourcePlatform: null,
    sourceType: 'manual',
    evidence: null,
    version: 1,
    ...overrides,
  };
}

function createMockLinkItem(overrides: Partial<LinkItem> = {}): LinkItem {
  const id = `link-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    title: 'Instagram',
    url: 'https://instagram.com/testuser',
    platform: {
      id: 'instagram',
      name: 'Instagram',
      category: 'social',
      icon: 'instagram',
      color: '#E1306C',
      placeholder: '',
    },
    isVisible: true,
    order: 0,
    category: 'social',
    normalizedUrl: 'https://instagram.com/testuser',
    originalUrl: 'https://instagram.com/testuser',
    suggestedTitle: 'Instagram',
    isValid: true,
    ...overrides,
  };
}

describe('useLinksPersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, version: 2 }),
    });
  });

  afterEach(() => {
    // Avoid restoreAllMocks here: this file relies on module-level vi.mock()
    // overrides (debounce, toast). Restoring mocks can revert those mid-suite
    // and lead to real timers/handles leaking across tests.
  });

  describe('initialization', () => {
    it('should initialize with active links from initialLinks', () => {
      const initialLinks: ProfileSocialLink[] = [
        createMockProfileLink({ state: 'active' }),
        createMockProfileLink({ state: 'suggested' }),
      ];

      const { result } = renderHook(() =>
        useLinksPersistence({
          profileId: 'profile-123',
          initialLinks,
          suggestionsEnabled: false,
        })
      );

      // Active links should be in links array
      expect(result.current.links).toHaveLength(1);
      // Suggested links should be in suggestedLinks array
      expect(result.current.suggestedLinks).toHaveLength(1);
    });

    it('should initialize version from max version in initialLinks', () => {
      const initialLinks: ProfileSocialLink[] = [
        createMockProfileLink({ version: 3 }),
        createMockProfileLink({ version: 5 }),
        createMockProfileLink({ version: 2 }),
      ];

      const { result } = renderHook(() =>
        useLinksPersistence({
          profileId: 'profile-123',
          initialLinks,
          suggestionsEnabled: false,
        })
      );

      expect(result.current.linksVersion).toBe(5);
    });

    it('should initialize version to 0 when no links', () => {
      const { result } = renderHook(() =>
        useLinksPersistence({
          profileId: 'profile-123',
          initialLinks: EMPTY_INITIAL_LINKS,
          suggestionsEnabled: false,
        })
      );

      expect(result.current.linksVersion).toBe(0);
    });
  });

  describe('enqueueSave', () => {
    it('should persist links to API with correct payload', async () => {
      const { result } = renderHook(() =>
        useLinksPersistence({
          profileId: 'profile-123',
          initialLinks: EMPTY_INITIAL_LINKS,
          suggestionsEnabled: false,
        })
      );

      const linksToSave = [
        createMockLinkItem({
          normalizedUrl: 'https://instagram.com/newuser',
          originalUrl: 'https://instagram.com/newuser',
          url: 'https://instagram.com/newuser',
        }),
      ];

      act(() => {
        result.current.enqueueSave(linksToSave);
      });

      await waitForExpectation(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/dashboard/social-links',
          expect.objectContaining({
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
          })
        );
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.profileId).toBe('profile-123');
      expect(callBody.links).toHaveLength(1);
      expect(callBody.links[0].platform).toBe('instagram');
      expect(callBody.links[0].url).toBe('https://instagram.com/newuser');
    });

    it('should include expectedVersion for optimistic locking', async () => {
      const initialLinks: ProfileSocialLink[] = [
        createMockProfileLink({ version: 3 }),
      ];

      const { result } = renderHook(() =>
        useLinksPersistence({
          profileId: 'profile-123',
          initialLinks,
          suggestionsEnabled: false,
        })
      );

      act(() => {
        result.current.enqueueSave(result.current.links);
      });

      await waitForExpectation(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.expectedVersion).toBe(3);
    });

    it('should show success toast on successful save', async () => {
      const { result } = renderHook(() =>
        useLinksPersistence({
          profileId: 'profile-123',
          initialLinks: EMPTY_INITIAL_LINKS,
          suggestionsEnabled: false,
        })
      );

      act(() => {
        result.current.enqueueSave([]);
      });

      await waitForExpectation(() => {
        expect(toast.success).toHaveBeenCalledWith(
          expect.stringContaining('Links saved successfully')
        );
      });
    });

    it('should update version after successful save', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, version: 10 }),
      });

      const { result } = renderHook(() =>
        useLinksPersistence({
          profileId: 'profile-123',
          initialLinks: EMPTY_INITIAL_LINKS,
          suggestionsEnabled: false,
        })
      );

      act(() => {
        result.current.enqueueSave([]);
      });

      await waitForExpectation(() => {
        expect(result.current.linksVersion).toBe(10);
      });
    });
  });

  describe('conflict resolution', () => {
    it('should handle 409 conflict by updating version and showing toast', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: 'Conflict',
          code: 'VERSION_CONFLICT',
          currentVersion: 15,
          expectedVersion: 3,
        }),
      });

      const onSyncSuggestions = vi.fn().mockResolvedValue(undefined);
      const initialLinks: ProfileSocialLink[] = [
        createMockProfileLink({ version: 3 }),
      ];

      const { result } = renderHook(() =>
        useLinksPersistence({
          profileId: 'profile-123',
          initialLinks,
          suggestionsEnabled: false,
          onSyncSuggestions,
        })
      );

      act(() => {
        result.current.enqueueSave(result.current.links);
      });

      await waitForExpectation(() => {
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining('updated in another tab'),
          expect.any(Object)
        );
      });

      expect(result.current.linksVersion).toBe(15);
      expect(onSyncSuggestions).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should show error toast on API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Invalid platform' }),
      });

      const { result } = renderHook(() =>
        useLinksPersistence({
          profileId: 'profile-123',
          initialLinks: EMPTY_INITIAL_LINKS,
          suggestionsEnabled: false,
        })
      );

      act(() => {
        result.current.enqueueSave([]);
      });

      await waitForExpectation(() => {
        expect(toast.error).toHaveBeenCalledWith('Invalid platform');
      });
    });

    it('should show generic error toast on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() =>
        useLinksPersistence({
          profileId: 'profile-123',
          initialLinks: EMPTY_INITIAL_LINKS,
          suggestionsEnabled: false,
        })
      );

      act(() => {
        result.current.enqueueSave([]);
      });

      await waitForExpectation(() => {
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining('Network error')
        );
      });
    });

    it('should show error when profileId is missing', async () => {
      const { result } = renderHook(() =>
        useLinksPersistence({
          profileId: undefined,
          initialLinks: EMPTY_INITIAL_LINKS,
          suggestionsEnabled: false,
        })
      );

      act(() => {
        result.current.enqueueSave([]);
      });

      await waitForExpectation(() => {
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining('Unable to save')
        );
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('debounced save', () => {
    it('should provide debounced save function', () => {
      const { result } = renderHook(() =>
        useLinksPersistence({
          profileId: 'profile-123',
          initialLinks: EMPTY_INITIAL_LINKS,
          suggestionsEnabled: false,
        })
      );

      expect(result.current.debouncedSave).toBeDefined();
      expect(typeof result.current.debouncedSave).toBe('function');
      expect(typeof result.current.debouncedSave.flush).toBe('function');
      expect(typeof result.current.debouncedSave.cancel).toBe('function');
    });

    it('should flush debounced save on flush call', async () => {
      const { result } = renderHook(() =>
        useLinksPersistence({
          profileId: 'profile-123',
          initialLinks: EMPTY_INITIAL_LINKS,
          suggestionsEnabled: false,
        })
      );

      act(() => {
        result.current.debouncedSave([]);
      });

      // Fetch not called yet (debounced)
      expect(mockFetch).not.toHaveBeenCalled();

      act(() => {
        result.current.debouncedSave.flush();
      });

      await waitForExpectation(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
    });
  });

  describe('linksRef', () => {
    it('should provide ref to current links for async access', () => {
      const initialLinks: ProfileSocialLink[] = [createMockProfileLink()];

      const { result } = renderHook(() =>
        useLinksPersistence({
          profileId: 'profile-123',
          initialLinks,
          suggestionsEnabled: false,
        })
      );

      expect(result.current.linksRef.current).toHaveLength(1);
    });

    it('should update ref when links change', () => {
      const { result } = renderHook(() =>
        useLinksPersistence({
          profileId: 'profile-123',
          initialLinks: EMPTY_INITIAL_LINKS,
          suggestionsEnabled: false,
        })
      );

      expect(result.current.linksRef.current).toHaveLength(0);

      act(() => {
        result.current.setLinks([
          createMockLinkItem({
            normalizedUrl: 'https://instagram.com/test',
            originalUrl: 'https://instagram.com/test',
            url: 'https://instagram.com/test',
          }),
        ]);
      });

      expect(result.current.linksRef.current).toHaveLength(1);
    });
  });

  describe('suggestions', () => {
    it('should separate suggested links from active links', () => {
      const initialLinks: ProfileSocialLink[] = [
        createMockProfileLink({ state: 'active' }),
        createMockProfileLink({ state: 'suggested', platform: 'twitter' }),
        createMockProfileLink({ state: 'active', platform: 'tiktok' }),
      ];

      const { result } = renderHook(() =>
        useLinksPersistence({
          profileId: 'profile-123',
          initialLinks,
          suggestionsEnabled: true,
        })
      );

      expect(result.current.links).toHaveLength(2);
      expect(result.current.suggestedLinks).toHaveLength(1);
      expect(result.current.suggestedLinks[0].platform.id).toBe('twitter');
    });
  });
});
