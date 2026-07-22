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

  it('keeps chat detail breadcrumbs pinned to the shared chat label', () => {
    mockUsePathname.mockReturnValue('/app/chat/conv-123');

    const { result } = renderHook(() => useAuthRouteConfig());

    expect(result.current.breadcrumbs).toEqual([
      {
        label: 'New Chat',
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

  it('labels the releases library view as Releases', () => {
    mockUsePathname.mockReturnValue('/app/library');
    mockUseSearchParams.mockReturnValue(new URLSearchParams('view=releases'));

    const { result } = renderHook(() => useAuthRouteConfig());

    expect(result.current.breadcrumbs).toEqual([
      { label: 'Releases', href: '/app/library' },
    ]);
  });

  it('keeps the default library view labeled Library', () => {
    mockUsePathname.mockReturnValue('/app/library');

    const { result } = renderHook(() => useAuthRouteConfig());

    expect(result.current.breadcrumbs).toEqual([
      { label: 'Library', href: '/app/library' },
    ]);
  });

  it('keeps other library views labeled Library', () => {
    mockUsePathname.mockReturnValue('/app/library');
    mockUseSearchParams.mockReturnValue(new URLSearchParams('view=audio'));

    const { result } = renderHook(() => useAuthRouteConfig());

    expect(result.current.breadcrumbs).toEqual([
      { label: 'Library', href: '/app/library' },
    ]);
  });

  it('treats the canonical tour dates route as a dashboard table surface', () => {
    mockUsePathname.mockReturnValue('/app/tour-dates');

    const { result } = renderHook(() => useAuthRouteConfig());

    expect(result.current.section).toBe('dashboard');
    expect(result.current.isTableRoute).toBe(true);
    expect(result.current.breadcrumbs).toEqual([
      { label: 'Tour dates', href: '/app/tour-dates' },
    ]);
  });
});
