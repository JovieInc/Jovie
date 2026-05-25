import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthRouteConfig } from '@/hooks/useAuthRouteConfig';

const { mockUsePathname, mockUseSearchParams } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(),
  mockUseSearchParams: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useSearchParams: () => mockUseSearchParams(),
}));

describe('useAuthRouteConfig', () => {
  beforeEach(() => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
  });

  it('keeps chat thread detail breadcrumbs pinned to the shared thread label', () => {
    mockUsePathname.mockReturnValue('/app/chat/conv-123');

    const { result } = renderHook(() => useAuthRouteConfig());

    expect(result.current.breadcrumbs).toEqual([
      {
        label: 'New thread',
        href: '/app/chat/conv-123',
      },
    ]);
    expect(result.current.isChatRoute).toBe(true);
  });

  it('preserves non-chat dynamic-style segments as their own label', () => {
    mockUsePathname.mockReturnValue('/app/library/thread-123');

    const { result } = renderHook(() => useAuthRouteConfig());

    expect(result.current.breadcrumbs).toEqual([
      {
        label: 'Thread 123',
        href: '/app/library/thread-123',
      },
    ]);
    expect(result.current.section).toBe('library');
  });
});
