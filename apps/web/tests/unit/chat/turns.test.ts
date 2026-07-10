import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const selectLimitMock = vi.fn();
  // orderBy() returns an awaitable list (used to load all messages for a
  // turn) AND a `.limit()` chain (used to fetch the earliest terminal
  // assistant message). We build it as a thenable so `await` works and
  // `.limit()` is still chainable, matching real Drizzle behavior.
  const selectOrderByMock = vi.fn(() => {
    const chain: {
      limit: typeof selectLimitMock;
      then: (
        onFulfilled?: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown
      ) => Promise<unknown>;
    } = {
      limit: selectLimitMock,
      then: (onFulfilled, onRejected) =>
        Promise.resolve([]).then(onFulfilled, onRejected),
    };
    return chain;
  });
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
    insertOnConflictDoNothingMock,
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

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
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
    assistantSource: 'assistantSource',
    scriptLineKey: 'scriptLineKey',
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
    model: 'model',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  asc: vi.fn(),
  eq: vi.fn(),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
  })),
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
    // JOV-2275: user-message insert must use onConflictDoNothing so a
    // retried request cannot double-write the user row.
    expect(hoisted.insertOnConflictDoNothingMock).toHaveBeenCalled();
    expect(
      hoisted.insertOnConflictDoNothingMock.mock.calls.at(-1)?.[0]
    ).toEqual(
      expect.objectContaining({
        where: expect.anything(),
      })
    );
  });

  it('falls back to clientTurnId when no clientMessageId is provided', async () => {
    const insertedTurn = {
      id: 'turn-2',
      conversationId: 'conv-2',
      clientTurnId: 'client-turn-2',
      status: 'reserved',
    };
    hoisted.selectLimitMock.mockResolvedValueOnce([{ id: 'conv-2' }]);
    hoisted.insertReturningMock.mockResolvedValueOnce([insertedTurn]);

    const { reserveChatTurn } = await import('@/lib/chat/turns');
    const result = await reserveChatTurn({
      conversationId: 'conv-2',
      clientTurnId: 'client-turn-2',
      clientMessageId: null,
      source: 'typed',
      toolIntent: null,
      userMessage: 'Hi Jovie',
      userId: 'user-2',
      creatorProfileId: 'profile-2',
    });

    expect(result.outcome).toBe('reserved');
    // When clientMessageId is null we fall back to clientTurnId so the
    // partial unique index covers the row (JOV-2275).
    expect(hoisted.insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clientMessageId: 'client-turn-2',
        role: 'user',
      })
    );
    expect(
      hoisted.insertOnConflictDoNothingMock.mock.calls.at(-1)?.[0]
    ).toEqual(
      expect.objectContaining({
        where: expect.anything(),
      })
    );
  });

  it('persistTerminalAssistantMessage short-circuits when a terminal message already exists for the turn', async () => {
    const existingAssistant = {
      id: 'msg-existing',
      conversationId: 'conv-1',
      turnId: 'turn-1',
      clientMessageId: null,
      role: 'assistant',
      content: 'Already saved.',
      toolCalls: null,
      createdAt: new Date('2025-01-01T00:00:00Z'),
    };

    // Force the SELECT chain to resolve to the existing assistant row.
    hoisted.selectOrderByMock.mockReturnValueOnce({
      limit: vi.fn().mockResolvedValueOnce([existingAssistant]),
      then: (onFulfilled: (value: unknown) => unknown) =>
        Promise.resolve([existingAssistant]).then(onFulfilled),
    });

    const { persistTerminalAssistantMessage } = await import(
      '@/lib/chat/turns'
    );
    const result = await persistTerminalAssistantMessage({
      conversationId: 'conv-1',
      turnId: 'turn-1',
      status: 'completed',
      content: 'A second terminal write attempt',
    });

    // Returns the existing row (with core-column null attribution fields)
    // instead of inserting a duplicate.
    expect(result).toEqual({
      ...existingAssistant,
      assistantSource: null,
      scriptLineKey: null,
    });
    // Critical JOV-2275 invariant: no chatMessages insert is issued when
    // a terminal assistant row already exists for this turn.
    expect(hoisted.insertMock).not.toHaveBeenCalled();
    // Turn status update still lands so late error handlers can flip
    // status (e.g. completed -> canceled if a disconnect arrived first
    // but onFinish landed too).
    expect(hoisted.updateMock).toHaveBeenCalled();
  });

  it('persistTerminalAssistantMessage inserts when no terminal assistant message exists yet', async () => {
    // No existing assistant row.
    hoisted.selectOrderByMock.mockReturnValueOnce({
      limit: vi.fn().mockResolvedValueOnce([]),
      then: (onFulfilled: (value: unknown) => unknown) =>
        Promise.resolve([]).then(onFulfilled),
    });
    hoisted.insertReturningMock.mockResolvedValueOnce([
      {
        id: 'msg-new',
        conversationId: 'conv-1',
        turnId: 'turn-1',
        clientMessageId: null,
        role: 'assistant',
        content: 'Hello!',
        toolCalls: null,
        createdAt: new Date(),
      },
    ]);

    const { persistTerminalAssistantMessage } = await import(
      '@/lib/chat/turns'
    );
    const result = await persistTerminalAssistantMessage({
      conversationId: 'conv-1',
      turnId: 'turn-1',
      status: 'completed',
      content: 'Hello!',
    });

    expect(result.id).toBe('msg-new');
    expect(result.assistantSource).toBeNull();
    expect(result.scriptLineKey).toBeNull();
    expect(hoisted.insertMock).toHaveBeenCalled();
    expect(hoisted.updateMock).toHaveBeenCalled();
  });

  it('persistTerminalAssistantMessage fails soft when the DB write throws', async () => {
    hoisted.selectOrderByMock.mockReturnValueOnce({
      limit: vi.fn().mockRejectedValueOnce(new Error('column does not exist')),
      then: (onFulfilled: (value: unknown) => unknown, onRejected) =>
        Promise.reject(new Error('column does not exist')).then(
          onFulfilled,
          onRejected
        ),
    });

    const { logger } = await import('@/lib/utils/logger');
    const { persistTerminalAssistantMessage } = await import(
      '@/lib/chat/turns'
    );
    const result = await persistTerminalAssistantMessage({
      conversationId: 'conv-1',
      turnId: 'turn-1',
      status: 'failed_model_error',
      content: 'Stream text still delivered.',
      errorCode: 'CHAT_STREAM_FAILED',
    });

    // Ephemeral row so callers never throw and kill the stream.
    expect(result.id).toBe('ephemeral-turn-1');
    expect(result.content).toBe('Stream text still delivered.');
    expect(logger.error).toHaveBeenCalledWith(
      'Chat terminal assistant persist failed',
      expect.objectContaining({ turnId: 'turn-1' }),
      'chat/turns'
    );
  });

  it('markChatTurnStreaming fails soft when the update throws', async () => {
    hoisted.updateMock.mockImplementationOnce(() => {
      throw new Error('db unavailable');
    });

    const { logger } = await import('@/lib/utils/logger');
    const { markChatTurnStreaming } = await import('@/lib/chat/turns');

    await expect(markChatTurnStreaming('turn-1')).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      'Chat turn streaming mark failed',
      expect.objectContaining({ turnId: 'turn-1' }),
      'chat/turns'
    );
  });
});
