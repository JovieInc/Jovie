import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  buildChatThreadRoute,
  syncChatThreadUrlWithoutNavigation,
} from './sync-chat-thread-url';

describe('syncChatThreadUrlWithoutNavigation', () => {
  const nativeReplaceState = History.prototype.replaceState;

  afterEach(() => {
    History.prototype.replaceState = nativeReplaceState;
    vi.restoreAllMocks();
    nativeReplaceState.call(window.history, {}, '', APP_ROUTES.CHAT);
  });

  it('skips the Next.js-patched history.replaceState when reserving a thread URL', () => {
    window.history.replaceState({}, '', APP_ROUTES.CHAT);

    const nativeReplaceState = History.prototype.replaceState;
    const nativeSpy = vi.fn(function (
      this: History,
      data: unknown,
      unused: string,
      url?: string | URL | null
    ) {
      return nativeReplaceState.call(this, data, unused, url);
    });
    History.prototype.replaceState = nativeSpy;

    const nextPatchedReplaceState = vi.fn();
    window.history.replaceState = nextPatchedReplaceState;

    const nextRoute = syncChatThreadUrlWithoutNavigation('conv-stream-1');

    expect(nextRoute).toBe(`${APP_ROUTES.CHAT}/conv-stream-1`);
    expect(nextPatchedReplaceState).not.toHaveBeenCalled();
    expect(nativeSpy).toHaveBeenCalledTimes(1);
    expect(nativeSpy.mock.calls[0]?.[2]).toBe(nextRoute);
    expect(window.location.pathname).toBe(nextRoute);
  });

  it('does not rewrite a non-chat surface', () => {
    const nativeSpy = vi.spyOn(History.prototype, 'replaceState');

    const nextRoute = syncChatThreadUrlWithoutNavigation(
      'conv-stream-1',
      APP_ROUTES.LIBRARY
    );

    expect(nextRoute).toBe(buildChatThreadRoute('conv-stream-1'));
    expect(nativeSpy).not.toHaveBeenCalled();
  });
});
