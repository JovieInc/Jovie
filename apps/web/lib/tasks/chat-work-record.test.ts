import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const selectLimitMock = vi.fn();
  const selectWhereMock = vi.fn(() => ({ limit: selectLimitMock }));
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

  return {
    selectMock,
    selectLimitMock,
    insertMock,
    insertValuesMock,
    insertOnConflictDoNothingMock,
    insertReturningMock,
    reserveTaskNumberMock: vi.fn().mockResolvedValue(7),
    getNextTaskPositionMock: vi.fn().mockResolvedValue(3),
    sanitizeConversationTitleMock: vi.fn(
      (value: string | null | undefined) => value ?? null
    ),
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.selectMock,
    insert: hoisted.insertMock,
  },
}));

vi.mock('@/lib/tasks/task-reservation', () => ({
  reserveTaskNumber: hoisted.reserveTaskNumberMock,
  getNextTaskPosition: hoisted.getNextTaskPositionMock,
}));

vi.mock('@/lib/chat/title', () => ({
  sanitizeConversationTitle: hoisted.sanitizeConversationTitleMock,
}));

import { ensureChatWorkRecord } from './chat-work-record';

describe('ensureChatWorkRecord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.reserveTaskNumberMock.mockResolvedValue(7);
    hoisted.getNextTaskPositionMock.mockResolvedValue(3);
    hoisted.sanitizeConversationTitleMock.mockImplementation(
      (value: string | null | undefined) => value ?? null
    );
  });

  it('creates exactly one task for an owned conversation', async () => {
    hoisted.selectLimitMock
      .mockResolvedValueOnce([{ id: 'conv-1', title: 'My chat' }])
      .mockResolvedValueOnce([]);
    hoisted.insertReturningMock.mockResolvedValueOnce([{ id: 'task-1' }]);

    const result = await ensureChatWorkRecord({
      conversationId: 'conv-1',
      creatorProfileId: 'profile-1',
    });

    expect(result).toEqual({ taskId: 'task-1', created: true });
    expect(hoisted.insertMock).toHaveBeenCalledTimes(1);
    expect(hoisted.insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        taskNumber: 7,
        creatorProfileId: 'profile-1',
        conversationId: 'conv-1',
        title: 'My chat',
        status: 'todo',
        position: 3,
      })
    );
    expect(hoisted.insertOnConflictDoNothingMock).toHaveBeenCalled();
    expect(hoisted.reserveTaskNumberMock).toHaveBeenCalledWith('profile-1');
  });

  it('attaches to the existing record on retry instead of duplicating', async () => {
    hoisted.selectLimitMock
      .mockResolvedValueOnce([{ id: 'conv-1', title: 'My chat' }])
      .mockResolvedValueOnce([{ id: 'task-9' }]);

    const result = await ensureChatWorkRecord({
      conversationId: 'conv-1',
      creatorProfileId: 'profile-1',
    });

    expect(result).toEqual({ taskId: 'task-9', created: false });
    expect(hoisted.insertMock).not.toHaveBeenCalled();
    expect(hoisted.reserveTaskNumberMock).not.toHaveBeenCalled();
  });

  it('returns null for a conversation not owned by the profile', async () => {
    hoisted.selectLimitMock.mockResolvedValueOnce([]);

    const result = await ensureChatWorkRecord({
      conversationId: 'conv-other',
      creatorProfileId: 'profile-1',
    });

    expect(result).toBeNull();
    expect(hoisted.insertMock).not.toHaveBeenCalled();
  });

  it('reattaches when the insert loses the conflict race', async () => {
    hoisted.selectLimitMock
      .mockResolvedValueOnce([{ id: 'conv-1', title: 'My chat' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'task-5' }]);
    hoisted.insertReturningMock.mockResolvedValueOnce([]);

    const result = await ensureChatWorkRecord({
      conversationId: 'conv-1',
      creatorProfileId: 'profile-1',
    });

    expect(result).toEqual({ taskId: 'task-5', created: false });
  });

  it('falls back to Untitled chat when the conversation has no title', async () => {
    hoisted.selectLimitMock
      .mockResolvedValueOnce([{ id: 'conv-1', title: null }])
      .mockResolvedValueOnce([]);
    hoisted.sanitizeConversationTitleMock.mockReturnValueOnce(null);
    hoisted.insertReturningMock.mockResolvedValueOnce([{ id: 'task-2' }]);

    await ensureChatWorkRecord({
      conversationId: 'conv-1',
      creatorProfileId: 'profile-1',
    });

    expect(hoisted.insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Untitled chat' })
    );
  });
});
