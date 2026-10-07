import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const selectLimitMock = vi.fn();
  const selectOrderByMock = vi.fn().mockReturnValue({ limit: selectLimitMock });
  const selectWhereMock = vi.fn().mockImplementation(() => ({
    limit: selectLimitMock,
    orderBy: selectOrderByMock,
  }));
  const selectLeftJoinMock = vi
    .fn()
    .mockReturnValue({ where: selectWhereMock });
  const selectFromMock = vi.fn().mockReturnValue({
    where: selectWhereMock,
    leftJoin: selectLeftJoinMock,
  });
  const selectMock = vi.fn().mockReturnValue({ from: selectFromMock });

  const insertReturningMock = vi.fn();
  const insertOnConflictDoNothingMock = vi
    .fn()
    .mockReturnValue({ returning: insertReturningMock });
  const insertValuesMock = vi.fn().mockReturnValue({
    onConflictDoNothing: insertOnConflictDoNothingMock,
    returning: insertReturningMock,
  });
  const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });

  const updateWhereMock = vi.fn().mockResolvedValue(undefined);
  const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
  const updateMock = vi.fn().mockReturnValue({ set: updateSetMock });

  return {
    getSessionContextMock: vi.fn(),
    selectMock,
    selectLimitMock,
    insertMock,
    insertValuesMock,
    insertOnConflictDoNothingMock,
    insertReturningMock,
    updateMock,
    updateSetMock,
    generateTextMock: vi.fn(),
    titleTasks: [] as Array<() => Promise<void>>,
    captureErrorMock: vi.fn(),
    loggerWarnMock: vi.fn(),
    loggerErrorMock: vi.fn(),
  };
});

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: hoisted.getSessionContextMock,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.selectMock,
    insert: hoisted.insertMock,
    update: hoisted.updateMock,
  },
}));

vi.mock('@/lib/ai/sdk', () => ({
  generateText: hoisted.generateTextMock,
  gateway: vi.fn(),
}));
vi.mock('@/lib/next/schedule-after', () => ({
  scheduleAfter: vi.fn((task: () => Promise<void>) => {
    hoisted.titleTasks.push(task);
    return true;
  }),
}));

vi.mock('@/lib/db/schema/chat', () => ({
  chatConversations: {
    id: 'conversationId',
    title: 'title',
    creatorProfileId: 'creatorProfileId',
    updatedAt: 'updatedAt',
  },
  chatMessages: {
    id: 'messageId',
    conversationId: 'conversationId',
    clientMessageId: 'clientMessageId',
    role: 'role',
    content: 'content',
    toolCalls: 'toolCalls',
    turnId: 'turnId',
    createdAt: 'createdAt',
  },
  chatTurns: {
    id: 'turnId',
    status: 'status',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  isNull: vi.fn(),
  lt: vi.fn(),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
  })),
}));

vi.mock('@ai-sdk/gateway', () => ({
  createGateway: vi.fn(() => vi.fn()),
  gateway: vi.fn(),
}));

vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

vi.mock('next/server', async importOriginal => {
  const actual = await importOriginal<typeof import('next/server')>();
  return {
    ...actual,
    after: vi.fn(),
  };
});

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: hoisted.loggerWarnMock,
    error: hoisted.loggerErrorMock,
  },
}));

vi.mock('@/app/api/chat/session-error-response', () => ({
  getSessionErrorResponse: vi.fn().mockReturnValue(null),
}));

describe('chat conversation message routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    hoisted.titleTasks.length = 0;
    hoisted.selectLimitMock.mockReset();
    hoisted.selectLimitMock.mockResolvedValue([]);
    hoisted.insertReturningMock.mockReset();
    hoisted.insertReturningMock.mockResolvedValue([]);
    hoisted.getSessionContextMock.mockResolvedValue({
      profile: { id: 'profile-1' },
    });
  });

  it('persists an owner-bound deterministic task title without invoking a model or changing the body', async () => {
    const content = `Help me with this work.\n${JSON.stringify({ workId: '808c9f4d-505c-4000-8000-000000000001', workTitle: 'Midnight Drive', revision: '2026-10-06' })}`;
    hoisted.selectLimitMock.mockResolvedValueOnce([
      { id: 'conv-1', title: null },
    ]);
    const { POST } = await import(
      '@/app/api/chat/conversations/[id]/messages/route'
    );
    const response = await POST(
      new Request('http://localhost/api/chat/conversations/conv-1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content }] }),
      }),
      { params: Promise.resolve({ id: 'conv-1' }) }
    );
    expect(response.status).toBe(201);
    await hoisted.titleTasks[0]();
    expect(hoisted.generateTextMock).not.toHaveBeenCalled();
    expect(hoisted.updateSetMock).toHaveBeenCalledWith({
      title: 'Midnight Drive',
    });
    expect(hoisted.insertValuesMock).toHaveBeenCalledWith([
      expect.objectContaining({ content }),
    ]);
    const { eq, isNull } = await import('drizzle-orm');
    expect(eq).toHaveBeenCalledWith('creatorProfileId', 'profile-1');
    expect(isNull).toHaveBeenCalledWith('title');
  });

  it('removes transport metadata from title-model context while retaining stored messages', async () => {
    const content = `Help me with this work.\n${JSON.stringify({ workId: '808c9f4d-505c-4000-8000-000000000001', workTitle: 'Midnight Drive', revision: '2026-10-06' })}`;
    hoisted.selectLimitMock.mockResolvedValueOnce([
      { id: 'conv-1', title: null },
    ]);
    hoisted.generateTextMock.mockResolvedValueOnce({
      text: 'Release planning',
    });
    const { POST } = await import(
      '@/app/api/chat/conversations/[id]/messages/route'
    );
    await POST(
      new Request('http://localhost/api/chat/conversations/conv-1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: 'Help me plan a release' },
            { role: 'assistant', content },
          ],
        }),
      }),
      { params: Promise.resolve({ id: 'conv-1' }) }
    );
    await hoisted.titleTasks[0]();
    const prompt = hoisted.generateTextMock.mock.calls[0][0].prompt;
    expect(prompt).toContain('Midnight Drive');
    expect(prompt).not.toContain('workId');
    expect(prompt).not.toContain('revision');
    expect(hoisted.updateSetMock).toHaveBeenCalledWith({
      title: 'Release planning',
    });
  });

  it('accepts assistant tool-only messages on POST', async () => {
    hoisted.selectLimitMock.mockResolvedValueOnce([
      {
        id: 'conv-1',
        title: 'Existing thread',
      },
    ]);
    hoisted.insertReturningMock.mockResolvedValueOnce([
      {
        id: 'msg-1',
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            schemaVersion: 2,
            toolCallId: 'tool-1',
            toolName: 'generateAlbumArt',
            state: 'succeeded',
            output: { success: true, title: 'Neon Nights' },
            summary: 'Neon Nights',
            uiHint: 'artifact',
          },
        ],
      },
    ]);

    const { POST } = await import(
      '@/app/api/chat/conversations/[id]/messages/route'
    );
    const response = await POST(
      new Request('http://localhost/api/chat/conversations/conv-1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              clientMessageId: 'assistant:tool-1',
              role: 'assistant',
              content: '',
              toolCalls: [
                {
                  schemaVersion: 2,
                  toolCallId: 'tool-1',
                  toolName: 'generateAlbumArt',
                  state: 'succeeded',
                  output: { success: true, title: 'Neon Nights' },
                  summary: 'Neon Nights',
                  uiHint: 'artifact',
                },
              ],
            },
          ],
        }),
      }),
      { params: Promise.resolve({ id: 'conv-1' }) }
    );

    expect(response.status).toBe(201);
    expect(hoisted.insertValuesMock).toHaveBeenCalledWith([
      {
        conversationId: 'conv-1',
        clientMessageId: 'assistant:tool-1',
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            schemaVersion: 2,
            toolCallId: 'tool-1',
            toolName: 'generateAlbumArt',
            state: 'succeeded',
            output: { success: true, title: 'Neon Nights' },
            summary: 'Neon Nights',
            uiHint: 'artifact',
          },
        ],
      },
    ]);
    expect(hoisted.insertOnConflictDoNothingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.anything(),
      })
    );
  });

  it('rejects assistant messages with empty content and no tool calls', async () => {
    hoisted.selectLimitMock.mockResolvedValueOnce([
      {
        id: 'conv-1',
        title: 'Existing thread',
      },
    ]);

    const { POST } = await import(
      '@/app/api/chat/conversations/[id]/messages/route'
    );
    const response = await POST(
      new Request('http://localhost/api/chat/conversations/conv-1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'assistant',
          content: '',
        }),
      }),
      { params: Promise.resolve({ id: 'conv-1' }) }
    );

    expect(response.status).toBe(400);
    expect(hoisted.insertMock).not.toHaveBeenCalled();
    expect(hoisted.loggerWarnMock).toHaveBeenCalled();
  });

  it('returns normalized tool calls on GET and flags legacy reads', async () => {
    const conversationRow = {
      id: 'conv-1',
      title: 'Existing thread',
      creatorProfileId: 'profile-1',
    };
    const messageRows = [
      {
        id: 'msg-v2',
        role: 'assistant',
        content: '',
        clientMessageId: null,
        turnId: null,
        turnStatus: null,
        toolCalls: [
          {
            schemaVersion: 2,
            toolCallId: 'tool-v2',
            toolName: 'showTopInsights',
            state: 'succeeded',
            output: { success: true, title: 'Top Signals' },
            summary: 'Top Signals',
            uiHint: 'artifact',
          },
        ],
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
      {
        id: 'msg-legacy',
        role: 'assistant',
        content: '',
        clientMessageId: null,
        turnId: null,
        turnStatus: null,
        toolCalls: [
          {
            type: 'tool-invocation',
            toolInvocation: {
              toolCallId: 'tool-legacy',
              toolName: 'showTopInsights',
              state: 'result',
              result: { success: true, title: 'Legacy Signals' },
            },
          },
        ],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ];

    let selectLimitCalls = 0;
    hoisted.selectLimitMock.mockImplementation(async () => {
      selectLimitCalls += 1;
      if (selectLimitCalls === 1) {
        return [conversationRow];
      }
      if (selectLimitCalls === 2) {
        return messageRows;
      }
      return [];
    });

    const { GET } = await import('@/app/api/chat/conversations/[id]/route');
    const response = await GET(
      new Request('http://localhost/api/chat/conversations/conv-1'),
      { params: Promise.resolve({ id: 'conv-1' }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].toolCalls).toEqual([
      expect.objectContaining({
        toolCallId: 'tool-legacy',
        toolName: 'showTopInsights',
        state: 'succeeded',
      }),
    ]);
    expect(body.messages[1].toolCalls).toEqual([
      expect.objectContaining({
        toolCallId: 'tool-v2',
        toolName: 'showTopInsights',
        state: 'succeeded',
      }),
    ]);
    expect(hoisted.loggerWarnMock).toHaveBeenCalledWith(
      'Decoded legacy tool calls while loading conversation',
      { conversationId: 'conv-1', messageId: 'msg-legacy' },
      'chat-conversation'
    );
  });
});
