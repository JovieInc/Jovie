import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('reports unavailable scope or empty context without navigating', () => {
    const router = { push: vi.fn() };
    expect(openChatWithDraft('  ', router)).toBe(false);
    resetCacheIsolationForTests();
    expect(openChatWithDraft('Context', router)).toBe(false);
    expect(router.push).not.toHaveBeenCalled();
  });
});
