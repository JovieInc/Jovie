import { describe, expect, it } from 'vitest';
import {
  clearComposerDraft,
  readComposerDraft,
  resetComposerDraftStoreForTests,
  saveComposerDraft,
} from '@/lib/chat/composer-draft-store';

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
