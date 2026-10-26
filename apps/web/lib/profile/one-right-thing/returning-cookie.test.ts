import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setConsentState } from '@/lib/tracking/consent';
import { RETURNING_COOKIE } from './returning-cookie';
import { useReturningMarker } from './use-returning-marker';

function cookieNames(): string[] {
  return document.cookie
    .split(';')
    .map(part => part.trim().split('=')[0] ?? '')
    .filter(Boolean);
}

function resetCookies() {
  for (const name of cookieNames()) {
    document.cookie = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    document.cookie = `${name}=; Path=/tim; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
}

describe('jv_returning marker consent handling', () => {
  beforeEach(() => {
    resetCookies();
    localStorage.clear();
    window.history.pushState({}, '', '/tim');
  });
  afterEach(resetCookies);

  it('writes nothing without accepted consent', () => {
    renderHook(() => useReturningMarker(true, 'tim'));
    expect(cookieNames()).not.toContain(RETURNING_COOKIE);
    setConsentState('rejected');
    renderHook(() => useReturningMarker(true, 'tim'));
    expect(cookieNames()).not.toContain(RETURNING_COOKIE);
  });

  it('is scoped to the profile path and set only after consent', () => {
    setConsentState('accepted');
    renderHook(() => useReturningMarker(true, 'Tim'));
    // jsdom serves /tim, so a /tim-scoped cookie is visible there.
    expect(cookieNames()).toContain(RETURNING_COOKIE);
    window.history.pushState({}, '', '/someone-else');
    expect(cookieNames()).not.toContain(RETURNING_COOKIE);
  });

  it('is removed when consent is withdrawn', () => {
    setConsentState('accepted');
    renderHook(() => useReturningMarker(true, 'tim'));
    expect(cookieNames()).toContain(RETURNING_COOKIE);
    setConsentState('rejected');
    expect(cookieNames()).not.toContain(RETURNING_COOKIE);
  });

  it('does nothing when disabled (previews, fixtures)', () => {
    setConsentState('accepted');
    renderHook(() => useReturningMarker(false, 'tim'));
    expect(cookieNames()).not.toContain(RETURNING_COOKIE);
  });
});
