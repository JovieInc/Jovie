import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const selectLimitMock = vi.fn();
  const selectOrderByMock = vi.fn(() => ({ limit: selectLimitMock }));
  const selectWhereMock = vi.fn(() => ({ orderBy: selectOrderByMock }));
  const selectLeftJoinMock = vi.fn(() => ({ where: selectWhereMock }));
  const selectFromMock = vi.fn(() => ({
    where: selectWhereMock,
    leftJoin: selectLeftJoinMock,
  }));
  const selectMock = vi.fn(() => ({ from: selectFromMock }));

  return {
    selectMock,
    selectLeftJoinMock,
    selectLimitMock,
    andMock: vi.fn((...args: unknown[]) => ({ and: args })),
    orMock: vi.fn((...args: unknown[]) => ({ or: args })),
    isNullMock: vi.fn((col: unknown) => ({ isNull: col })),
    notInArrayMock: vi.fn((col: unknown, vals: unknown) => ({
      notInArray: [col, vals],
    })),
    eqMock: vi.fn((col: unknown, val: unknown) => ({ eq: [col, val] })),
    descMock: vi.fn((col: unknown) => ({ desc: col })),
  };
});

vi.mock('@/lib/db', () => ({
  db: { select: hoisted.selectMock },
}));

vi.mock('drizzle-orm', () => ({
  and: hoisted.andMock,
  desc: hoisted.descMock,
  eq: hoisted.eqMock,
  isNull: hoisted.isNullMock,
  lt: vi.fn(),
  notInArray: hoisted.notInArrayMock,
  or: hoisted.orMock,
  sql: vi.fn(() => ({ as: vi.fn(() => 'subquery') })),
}));

vi.mock('@/lib/db/schema/chat', () => ({
  chatConversations: {
    id: 'id',
    title: 'title',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    creatorProfileId: 'creatorProfileId',
  },
  chatMessages: {
    role: 'role',
    conversationId: 'conversationId',
    createdAt: 'createdAt',
  },
  chatTurns: {
    conversationId: 'conversationId',
    status: 'status',
    updatedAt: 'updatedAt',
  },
}));

vi.mock('@/lib/db/schema/tasks', () => ({
  tasks: {
    id: 'tasks.id',
    conversationId: 'tasks.conversation_id',
    status: 'tasks.status',
    archivedAt: 'tasks.archived_at',
    deletedAt: 'tasks.deleted_at',
  },
}));

vi.mock('@/lib/chat/title', () => ({
  withSanitizedConversationTitles: vi.fn(rows => rows),
}));

vi.mock('@/lib/chat/tool-events', () => ({
  decodeToolEvents: vi.fn(() => ({ source: 'none', events: [] })),
  resolvePersistedToolEventsForDisplay: vi.fn(() => []),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

import { listCreatorConversations } from './conversation-queries';

describe('listCreatorConversations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists conversations for the creator profile', async () => {
    hoisted.selectLimitMock.mockResolvedValueOnce([
      {
        id: 'conv-1',
        title: 'Hello',
        createdAt: new Date(),
        updatedAt: new Date(),
        latestMessageRole: 'assistant',
        latestTurnStatus: 'completed',
      },
    ]);

    const result = await listCreatorConversations({
      creatorProfileId: 'profile-1',
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('conv-1');
    expect(hoisted.selectLeftJoinMock).toHaveBeenCalled();
  });

  it('excludes conversations whose work record is done, cancelled, or archived', async () => {
    hoisted.selectLimitMock.mockResolvedValueOnce([]);

    await listCreatorConversations({ creatorProfileId: 'profile-1' });

    // Work records with a terminal status must not leak into the active
    // listing (JOV-4514).
    expect(hoisted.notInArrayMock).toHaveBeenCalledWith('tasks.status', [
      'done',
      'cancelled',
    ]);
    expect(hoisted.isNullMock).toHaveBeenCalledWith('tasks.archived_at');
    // Conversations without a work record stay listed.
    expect(hoisted.isNullMock).toHaveBeenCalledWith('tasks.id');
    expect(hoisted.isNullMock).toHaveBeenCalledWith('tasks.deleted_at');
    expect(hoisted.orMock).toHaveBeenCalled();
  });
});
