import { beforeEach, describe, expect, it } from 'vitest';
import {
  CHAT_HOME_HEADING,
  CHAT_STARTER_CONVERSATION_STORAGE_KEY,
  CHAT_STARTER_CONVERSATIONS,
  starterConversationAtIndex,
  takeNextStarterConversationIndex,
  validateChatStarterConversation,
} from './new-chat-entry-contract';

describe('new chat entry contract', () => {
  beforeEach(() => {
    sessionStorage.removeItem(CHAT_STARTER_CONVERSATION_STORAGE_KEY);
  });

  it('keeps the shared heading and every starter role-neutral and executable', () => {
    expect(CHAT_HOME_HEADING).toBe('Just ask');
    expect(CHAT_STARTER_CONVERSATIONS).toHaveLength(3);

    for (const sample of CHAT_STARTER_CONVERSATIONS) {
      expect(validateChatStarterConversation({ sample })).toEqual([]);
    }
  });

  it('rejects persona-specific copy in the shared primitive', () => {
    expect(
      validateChatStarterConversation({
        sample: {
          ...CHAT_STARTER_CONVERSATIONS[0],
          userPrompt: 'Help me build my artist profile.',
        },
      })
    ).toContain('persona-specific-copy');
  });

  it('rejects a static non-executable marketing starter', () => {
    expect(
      validateChatStarterConversation({
        sample: {
          ...CHAT_STARTER_CONVERSATIONS[0],
          executable: false,
        },
      })
    ).toContain('not-executable');
  });

  it('rejects a rotated sample whose launched prompt differs from its bubble', () => {
    expect(
      validateChatStarterConversation({
        sample: CHAT_STARTER_CONVERSATIONS[1],
        launchedPrompt: 'A different hidden prompt.',
      })
    ).toContain('launch-prompt-mismatch');
  });

  it('rotates deterministically and wraps in both directions', () => {
    expect(takeNextStarterConversationIndex()).toBe(0);
    expect(takeNextStarterConversationIndex()).toBe(1);
    expect(takeNextStarterConversationIndex()).toBe(2);
    expect(takeNextStarterConversationIndex()).toBe(0);
    expect(starterConversationAtIndex(-1)).toEqual(
      CHAT_STARTER_CONVERSATIONS[2]
    );
  });
});
