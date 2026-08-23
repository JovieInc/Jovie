import { beforeEach, describe, expect, it } from 'vitest';

import {
  CHAT_EMPTY_GREETING_STORAGE_KEY,
  CHAT_EMPTY_ROTATE_GREETINGS,
  CHAT_EMPTY_STILL_GREETING,
  greetingAtIndex,
  takeNextEmptyChatGreeting,
} from './chat-empty-greeting';

describe('chat empty rotate greetings', () => {
  beforeEach(() => {
    sessionStorage.removeItem(CHAT_EMPTY_GREETING_STORAGE_KEY);
  });

  it('locks the exact three-greeting set', () => {
    expect(CHAT_EMPTY_ROTATE_GREETINGS).toEqual([
      "Let's get it",
      'Ready to start?',
      'Ready when you are',
    ]);
    expect(CHAT_EMPTY_ROTATE_GREETINGS).toHaveLength(3);
    expect(CHAT_EMPTY_STILL_GREETING).toBe("Let's get it");
    expect(CHAT_EMPTY_ROTATE_GREETINGS).not.toContain("What's next?");
    expect(CHAT_EMPTY_ROTATE_GREETINGS).not.toContain("What's next, Tim?");
  });

  it('rotates in locked order and wraps', () => {
    expect(takeNextEmptyChatGreeting(sessionStorage)).toBe("Let's get it");
    expect(takeNextEmptyChatGreeting(sessionStorage)).toBe('Ready to start?');
    expect(takeNextEmptyChatGreeting(sessionStorage)).toBe(
      'Ready when you are'
    );
    expect(takeNextEmptyChatGreeting(sessionStorage)).toBe("Let's get it");
  });

  it('falls back to the still when storage is unavailable', () => {
    expect(takeNextEmptyChatGreeting(null)).toBe("Let's get it");
  });

  it('wraps negative and oversized indexes onto the locked set', () => {
    expect(greetingAtIndex(-1)).toBe('Ready when you are');
    expect(greetingAtIndex(3)).toBe("Let's get it");
  });
});
