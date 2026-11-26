import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canonicalizeUnofferedPublicProfileMode,
  useCanonicalProfileMode,
} from './useCanonicalProfileMode';

describe('canonicalizeUnofferedPublicProfileMode (JOV-14241)', () => {
  it('sends tour to profile without upcoming events', () => {
    expect(
      canonicalizeUnofferedPublicProfileMode({
        mode: 'tour',
        upcomingTourDateCount: 0,
      })
    ).toBe('profile');
  });

  it('keeps tour with events and leaves other modes alone', () => {
    expect(
      canonicalizeUnofferedPublicProfileMode({
        mode: 'tour',
        upcomingTourDateCount: 1,
      })
    ).toBe('tour');
    expect(
      canonicalizeUnofferedPublicProfileMode({
        mode: 'listen',
        upcomingTourDateCount: 0,
      })
    ).toBe('listen');
  });
});

describe('useCanonicalProfileMode (JOV-14241)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it('replaces the mode param, keeps source, and never pushes', () => {
    window.history.replaceState(null, '', '/tim?mode=tour&source=qr');
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const setMode = vi.fn();
    renderHook(() => useCanonicalProfileMode('tour', setMode, 0));
    expect(window.location.pathname + window.location.search).toBe(
      '/tim?source=qr'
    );
    expect(setMode).toHaveBeenCalledWith('profile');
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('does nothing when Events is offered or mode is not tour', () => {
    window.history.replaceState(null, '', '/tim?mode=tour');
    const setMode = vi.fn();
    renderHook(() => useCanonicalProfileMode('tour', setMode, 2));
    renderHook(() => useCanonicalProfileMode('listen', setMode, 0));
    expect(window.location.search).toBe('?mode=tour');
    expect(setMode).not.toHaveBeenCalled();
  });
});
