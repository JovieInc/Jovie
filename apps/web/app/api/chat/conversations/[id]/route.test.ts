import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getSessionContextMock: vi.fn(),
  updateReturningMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: hoisted.getSessionContextMock,
}));

vi.mock('@/lib/db', () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: hoisted.updateReturningMock,
        })),
      })),
    })),
  },
}));

vi.mock('@/lib/db/schema/chat', () => ({
  chatConversations: {
    id: 'id',
    title: 'title',
    updatedAt: 'updatedAt',
    creatorProfileId: 'creatorProfileId',
    userId: 'userId',
  },
}));

vi.mock('@/lib/chat/title', () => ({
  sanitizeConversationTitle: vi.fn((title: unknown) =>
    typeof title === 'string' ? title : null
  ),
  withSanitizedConversationTitle: vi.fn(
    (conversation: unknown) => conversation
  ),
}));

vi.mock('@/lib/chat/conversation-queries', () => ({
  getCreatorConversationDetail: vi.fn(),
}));

vi.mock('@/lib/chat/conversation-access', () => ({
  ownedConversationCondition: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('../../session-error-response', () => ({
  getSessionErrorResponse: vi.fn().mockReturnValue(null),
}));

const { PATCH } = await import('./route');

const url = 'https://jov.ie/api/chat/conversations/conv_1';
const patch = async (body: unknown) =>
  PATCH(new Request(url, { method: 'PATCH', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: 'conv_1' }),
  });

describe('PATCH /api/chat/conversations/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getSessionContextMock.mockResolvedValue({
      user: { id: 'user_123' },
      profile: { id: 'profile_123' },
    });
    hoisted.updateReturningMock.mockResolvedValue([
      { id: 'conv_1', title: 'Renamed' },
    ]);
  });

  it('renames a conversation with a valid payload', async () => {
    const response = await patch({ title: 'Renamed' });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.conversation.id).toBe('conv_1');
  });

  it('returns 400 when body field types are invalid', async () => {
    const response = await patch({ title: 123 });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid request body');
  });
});
