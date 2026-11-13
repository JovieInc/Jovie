import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  applyCacheScope,
  resetCacheIsolationForTests,
} from '@/lib/queries/cache-isolation';
import {
  consumePendingChatDraft,
  consumePendingChatPrompt,
  openChatWithDraft,
  openChatWithPrompt,
  PENDING_CHAT_PROMPT_KEY,
} from './open-chat-with-prompt';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('openChatWithDraft', () => {
  beforeEach(() => {
    consumePendingChatDraft(undefined);
    resetCacheIsolationForTests();
    applyCacheScope({
      userId: 'user-a',
      sessionId: 'session-a',
      profileId: 'profile-a',
      ready: true,
    });
    sessionStorage.clear();
  });

  it('hands off exact editable context once without using auto-send storage', () => {
    const router = { push: vi.fn() };
    const text =
      'Ask about this link.\n{"kind":"link","id":"link-1","profileId":"profile-a","url":"https://example.com"}';
    expect(openChatWithDraft(text, router)).toBe(true);
    expect(router.push).toHaveBeenCalledWith(APP_ROUTES.CHAT);
    expect(consumePendingChatPrompt()).toBeNull();
    expect(consumePendingChatDraft('profile-a')).toBe(text);
    expect(consumePendingChatDraft('profile-a')).toBeNull();
  });

  it('lets a later explicit prompt supersede an unconsumed draft handoff', () => {
    const router = { push: vi.fn() };
    openChatWithDraft('Earlier draft', router);
    openChatWithPrompt('Later explicit request', router);
    expect(consumePendingChatDraft('profile-a')).toBeNull();
    expect(consumePendingChatPrompt()).toBe('Later explicit request');
  });

  it('supersedes a stale auto-send handoff', () => {
    sessionStorage.setItem(PENDING_CHAT_PROMPT_KEY, 'Do not send this');
    openChatWithDraft('Review me first', { push: vi.fn() });
    expect(consumePendingChatPrompt()).toBeNull();
  });

  it.each([
    { userId: 'user-b' },
    { sessionId: 'session-b' },
    { profileId: 'profile-b' },
    { impersonationSubject: 'other' },
    { userId: null, sessionId: null },
  ])('drops private context when the cache scope changes: %j', patch => {
    openChatWithDraft('Private context', { push: vi.fn() });
    applyCacheScope(patch);
    expect(consumePendingChatDraft('profile-a')).toBeNull();
  });

  it('rejects a mismatched rendered creator even if the cache scope is unchanged', () => {
    openChatWithDraft('Private context', { push: vi.fn() });
    expect(consumePendingChatDraft('profile-b')).toBeNull();
    expect(consumePendingChatDraft('profile-a')).toBeNull();
  });

  it('does not revive a request after switching away and back', () => {
    openChatWithDraft('Private context', { push: vi.fn() });
    applyCacheScope({ profileId: 'profile-b' });
    applyCacheScope({ profileId: 'profile-a' });
    expect(consumePendingChatDraft('profile-a')).toBeNull();
  });

  it.each([
    { ready: false },
    { userId: null },
    { sessionId: null },
    { profileId: null },
  ])('rejects an independently unavailable owner field: %j', patch => {
    resetCacheIsolationForTests();
    applyCacheScope({
      userId: 'user-a',
      sessionId: 'session-a',
      profileId: 'profile-a',
      ready: true,
      ...patch,
    });
    sessionStorage.setItem(PENDING_CHAT_PROMPT_KEY, 'Existing explicit prompt');
    const router = { push: vi.fn() };
    expect(openChatWithDraft('Private entity context', router)).toBe(false);
    expect(router.push).not.toHaveBeenCalled();
    expect(consumePendingChatDraft('profile-a')).toBeNull();
    expect(consumePendingChatPrompt()).toBe('Existing explicit prompt');
  });

  it('preserves earlier handoffs when empty entity context is rejected', () => {
    const router = { push: vi.fn() };
    expect(openChatWithDraft('Keep my editable context', router)).toBe(true);
    router.push.mockClear();
    sessionStorage.setItem(PENDING_CHAT_PROMPT_KEY, 'Keep my explicit prompt');
    expect(openChatWithDraft('  \n  ', router)).toBe(false);
    expect(router.push).not.toHaveBeenCalled();
    expect(consumePendingChatDraft('profile-a')).toBe(
      'Keep my editable context'
    );
    expect(consumePendingChatPrompt()).toBe('Keep my explicit prompt');
  });

  it('reports unavailable scope or empty context without navigating', () => {
    const router = { push: vi.fn() };
    expect(openChatWithDraft('  ', router)).toBe(false);
    resetCacheIsolationForTests();
    expect(openChatWithDraft('Context', router)).toBe(false);
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe('pending prompt handoff', () => {
  beforeEach(() => {
    sessionStorage.clear();
    consumePendingChatDraft(undefined);
  });

  it('stores an explicit prompt under the composer key and navigates once', () => {
    const router = { push: vi.fn() };
    openChatWithPrompt('My explicit request', router);
    expect(sessionStorage.getItem('jovie.pendingChatPrompt')).toBe(
      'My explicit request'
    );
    expect(router.push).toHaveBeenCalledExactlyOnceWith(APP_ROUTES.CHAT);
    expect(consumePendingChatPrompt()).toBe('My explicit request');
    expect(sessionStorage.getItem('jovie.pendingChatPrompt')).toBeNull();
    expect(consumePendingChatPrompt()).toBeNull();
  });

  it('still navigates when prompt storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'SecurityError');
    });
    const router = { push: vi.fn() };
    openChatWithPrompt('My explicit request', router);
    expect(router.push).toHaveBeenCalledExactlyOnceWith(APP_ROUTES.CHAT);
  });

  it.each([null, ''])(
    'returns null for an absent or empty prompt: %j',
    value => {
      if (value !== null)
        sessionStorage.setItem(PENDING_CHAT_PROMPT_KEY, value);
      expect(consumePendingChatPrompt()).toBeNull();
    }
  );

  it.each(['getItem', 'removeItem'] as const)(
    'returns null when consuming storage fails at %s',
    operation => {
      sessionStorage.setItem(PENDING_CHAT_PROMPT_KEY, 'Cannot consume safely');
      vi.spyOn(Storage.prototype, operation).mockImplementation(() => {
        throw new DOMException('Storage unavailable', 'SecurityError');
      });
      expect(consumePendingChatPrompt()).toBeNull();
    }
  );

  it('navigates and returns no pending prompt without a browser window', () => {
    const router = { push: vi.fn() };
    vi.stubGlobal('window', undefined);
    try {
      openChatWithPrompt('Server-side request', router);
      expect(router.push).toHaveBeenCalledExactlyOnceWith(APP_ROUTES.CHAT);
      expect(consumePendingChatPrompt()).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
