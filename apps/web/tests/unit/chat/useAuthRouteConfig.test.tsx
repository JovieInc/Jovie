import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAuthRouteConfig } from '@/hooks/useAuthRouteConfig';

const mockUsePathname = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

describe('useAuthRouteConfig', () => {
  it('hides top profile completion card on dashboard profile routes', () => {
    mockUsePathname.mockReturnValue('/app/dashboard/profile');

    const { result } = renderHook(() => useAuthRouteConfig());

    expect(result.current.showProfileCompletionCard).toBe(false);
  });

  it('keeps top profile completion card on non-profile dashboard routes', () => {
    mockUsePathname.mockReturnValue('/app/chat');

    const { result } = renderHook(() => useAuthRouteConfig());

    expect(result.current.showProfileCompletionCard).toBe(true);
  });
});
