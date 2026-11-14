import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatConversation } from '@/lib/queries/useChatConversationsQuery';
import {
  buildChatHistoryRows,
  CHAT_HISTORY_EMPTY,
  CHAT_HISTORY_ERROR,
  CHAT_HISTORY_NO_MATCH,
  chatHistoryRowMatches,
  getChatHistoryEmptyMessage,
  getChatThreadIdFromPath,
} from './chat-history-switcher';

const NOW = Date.parse('2026-11-08T20:00:00Z');

function conversation(
  id: string,
  updatedAt: string,
  overrides: Partial<ChatConversation> = {}
): ChatConversation {
  return {
    id,
    title: `Chat ${id}`,
    createdAt: updatedAt,
    updatedAt,
    latestMessageRole: 'assistant',
    latestTurnStatus: 'completed',
    ...overrides,
  };
}

describe('buildChatHistoryRows', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('orders rows newest first with compact ages', () => {
    const rows = buildChatHistoryRows(
      [
        conversation('old', '2026-08-01T20:00:00Z'),
        conversation('new', '2026-11-08T19:55:00Z'),
        conversation('mid', '2026-10-16T20:00:00Z'),
      ],
      { activeId: null, readAtById: {} }
    );

    expect(rows.map(row => [row.id, row.age])).toEqual([
      ['new', '5m'],
      ['mid', '3w'],
      ['old', '3mo'],
    ]);
  });

  it('links each row to its thread and marks the current one active', () => {
    const [row] = buildChatHistoryRows(
      [conversation('abc', '2026-11-08T19:00:00Z')],
      { activeId: 'abc', readAtById: {} }
    );
    expect(row.href).toBe('/app/chat/abc');
    expect(row.active).toBe(true);
  });

  it('falls back to a readable title for untitled chats', () => {
    const [row] = buildChatHistoryRows(
      [conversation('x', '2026-11-08T19:00:00Z', { title: '   ' })],
      { activeId: null, readAtById: {} }
    );
    expect(row.title).toBe('Conversation');
  });

  it('shows no unread dots before this browser has a read baseline', () => {
    const rows = buildChatHistoryRows(
      [conversation('a', '2026-11-08T19:00:00Z')],
      { activeId: null, readAtById: {} }
    );
    expect(rows[0].unread).toBe(false);
  });

  it('marks a chat unread when an assistant reply landed after it was read', () => {
    const rows = buildChatHistoryRows(
      [
        conversation('fresh', '2026-11-08T19:00:00Z'),
        conversation('seen', '2026-11-08T18:00:00Z'),
        conversation('mine', '2026-11-08T19:30:00Z', {
          latestMessageRole: 'user',
        }),
      ],
      {
        activeId: null,
        readAtById: {
          fresh: '2026-11-08T18:00:00Z',
          seen: '2026-11-08T18:00:00Z',
          mine: '2026-11-08T18:00:00Z',
        },
      }
    );
    const unread = Object.fromEntries(rows.map(row => [row.id, row.unread]));
    expect(unread).toEqual({ mine: false, fresh: true, seen: false });
  });

  it('never marks the open chat unread', () => {
    const [row] = buildChatHistoryRows(
      [conversation('open', '2026-11-08T19:00:00Z')],
      { activeId: 'open', readAtById: { open: '2026-11-08T18:00:00Z' } }
    );
    expect(row.unread).toBe(false);
  });
});

describe('chatHistoryRowMatches', () => {
  it.each([
    ['Release Plan For Spring', '', true],
    ['Release Plan For Spring', 'release', true],
    ['Release Plan For Spring', 'PLAN', true],
    ['Release Plan For Spring', 'spring release', true],
    ['Release Plan For Spring', 'tour', false],
    ['Release Plan For Spring', 'release tour', false],
    ['Release Plan For Spring', '   ', true],
  ])('%s matches %j: %s', (title, query, expected) => {
    expect(chatHistoryRowMatches(title, query)).toBe(expected);
  });
});

describe('getChatHistoryEmptyMessage', () => {
  it('says there are no chats before any search', () => {
    expect(getChatHistoryEmptyMessage({ query: '', isError: false })).toBe(
      CHAT_HISTORY_EMPTY
    );
  });

  it('says nothing matched during a search', () => {
    expect(getChatHistoryEmptyMessage({ query: 'tour', isError: false })).toBe(
      CHAT_HISTORY_NO_MATCH
    );
  });

  it('reports a load failure over either', () => {
    expect(getChatHistoryEmptyMessage({ query: 'tour', isError: true })).toBe(
      CHAT_HISTORY_ERROR
    );
  });
});

describe('getChatThreadIdFromPath', () => {
  it.each([
    ['/app/chat/abc-123', 'abc-123'],
    ['/app/chat/a%20b', 'a b'],
    ['/app/chat/abc/extra', 'abc'],
    ['/app/chat', null],
    ['/app/chat/', null],
    ['/app/settings/abc', null],
    ['/app/chat/%E0%A4%A', null],
    [undefined, null],
  ])('%s gives %j', (path, expected) => {
    expect(getChatThreadIdFromPath(path)).toBe(expected);
  });
});
