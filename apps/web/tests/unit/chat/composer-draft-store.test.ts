import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearComposerDraft,
  clearSummerTurnRecovery,
  readComposerDraft,
  readSummerTurnRecovery,
  resetComposerDraftStoreForTests,
  saveComposerDraft,
  saveSummerTurnRecovery,
} from '@/lib/chat/composer-draft-store';
import {
  advanceCacheGeneration,
  applyCacheScope,
  resetCacheIsolationForTests,
} from '@/lib/queries/cache-isolation';

describe('composer-draft-store', () => {
  it('stores and restores drafts per conversation thread', () => {
    resetComposerDraftStoreForTests();

    saveComposerDraft('thread-a', 'Draft for thread A');
    saveComposerDraft('thread-b', 'Draft for thread B');

    expect(readComposerDraft('thread-a')).toBe('Draft for thread A');
    expect(readComposerDraft('thread-b')).toBe('Draft for thread B');
  });

  it('uses a shared draft bucket for new chats without a conversation id', () => {
    resetComposerDraftStoreForTests();

    saveComposerDraft(null, 'Brand new chat draft');
    expect(readComposerDraft(null)).toBe('Brand new chat draft');
    expect(readComposerDraft(undefined)).toBe('Brand new chat draft');
  });

  it('clears drafts after send and removes empty drafts on save', () => {
    resetComposerDraftStoreForTests();

    saveComposerDraft('thread-a', 'temporary draft');
    clearComposerDraft('thread-a');
    expect(readComposerDraft('thread-a')).toBe('');

    saveComposerDraft('thread-b', '   ');
    expect(readComposerDraft('thread-b')).toBe('   ');
    saveComposerDraft('thread-b', '');
    expect(readComposerDraft('thread-b')).toBe('');
  });
});

describe('Summer recovery context', () => {
  const context = {
    chatMode: 'ov' as const,
    conversationId: null,
    profileId: 'profile-a',
  };
  const recovery = {
    clientTurnId: 'original-turn',
    message: 'Check triage',
    retry: 'same-turn' as const,
  };

  beforeEach(() => {
    resetComposerDraftStoreForTests();
    resetCacheIsolationForTests();
    applyCacheScope({ userId: 'founder', sessionId: 'session-a', ready: true });
  });

  it('isolates recovery from creator, profile and conversation draft contexts', () => {
    saveSummerTurnRecovery(context, recovery);
    saveComposerDraft(null, 'New draft');
    expect(readSummerTurnRecovery(context)).toEqual(recovery);
    expect(
      readSummerTurnRecovery({ ...context, chatMode: undefined })
    ).toBeNull();
    expect(
      readSummerTurnRecovery({ ...context, profileId: 'profile-b' })
    ).toBeNull();
    expect(
      readSummerTurnRecovery({ ...context, conversationId: 'another-thread' })
    ).toBeNull();
    expect(readComposerDraft(null)).toBe('New draft');
    clearComposerDraft(null);
    expect(readSummerTurnRecovery(context)).toEqual(recovery);
  });

  it.each([
    { userId: 'another-user' },
    { sessionId: 'another-session' },
    { profileId: 'another-profile' },
    { impersonationSubject: 'another-subject' },
    { userId: null, sessionId: null },
  ])('does not expose a recovery entry after a scope fence: %j', patch => {
    saveSummerTurnRecovery(context, recovery);
    applyCacheScope(patch);
    expect(readSummerTurnRecovery(context)).toBeNull();
  });

  it('does not revive an earlier identity after returning to the same account', () => {
    saveSummerTurnRecovery(context, recovery);
    applyCacheScope({ userId: 'another-user' });
    applyCacheScope({ userId: 'founder' });
    expect(readSummerTurnRecovery(context)).toBeNull();
    saveSummerTurnRecovery(context, recovery);
    advanceCacheGeneration();
    expect(readSummerTurnRecovery(context)).toBeNull();
  });

  it('retains at most fifty contexts and never lets an old turn clear a newer recovery', () => {
    for (let index = 0; index <= 50; index += 1) {
      saveSummerTurnRecovery(
        { ...context, profileId: `profile-${index}` },
        recovery
      );
    }
    expect(
      readSummerTurnRecovery({ ...context, profileId: 'profile-0' })
    ).toBeNull();
    expect(
      readSummerTurnRecovery({ ...context, profileId: 'profile-50' })
    ).toEqual(recovery);
    saveSummerTurnRecovery(context, recovery);
    clearSummerTurnRecovery(context, 'old-turn');
    expect(readSummerTurnRecovery(context)).toEqual(recovery);
    clearSummerTurnRecovery(context, recovery.clientTurnId);
    expect(readSummerTurnRecovery(context)).toBeNull();
  });

  it('does not retain recovery without an authenticated cache scope', () => {
    resetCacheIsolationForTests();
    saveSummerTurnRecovery(context, recovery);
    expect(readSummerTurnRecovery(context)).toBeNull();
  });
});
