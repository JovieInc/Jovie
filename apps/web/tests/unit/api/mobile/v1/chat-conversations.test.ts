import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

const hoisted = vi.hoisted(() => ({
  requireMobileProfileSessionMock: vi.fn(),
  listMobileConversationsMock: vi.fn(),
  getMobileConversationDetailMock: vi.fn(),
}));

vi.mock('@/lib/mobile/session-auth', () => ({
  requireMobileProfileSession: hoisted.requireMobileProfileSessionMock,
}));

vi.mock('@/lib/mobile/chat/conversations', () => ({
  listMobileConversations: hoisted.listMobileConversationsMock,
  getMobileConversationDetail: hoisted.getMobileConversationDetailMock,
}));

const listRoutePromise = import('@/app/api/mobile/v1/chat/conversations/route');
const detailRoutePromise = import(
  '@/app/api/mobile/v1/chat/conversations/[id]/route'
);

describe('GET /api/mobile/v1/chat/conversations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requireMobileProfileSessionMock.mockResolvedValue({
      profile: { id: 'profile_123' },
      userId: 'user_123',
    });
    hoisted.listMobileConversationsMock.mockResolvedValue([
      {
        id: 'conv_1',
        title: 'Launch plan',
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-02T00:00:00.000Z'),
        latestMessageRole: 'assistant',
        latestTurnStatus: 'completed',
      },
    ]);
  });

  it('returns 401 without a mobile session token', async () => {
    hoisted.requireMobileProfileSessionMock.mockResolvedValue({
      errorResponse: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      ),
    });
    const { GET } = await listRoutePromise;
    const response = await GET(
      new Request('https://jov.ie/api/mobile/v1/chat/conversations')
    );

    expect(response.status).toBe(401);
  });

  it('lists conversations for the authenticated profile', async () => {
    const { GET } = await listRoutePromise;
    const response = await GET(
      new Request('https://jov.ie/api/mobile/v1/chat/conversations?limit=5')
    );

    expect(response.status).toBe(200);
    expect(hoisted.listMobileConversationsMock).toHaveBeenCalledWith({
      creatorProfileId: 'profile_123',
      limit: 5,
    });
    await expect(response.json()).resolves.toEqual({
      conversations: [
        {
          id: 'conv_1',
          title: 'Launch plan',
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-02T00:00:00.000Z',
          latestMessageRole: 'assistant',
          latestTurnStatus: 'completed',
        },
      ],
    });
  });
});

describe('GET /api/mobile/v1/chat/conversations/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requireMobileProfileSessionMock.mockResolvedValue({
      profile: { id: 'profile_123' },
      userId: 'user_123',
    });
    hoisted.getMobileConversationDetailMock.mockResolvedValue({
      conversation: {
        id: 'conv_1',
        title: 'Launch plan',
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-02T00:00:00.000Z'),
      },
      messages: [
        {
          id: 'msg_1',
          role: 'user',
          content: 'Help me launch',
          clientMessageId: 'client_msg_1',
          turnId: 'turn_1',
          turnStatus: 'completed',
          createdAt: new Date('2026-06-02T00:00:00.000Z'),
          requiresWebHandoff: false,
        },
      ],
      hasMore: false,
    });
  });

  it('returns conversation detail for the authenticated profile', async () => {
    const { GET } = await detailRoutePromise;
    const response = await GET(
      new Request('https://jov.ie/api/mobile/v1/chat/conversations/conv_1'),
      { params: Promise.resolve({ id: 'conv_1' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      conversation: {
        id: 'conv_1',
        title: 'Launch plan',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-02T00:00:00.000Z',
      },
      messages: [
        {
          id: 'msg_1',
          role: 'user',
          content: 'Help me launch',
          clientMessageId: 'client_msg_1',
          turnId: 'turn_1',
          turnStatus: 'completed',
          createdAt: '2026-06-02T00:00:00.000Z',
          requiresWebHandoff: false,
        },
      ],
      hasMore: false,
    });
  });
});
