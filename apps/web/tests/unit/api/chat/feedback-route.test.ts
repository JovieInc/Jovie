import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---- hoisted mocks ----
const mockGetCachedAuth = vi.hoisted(() => vi.fn());
const mockUsersFindFirst = vi.hoisted(() => vi.fn());
const mockChatTurnsFindFirst = vi.hoisted(() => vi.fn());
const mockGetCurrentUserEntitlements = vi.hoisted(() => vi.fn());
const mockUpsertChatMessageVote = vi.hoisted(() => vi.fn());
const mockDeleteChatMessageVote = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockLimit = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ success: true })
);

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
}));

vi.mock('@/lib/db', () => ({
  db: {
    query: {
      users: { findFirst: mockUsersFindFirst },
      chatTurns: { findFirst: mockChatTurnsFindFirst },
    },
  },
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetCurrentUserEntitlements,
}));

vi.mock('@/lib/feedback', () => ({
  upsertChatMessageVote: mockUpsertChatMessageVote,
  deleteChatMessageVote: mockDeleteChatMessageVote,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/rate-limit', () => ({
  generalLimiter: { limit: mockLimit },
  createRateLimitHeaders: vi.fn(() => ({})),
}));

vi.mock('@/lib/http/parse-json', () => ({
  parseJsonBody: vi.fn(async (request: Request) => {
    const body = await request.json();
    return { ok: true, data: body };
  }),
}));

import { POST } from '@/app/api/chat/feedback/route';

const TURN_ID = '123e4567-e89b-42d3-a456-426614174000';
const CONVERSATION_ID = '123e4567-e89b-42d3-a456-426614174001';

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/chat/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/chat/feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLimit.mockResolvedValue({ success: true });
    mockGetCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
    mockUsersFindFirst.mockResolvedValue({ id: 'user-uuid-1' });
    mockGetCurrentUserEntitlements.mockResolvedValue({ plan: 'pro' });
    mockUpsertChatMessageVote.mockResolvedValue({ id: 'feedback-1' });
    mockDeleteChatMessageVote.mockResolvedValue(undefined);
  });

  it('rejects unauthenticated requests', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: null });

    const response = await POST(makeRequest({ messageId: 'm1', vote: 'up' }));

    expect(response.status).toBe(401);
    expect(mockUpsertChatMessageVote).not.toHaveBeenCalled();
  });

  it('rejects invalid payloads', async () => {
    const response = await POST(
      makeRequest({ messageId: '', vote: 'sideways' })
    );

    expect(response.status).toBe(400);
    expect(mockUpsertChatMessageVote).not.toHaveBeenCalled();
  });

  it('persists a vote with server-resolved model from the owned turn', async () => {
    mockChatTurnsFindFirst.mockResolvedValue({
      id: TURN_ID,
      userId: 'user-uuid-1',
      conversationId: CONVERSATION_ID,
      model: 'anthropic/claude-sonnet-4.5',
    });

    const response = await POST(
      makeRequest({
        messageId: 'm1',
        vote: 'up',
        turnId: TURN_ID,
        toolCallId: 'call-1',
        toolName: 'createMerch',
        modelUsed: 'client-spoofed-model',
      })
    );

    expect(response.status).toBe(200);
    expect(mockUpsertChatMessageVote).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-uuid-1',
        messageId: 'm1',
        vote: 'up',
        turnId: TURN_ID,
        conversationId: CONVERSATION_ID,
        toolCallId: 'call-1',
        toolName: 'createMerch',
        modelUsed: 'anthropic/claude-sonnet-4.5',
        plan: 'pro',
      })
    );
  });

  it('ignores a turn belonging to another user', async () => {
    mockChatTurnsFindFirst.mockResolvedValue({
      id: TURN_ID,
      userId: 'someone-else',
      conversationId: CONVERSATION_ID,
      model: 'anthropic/claude-sonnet-4.5',
    });

    const response = await POST(
      makeRequest({
        messageId: 'm1',
        vote: 'down',
        turnId: TURN_ID,
        modelUsed: 'client-fallback-model',
      })
    );

    expect(response.status).toBe(200);
    expect(mockUpsertChatMessageVote).toHaveBeenCalledWith(
      expect.objectContaining({
        turnId: null,
        modelUsed: 'client-fallback-model',
      })
    );
  });

  it('deletes the vote when vote is null (undo)', async () => {
    const response = await POST(
      makeRequest({ messageId: 'm1', vote: null, toolCallId: 'call-1' })
    );

    expect(response.status).toBe(200);
    expect(mockDeleteChatMessageVote).toHaveBeenCalledWith({
      userId: 'user-uuid-1',
      messageId: 'm1',
      toolCallId: 'call-1',
    });
    expect(mockUpsertChatMessageVote).not.toHaveBeenCalled();
  });

  it('rate limits before persisting', async () => {
    mockLimit.mockResolvedValue({ success: false });

    const response = await POST(makeRequest({ messageId: 'm1', vote: 'up' }));

    expect(response.status).toBe(429);
    expect(mockUpsertChatMessageVote).not.toHaveBeenCalled();
  });
});
