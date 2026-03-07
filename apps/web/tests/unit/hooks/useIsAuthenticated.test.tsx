import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useIsAuthenticated } from '@/hooks/useIsAuthenticated';

function setCookieString(value: string) {
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    writable: true,
    value,
  });
}

describe('useIsAuthenticated', () => {
  afterEach(() => {
    setCookieString('');
  });

  it('returns true when Clerk session cookie is present', () => {
    setCookieString('__client_uat=1712345678');

    const { result } = renderHook(() => useIsAuthenticated());

    expect(result.current).toBe(true);
  });

  it('re-syncs auth state on focus when session cookie changes', () => {
    setCookieString('__client_uat=1712345678');
    const { result } = renderHook(() => useIsAuthenticated());
    expect(result.current).toBe(true);

    setCookieString('__client_uat=0');
    act(() => {
      globalThis.dispatchEvent(new Event('focus'));
    });
    expect(result.current).toBe(false);

    setCookieString('__client_uat=1712349999');
    act(() => {
      globalThis.dispatchEvent(new Event('focus'));
    });
    expect(result.current).toBe(true);
  });
});
