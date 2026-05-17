import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const selectLimitMock = vi.fn();
  const selectOrderByMock = vi.fn();
  const selectWhereMock = vi.fn(() => ({
    limit: selectLimitMock,
    orderBy: selectOrderByMock,
  }));
  const selectFromMock = vi.fn(() => ({ where: selectWhereMock }));
  const selectMock = vi.fn(() => ({ from: selectFromMock }));

  const insertReturningMock = vi.fn();
  const insertOnConflictDoNothingMock = vi.fn(() => ({
    returning: insertReturningMock,
  }));
  const insertValuesMock = vi.fn(() => ({
    onConflictDoNothing: insertOnConflictDoNothingMock,
    returning: insertReturningMock,
  }));
  const insertMock = vi.fn(() => ({ values: insertValuesMock }));

  const updateWhereMock = vi.fn();
  const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
  const updateMock = vi.fn(() => ({ set: updateSetMock }));
  const deleteWhereMock = vi.fn();
  const deleteMock = vi.fn(() => ({ where: deleteWhereMock }));

  return {
    selectLimitMock,
    selectOrderByMock,
    selectMock,
    insertMock,
    insertValuesMock,
    insertReturningMock,
    updateMock,
    deleteMock,
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.selectMock,
    insert: hoisted.insertMock,
    update: hoisted.updateMock,
    delete: hoisted.deleteMock,
  },
}));

vi.mock('@/lib/db/schema/chat', () => ({
  chatConversations: {
    id: 'conversationId',
    creatorProfileId: 'creatorProfileId',
    userId: 'userId',
    title: 'title',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  chatMessages: {
    id: 'messageId',
    conversationId: 'conversationId',
    turnId: 'turnId',
    clientMessageId: 'clientMessageId',
    role: 'role',
    content: 'content',
    toolCalls: 'toolCalls',
    createdAt: 'createdAt',
  },
  chatTurns: {
    id: 'turnId',
    userId: 'userId',
    creatorProfileId: 'creatorProfileId',
    conversationId: 'conversationId',
    clientTurnId: 'clientTurnId',
    status: 'status',
    source: 'source',
    toolIntent: 'toolIntent',
    errorCode: 'errorCode',
    errorMessage: 'errorMessage',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    startedAt: 'startedAt',
    completedAt: 'completedAt',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  asc: vi.fn(),
  eq: vi.fn(),
}));

describe('chat turn service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns TURN_IN_PROGRESS semantics for duplicate in-flight turns', async () => {
    hoisted.selectLimitMock
      .mockResolvedValueOnce([{ id: 'conv-1' }])
      .mockResolvedValueOnce([
        {
          id: 'turn-1',
          conversationId: 'conv-1',
          clientTurnId: 'client-turn-1',
          status: 'streaming',
        },
      ]);
    hoisted.insertReturningMock.mockResolvedValueOnce([]);

    const { reserveChatTurn } = await import('@/lib/chat/turns');
    const result = await reserveChatTurn({
      conversationId: 'conv-1',
      clientTurnId: 'client-turn-1',
      clientMessageId: 'client-message-1',
      source: 'typed',
      toolIntent: null,
      userMessage: 'Generate album art',
      userId: 'user-1',
      creatorProfileId: 'profile-1',
    });

    expect(result.outcome).toBe('duplicate_in_progress');
    expect(result.conversationId).toBe('conv-1');
  });

  it('detects duplicate first turns before creating another conversation', async () => {
    hoisted.selectLimitMock.mockResolvedValueOnce([
      {
        id: 'turn-1',
        conversationId: 'conv-existing',
        clientTurnId: 'client-turn-1',
        status: 'reserved',
      },
    ]);

    const { reserveChatTurn } = await import('@/lib/chat/turns');
    const result = await reserveChatTurn({
      conversationId: null,
      clientTurnId: 'client-turn-1',
      clientMessageId: 'client-message-1',
      source: 'typed',
      toolIntent: null,
      userMessage: 'Generate album art',
      userId: 'user-1',
      creatorProfileId: 'profile-1',
    });

    expect(result.outcome).toBe('duplicate_in_progress');
    expect(result.conversationId).toBe('conv-existing');
    expect(hoisted.insertMock).not.toHaveBeenCalled();
  });

  it('reserves a new turn and persists the user message with client ids', async () => {
    const insertedTurn = {
      id: 'turn-1',
      conversationId: 'conv-1',
      clientTurnId: 'client-turn-1',
      status: 'reserved',
    };
    hoisted.selectLimitMock.mockResolvedValueOnce([{ id: 'conv-1' }]);
    hoisted.insertReturningMock.mockResolvedValueOnce([insertedTurn]);

    const { reserveChatTurn } = await import('@/lib/chat/turns');
    const result = await reserveChatTurn({
      conversationId: 'conv-1',
      clientTurnId: 'client-turn-1',
      clientMessageId: 'client-message-1',
      source: 'quick_action',
      toolIntent: 'album_art_generation',
      userMessage: 'Generate album art',
      userId: 'user-1',
      creatorProfileId: 'profile-1',
    });

    expect(result.outcome).toBe('reserved');
    expect(hoisted.insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        turnId: 'turn-1',
        clientMessageId: 'client-message-1',
        role: 'user',
        content: 'Generate album art',
      })
    );
  });
});
